import Foundation

// MARK: - @State

@propertyWrapper
public struct State<Value>: _DynamicProperty {
    final class Link {
        let initial: Value
        var box: StateBox?
        weak var ctx: RenderContext?
        init(_ v: Value) { initial = v }
    }
    let link: Link

    public init(wrappedValue: Value) { link = Link(wrappedValue) }
    public init(initialValue: Value) { link = Link(initialValue) }

    public var wrappedValue: Value {
        get { (link.box?.value as? Value) ?? link.initial }
        nonmutating set {
            if let box = link.box { box.value = newValue } else { link.box = StateBox(newValue) }
            if PreviewHost.trace { PreviewHost.log("[trace] State set \(newValue) box=\(link.box.map { ObjectIdentifier($0).hashValue } ?? 0)") }
            (link.ctx ?? RenderContext.current)?.invalidate()
        }
    }

    public var projectedValue: Binding<Value> {
        Binding(get: { self.wrappedValue }, set: { self.wrappedValue = $0 })
    }

    public func _link(storage: NodeStorage, label: String, ctx: RenderContext) {
        link.ctx = ctx
        if let existing = storage.states[label] {
            link.box = existing
        } else {
            let box = StateBox(link.box?.value ?? link.initial)
            storage.states[label] = box
            link.box = box
        }
        if PreviewHost.trace { PreviewHost.log("[trace] State link \(label)@\(ctx.pathKey) box=\(ObjectIdentifier(link.box!).hashValue) value=\(link.box!.value)") }
    }
}

extension State where Value: ExpressibleByNilLiteral {
    public init() { self.init(wrappedValue: nil) }
}

// MARK: - Binding

@propertyWrapper
@dynamicMemberLookup
public struct Binding<Value> {
    let getter: () -> Value
    let setter: (Value) -> Void

    public init(get: @escaping () -> Value, set: @escaping (Value) -> Void) {
        getter = get
        setter = set
    }

    public var wrappedValue: Value {
        get { getter() }
        nonmutating set { setter(newValue) }
    }
    public var projectedValue: Binding<Value> { self }

    public static func constant(_ value: Value) -> Binding<Value> { Binding(get: { value }, set: { _ in }) }

    /// Key-path projection: `$model.name`
    public subscript<T>(dynamicMember keyPath: WritableKeyPath<Value, T>) -> Binding<T> {
        Binding<T>(get: { self.wrappedValue[keyPath: keyPath] }, set: { self.wrappedValue[keyPath: keyPath] = $0 })
    }
}

extension Binding: @unchecked Sendable {}

extension Binding {
    public init<V>(_ base: Binding<V>) where Value == V? {
        self.init(get: { base.wrappedValue }, set: { if let v = $0 { base.wrappedValue = v } })
    }
    public init?(_ base: Binding<Value?>) {
        guard let initial = base.wrappedValue else { return nil }
        self.init(get: { base.wrappedValue ?? initial }, set: { base.wrappedValue = $0 })
    }
}

// MARK: - ObservableObject / @Published (Combine-free)

public final class ObservableObjectPublisher {
    var subscribers: [UUID: () -> Void] = [:]
    public init() {}
    public func send() { for s in subscribers.values { s() } }
    @discardableResult
    func subscribe(_ f: @escaping () -> Void) -> UUID {
        let id = UUID()
        subscribers[id] = f
        return id
    }
}

public protocol ObservableObject: AnyObject {
    var objectWillChange: ObservableObjectPublisher { get }
}

private var publisherTable: [ObjectIdentifier: ObservableObjectPublisher] = [:]
private let publisherLock = NSLock()

extension ObservableObject {
    public var objectWillChange: ObservableObjectPublisher {
        publisherLock.lock()
        defer { publisherLock.unlock() }
        let key = ObjectIdentifier(self)
        if let p = publisherTable[key] { return p }
        let p = ObservableObjectPublisher()
        publisherTable[key] = p
        return p
    }
}

@propertyWrapper
public struct Published<Value> {
    var value: Value
    public init(wrappedValue: Value) { value = wrappedValue }
    public init(initialValue: Value) { value = initialValue }

    @available(*, unavailable, message: "@Published is only available on properties of classes")
    public var wrappedValue: Value {
        get { fatalError() }
        set { fatalError() }
    }

    public static subscript<T: ObservableObject>(
        _enclosingInstance object: T,
        wrapped wrappedKeyPath: ReferenceWritableKeyPath<T, Value>,
        storage storageKeyPath: ReferenceWritableKeyPath<T, Published<Value>>
    ) -> Value {
        get { object[keyPath: storageKeyPath].value }
        set {
            object.objectWillChange.send()
            object[keyPath: storageKeyPath].value = newValue
        }
    }

    public struct Publisher {
        let object: AnyObject?
        public func sink(receiveValue: @escaping (Value) -> Void) -> AnyCancellable { AnyCancellable {} }
    }
    public var projectedValue: Publisher { Publisher(object: nil) }
}

public final class AnyCancellable {
    let cancelFn: () -> Void
    public init(_ cancel: @escaping () -> Void) { cancelFn = cancel }
    public func cancel() { cancelFn() }
    public func store(in set: inout Set<AnyCancellable>) { set.insert(self) }
}
extension AnyCancellable: Hashable {
    public static func == (a: AnyCancellable, b: AnyCancellable) -> Bool { a === b }
    public func hash(into h: inout Hasher) { h.combine(ObjectIdentifier(self)) }
}

func observe(_ object: AnyObject, ctx: RenderContext, storage: NodeStorage, key: String) {
    guard let obs = object as? any ObservableObject else { return }
    let subKey = "sub:\(key):\(ObjectIdentifier(object).hashValue)"
    if storage.values[subKey] != nil { return }
    obs.objectWillChange.subscribe { [weak ctx] in ctx?.invalidate() }
    storage.values[subKey] = true
}

// MARK: - @StateObject / @ObservedObject

@propertyWrapper
public struct StateObject<ObjectType: ObservableObject>: _DynamicProperty {
    final class Link {
        let make: () -> ObjectType
        var object: ObjectType?
        init(_ make: @escaping () -> ObjectType) { self.make = make }
    }
    let link: Link

    public init(wrappedValue thunk: @autoclosure @escaping () -> ObjectType) { link = Link(thunk) }

    public var wrappedValue: ObjectType {
        if let o = link.object { return o }
        let o = link.make()
        link.object = o
        return o
    }
    public var projectedValue: ObservedObject<ObjectType>.Wrapper { .init(object: wrappedValue) }

    public func _link(storage: NodeStorage, label: String, ctx: RenderContext) {
        if let existing = storage.objects[label] as? ObjectType {
            link.object = existing
        } else {
            let o = link.object ?? link.make()
            storage.objects[label] = o
            link.object = o
        }
        observe(link.object!, ctx: ctx, storage: storage, key: label)
    }
}

@propertyWrapper
public struct ObservedObject<ObjectType: ObservableObject>: _DynamicProperty {
    public var wrappedValue: ObjectType
    public init(wrappedValue: ObjectType) { self.wrappedValue = wrappedValue }
    public init(initialValue: ObjectType) { wrappedValue = initialValue }

    @dynamicMemberLookup
    public struct Wrapper {
        let object: ObjectType
        public subscript<T>(dynamicMember keyPath: ReferenceWritableKeyPath<ObjectType, T>) -> Binding<T> {
            Binding(get: { object[keyPath: keyPath] }, set: { object[keyPath: keyPath] = $0 })
        }
    }
    public var projectedValue: Wrapper { Wrapper(object: wrappedValue) }

    public func _link(storage: NodeStorage, label: String, ctx: RenderContext) {
        observe(wrappedValue, ctx: ctx, storage: storage, key: label)
    }
}

@propertyWrapper
public struct EnvironmentObject<ObjectType: ObservableObject>: _DynamicProperty {
    final class Link { var object: ObjectType? }
    let link = Link()
    public init() {}
    public var wrappedValue: ObjectType {
        guard let o = link.object ?? RenderContext.current?.environment.objects[ObjectIdentifier(ObjectType.self)] as? ObjectType else {
            fatalError("No @EnvironmentObject of type \(ObjectType.self) found. Inject it with .environmentObject(_:).")
        }
        return o
    }
    public var projectedValue: ObservedObject<ObjectType>.Wrapper { .init(object: wrappedValue) }
    public func _link(storage: NodeStorage, label: String, ctx: RenderContext) {
        link.object = ctx.environment.objects[ObjectIdentifier(ObjectType.self)] as? ObjectType
        if let o = link.object { observe(o, ctx: ctx, storage: storage, key: label) }
    }
}

// MARK: - Environment

public struct DismissAction {
    let action: () -> Void
    public func callAsFunction() { action() }
}

public struct OpenURLAction {
    let action: (URL) -> Void
    public func callAsFunction(_ url: URL) { action(url) }
}

public struct EnvironmentValues {
    public var colorScheme: ColorScheme = .light
    public var layoutDirection: LayoutDirection = .leftToRight
    public var dismiss = DismissAction { }
    public var openURL = OpenURLAction { _ in }
    public var isEnabled = true
    public var font: Font? = nil
    public var dynamicTypeSize: DynamicTypeSize = .large
    public var horizontalSizeClass: UserInterfaceSizeClass? = .compact
    public var verticalSizeClass: UserInterfaceSizeClass? = .regular
    public var locale = Locale.current
    public var calendar = Calendar.current
    public var timeZone = TimeZone.current
    public var scenePhase: ScenePhase = .active
    public var editMode: Binding<EditMode>? = nil
    public var accessibilityReduceMotion = false
    var objects: [ObjectIdentifier: AnyObject] = [:]
    var custom: [ObjectIdentifier: Any] = [:]

    public init() {}

    public subscript<K: EnvironmentKey>(key: K.Type) -> K.Value {
        get { (custom[ObjectIdentifier(key)] as? K.Value) ?? K.defaultValue }
        set { custom[ObjectIdentifier(key)] = newValue }
    }
}

public protocol EnvironmentKey {
    associatedtype Value
    static var defaultValue: Value { get }
}

public enum DynamicTypeSize: Int, Comparable, CaseIterable, Hashable {
    case xSmall, small, medium, large, xLarge, xxLarge, xxxLarge, accessibility1, accessibility2, accessibility3, accessibility4, accessibility5
    public static func < (a: DynamicTypeSize, b: DynamicTypeSize) -> Bool { a.rawValue < b.rawValue }
    public var isAccessibilitySize: Bool { rawValue >= DynamicTypeSize.accessibility1.rawValue }
}
public enum UserInterfaceSizeClass: Hashable { case compact, regular }
public enum ScenePhase: Hashable { case active, inactive, background }
public enum EditMode: Hashable {
    case active, inactive, transient
    public var isEditing: Bool { self != .inactive }
}

@propertyWrapper
public struct Environment<Value>: _DynamicProperty {
    final class Link { var value: Value? }
    let keyPath: KeyPath<EnvironmentValues, Value>
    let link = Link()
    public init(_ keyPath: KeyPath<EnvironmentValues, Value>) { self.keyPath = keyPath }
    public var wrappedValue: Value {
        link.value ?? (RenderContext.current?.environment ?? EnvironmentValues())[keyPath: keyPath]
    }
    public func _link(storage: NodeStorage, label: String, ctx: RenderContext) {
        link.value = ctx.environment[keyPath: keyPath]
    }
}

// MARK: - @AppStorage / @SceneStorage (in-memory for previews)

private var appStorageTable: [String: Any] = [:]

@propertyWrapper
public struct AppStorage<Value>: _DynamicProperty {
    let key: String
    let initial: Value
    weak var ctxRef: RenderContext?
    public init(wrappedValue: Value, _ key: String, store: UserDefaults? = nil) {
        self.key = key
        initial = wrappedValue
    }
    public var wrappedValue: Value {
        get { (appStorageTable[key] as? Value) ?? initial }
        nonmutating set {
            appStorageTable[key] = newValue
            RenderContext.current?.invalidate()
        }
    }
    public var projectedValue: Binding<Value> { Binding(get: { wrappedValue }, set: { wrappedValue = $0 }) }
    public func _link(storage: NodeStorage, label: String, ctx: RenderContext) {}
}

@propertyWrapper
public struct SceneStorage<Value>: _DynamicProperty {
    let key: String
    let initial: Value
    public init(wrappedValue: Value, _ key: String) {
        self.key = "scene:" + key
        initial = wrappedValue
    }
    public var wrappedValue: Value {
        get { (appStorageTable[key] as? Value) ?? initial }
        nonmutating set {
            appStorageTable[key] = newValue
            RenderContext.current?.invalidate()
        }
    }
    public var projectedValue: Binding<Value> { Binding(get: { wrappedValue }, set: { wrappedValue = $0 }) }
    public func _link(storage: NodeStorage, label: String, ctx: RenderContext) {}
}

// MARK: - FocusState (accepted; focus is managed by the host)

@propertyWrapper
public struct FocusState<Value: Hashable>: _DynamicProperty {
    final class Link { var value: Value? }
    let link = Link()
    let nilValue: Value?
    public init() where Value == Bool { nilValue = false }
    public init<T: Hashable>() where Value == T? { nilValue = .some(nil) }
    public var wrappedValue: Value {
        get { link.value ?? nilValue! }
        nonmutating set { link.value = newValue }
    }
    public var projectedValue: Binding<Value> { Binding(get: { wrappedValue }, set: { wrappedValue = $0 }) }
    public func _link(storage: NodeStorage, label: String, ctx: RenderContext) {}
}
