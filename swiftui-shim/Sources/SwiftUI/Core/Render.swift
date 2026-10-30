import Foundation

// MARK: - Render tree

public final class RenderNode {
    public var type: String
    public var props: [String: JSON] = [:]
    public var modifiers: [_Modifier] = []
    public var children: [RenderNode] = []
    /// Stable identity (the structural path). Set when a node has handlers or state the host must address.
    public var id: String?

    public init(type: String, props: [String: JSON] = [:]) {
        self.type = type
        self.props = props
    }

    public var json: JSON {
        var o: [String: JSON] = ["t": .string(type)]
        if !props.isEmpty { o["p"] = .object(props) }
        if let id = id { o["id"] = .string(id) }
        if !modifiers.isEmpty { o["m"] = .array(modifiers.map { ["k": .string($0.kind), "a": $0.args] }) }
        if !children.isEmpty { o["c"] = .array(children.map { $0.json }) }
        return .object(o)
    }
}

// MARK: - Per-identity storage

public final class NodeStorage {
    var states: [String: StateBox] = [:]
    var objects: [String: AnyObject] = [:]
    var values: [String: Any] = [:]
    var appeared = false
}

public final class StateBox {
    var value: Any
    init(_ value: Any) { self.value = value }
}

/// A property wrapper that participates in the render lifecycle (`@State`, `@StateObject`, `@Environment`, …).
public protocol _DynamicProperty {
    func _link(storage: NodeStorage, label: String, ctx: RenderContext)
}

// MARK: - Render context

public final class RenderContext {
    public static var current: RenderContext?

    var path: [String] = []
    var storage: [String: NodeStorage] = [:]
    var handlers: [String: (JSON) -> Void] = [:]
    var environmentStack: [EnvironmentValues] = [EnvironmentValues()]
    var onAppear: [(String, () -> Void)] = []
    var tasks: [(String, () async -> Void)] = []
    var startedTasks: Set<String> = []

    let lock = NSLock()
    let wakeup = NSCondition()
    var needsRender = true
    var pendingEvents: [JSON] = []

    public var environment: EnvironmentValues { environmentStack.last! }
    public var pathKey: String { path.joined(separator: "/") }

    // -- identity & scoping --------------------------------------------------

    @discardableResult
    public func withPath<T>(_ segment: String, _ body: () -> T) -> T {
        path.append(segment)
        defer { path.removeLast() }
        return body()
    }

    public func withEnvironment<T>(_ change: (inout EnvironmentValues) -> Void, _ body: () -> T) -> T {
        var env = environment
        change(&env)
        environmentStack.append(env)
        defer { environmentStack.removeLast() }
        return body()
    }

    public func storage(for key: String) -> NodeStorage {
        if let s = storage[key] { return s }
        let s = NodeStorage()
        storage[key] = s
        return s
    }

    public func currentStorage() -> NodeStorage { storage(for: pathKey) }

    // -- rendering -----------------------------------------------------------

    public func render<V: View>(_ view: V) -> RenderNode {
        if let p = view as? _PrimitiveView {
            return p._render(self)
        }
        return withPath(String(describing: V.self)) {
            linkDynamicProperties(of: view)
            return render(view.body)
        }
    }

    /// Render and splat `group`/`empty` nodes so containers see their logical children.
    public func renderFlattened<V: View>(_ view: V) -> [RenderNode] {
        flatten(render(view))
    }

    func flatten(_ node: RenderNode) -> [RenderNode] {
        if node.type == "group", node.modifiers.isEmpty { return node.children.flatMap(flatten) }
        if node.type == "empty", node.modifiers.isEmpty { return [] }
        return [node]
    }

    /// Reflect over a value and connect its dynamic properties to persistent storage for this identity.
    public func linkDynamicProperties<T>(of value: T) {
        let store = currentStorage()
        for child in Mirror(reflecting: value).children {
            guard let label = child.label else { continue }
            if let dp = child.value as? _DynamicProperty {
                dp._link(storage: store, label: label, ctx: self)
            }
        }
    }

    // -- handlers & events ---------------------------------------------------

    public func register(_ node: RenderNode, _ event: String, _ handler: @escaping (JSON) -> Void) {
        let id = node.id ?? pathKey
        node.id = id
        handlers["\(id)|\(event)"] = handler
    }

    public func invalidate() {
        wakeup.lock()
        needsRender = true
        wakeup.signal()
        wakeup.unlock()
    }

    func enqueue(_ event: JSON) {
        wakeup.lock()
        pendingEvents.append(event)
        wakeup.signal()
        wakeup.unlock()
    }

    func dispatch(_ event: JSON) {
        guard let id = event["id"].stringValue, let kind = event["kind"].stringValue else { return }
        if let h = handlers["\(id)|\(kind)"] {
            h(event["value"])
        } else {
            PreviewHost.log("[preview] no handler for \(kind) on \(id)")
        }
    }
}
