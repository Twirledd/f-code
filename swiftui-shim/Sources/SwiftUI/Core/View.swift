// SwiftUI re-exports Foundation on Apple platforms, so app code can use UUID, Date, URL… with a single import.
@_exported import Foundation

// MARK: - View protocol

public protocol View {
    associatedtype Body: View
    @ViewBuilder var body: Body { get }
}

extension Never: View {
    public var body: Never { fatalError("Never has no body") }
}

/// Views the renderer knows how to emit directly. Everything else is composed from these.
public protocol _PrimitiveView {
    func _render(_ ctx: RenderContext) -> RenderNode
}

extension View where Body == Never {
    public var body: Never { fatalError("\(Self.self) is a primitive view") }
}

// MARK: - Result builder

@resultBuilder
public enum ViewBuilder {
    public static func buildBlock() -> EmptyView { EmptyView() }
    public static func buildBlock<C: View>(_ c: C) -> C { c }
    public static func buildBlock<C0: View, C1: View>(_ c0: C0, _ c1: C1) -> TupleView<(C0, C1)> { TupleView((c0, c1)) }
    public static func buildBlock<C0: View, C1: View, C2: View>(_ c0: C0, _ c1: C1, _ c2: C2) -> TupleView<(C0, C1, C2)> { TupleView((c0, c1, c2)) }
    public static func buildBlock<C0: View, C1: View, C2: View, C3: View>(_ c0: C0, _ c1: C1, _ c2: C2, _ c3: C3) -> TupleView<(C0, C1, C2, C3)> { TupleView((c0, c1, c2, c3)) }
    public static func buildBlock<C0: View, C1: View, C2: View, C3: View, C4: View>(_ c0: C0, _ c1: C1, _ c2: C2, _ c3: C3, _ c4: C4) -> TupleView<(C0, C1, C2, C3, C4)> { TupleView((c0, c1, c2, c3, c4)) }
    public static func buildBlock<C0: View, C1: View, C2: View, C3: View, C4: View, C5: View>(_ c0: C0, _ c1: C1, _ c2: C2, _ c3: C3, _ c4: C4, _ c5: C5) -> TupleView<(C0, C1, C2, C3, C4, C5)> { TupleView((c0, c1, c2, c3, c4, c5)) }
    public static func buildBlock<C0: View, C1: View, C2: View, C3: View, C4: View, C5: View, C6: View>(_ c0: C0, _ c1: C1, _ c2: C2, _ c3: C3, _ c4: C4, _ c5: C5, _ c6: C6) -> TupleView<(C0, C1, C2, C3, C4, C5, C6)> { TupleView((c0, c1, c2, c3, c4, c5, c6)) }
    public static func buildBlock<C0: View, C1: View, C2: View, C3: View, C4: View, C5: View, C6: View, C7: View>(_ c0: C0, _ c1: C1, _ c2: C2, _ c3: C3, _ c4: C4, _ c5: C5, _ c6: C6, _ c7: C7) -> TupleView<(C0, C1, C2, C3, C4, C5, C6, C7)> { TupleView((c0, c1, c2, c3, c4, c5, c6, c7)) }
    public static func buildBlock<C0: View, C1: View, C2: View, C3: View, C4: View, C5: View, C6: View, C7: View, C8: View>(_ c0: C0, _ c1: C1, _ c2: C2, _ c3: C3, _ c4: C4, _ c5: C5, _ c6: C6, _ c7: C7, _ c8: C8) -> TupleView<(C0, C1, C2, C3, C4, C5, C6, C7, C8)> { TupleView((c0, c1, c2, c3, c4, c5, c6, c7, c8)) }
    public static func buildBlock<C0: View, C1: View, C2: View, C3: View, C4: View, C5: View, C6: View, C7: View, C8: View, C9: View>(_ c0: C0, _ c1: C1, _ c2: C2, _ c3: C3, _ c4: C4, _ c5: C5, _ c6: C6, _ c7: C7, _ c8: C8, _ c9: C9) -> TupleView<(C0, C1, C2, C3, C4, C5, C6, C7, C8, C9)> { TupleView((c0, c1, c2, c3, c4, c5, c6, c7, c8, c9)) }

    public static func buildExpression<C: View>(_ c: C) -> C { c }
    public static func buildOptional<C: View>(_ c: C?) -> C? { c }
    public static func buildIf<C: View>(_ c: C?) -> C? { c }
    public static func buildEither<T: View, F: View>(first: T) -> _ConditionalContent<T, F> { _ConditionalContent(storage: .trueContent(first)) }
    public static func buildEither<T: View, F: View>(second: F) -> _ConditionalContent<T, F> { _ConditionalContent(storage: .falseContent(second)) }
    public static func buildArray<C: View>(_ cs: [C]) -> _ArrayView<C> { _ArrayView(views: cs) }
    public static func buildLimitedAvailability<C: View>(_ c: C) -> AnyView { AnyView(c) }
}

// MARK: - Structural views

public struct TupleView<T>: View, _PrimitiveView {
    public var value: T
    public init(_ value: T) { self.value = value }
    public typealias Body = Never

    public func _render(_ ctx: RenderContext) -> RenderNode {
        let group = RenderNode(type: "group")
        for (i, child) in Mirror(reflecting: value).children.enumerated() {
            if let v = child.value as? any View {
                ctx.withPath("\(i)") { group.children.append(contentsOf: ctx.renderFlattened(v)) }
            }
        }
        return group
    }
}

public struct _ConditionalContent<TrueContent: View, FalseContent: View>: View, _PrimitiveView {
    enum Storage { case trueContent(TrueContent), falseContent(FalseContent) }
    let storage: Storage
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        switch storage {
        case .trueContent(let v): return ctx.withPath("if") { ctx.render(v) }
        case .falseContent(let v): return ctx.withPath("else") { ctx.render(v) }
        }
    }
}

extension Optional: View, _PrimitiveView where Wrapped: View {
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        switch self {
        case .some(let v): return ctx.withPath("some") { ctx.render(v) }
        case .none: return RenderNode(type: "empty")
        }
    }
}

public struct _ArrayView<C: View>: View, _PrimitiveView {
    let views: [C]
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let group = RenderNode(type: "group")
        for (i, v) in views.enumerated() {
            ctx.withPath("[\(i)]") { group.children.append(contentsOf: ctx.renderFlattened(v)) }
        }
        return group
    }
}

public struct EmptyView: View, _PrimitiveView {
    public init() {}
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode { RenderNode(type: "empty") }
}

public struct AnyView: View, _PrimitiveView {
    let renderer: (RenderContext) -> RenderNode
    let typeName: String
    public init<V: View>(_ view: V) {
        typeName = String(describing: V.self)
        renderer = { ctx in ctx.render(view) }
    }
    public init<V: View>(erasing view: V) { self.init(view) }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode { ctx.withPath("Any<\(typeName)>") { renderer(ctx) } }
}

public struct Group<Content: View>: View {
    let content: Content
    public init(@ViewBuilder content: () -> Content) { self.content = content() }
    public var body: some View { content }
}

/// `ForEach` over Identifiable data, explicit key paths, or ranges.
public struct ForEach<Data: RandomAccessCollection, ID: Hashable, Content: View>: View, _PrimitiveView {
    let data: Data
    let id: (Data.Element) -> ID
    let content: (Data.Element) -> Content
    public typealias Body = Never

    public init(_ data: Data, id: KeyPath<Data.Element, ID>, @ViewBuilder content: @escaping (Data.Element) -> Content) {
        self.data = data
        self.id = { $0[keyPath: id] }
        self.content = content
    }

    public func _render(_ ctx: RenderContext) -> RenderNode {
        let group = RenderNode(type: "group")
        for element in data {
            let key = String(describing: id(element))
            ctx.withPath("#\(key)") {
                let rendered = ctx.renderFlattened(content(element))
                for n in rendered where n.props["rowID"] == nil { n.props["rowID"] = .string(key) }
                group.children.append(contentsOf: rendered)
            }
        }
        return group
    }
}

extension ForEach where Data.Element: Identifiable, ID == Data.Element.ID {
    public init(_ data: Data, @ViewBuilder content: @escaping (Data.Element) -> Content) {
        self.data = data
        self.id = { $0.id }
        self.content = content
    }
}

extension ForEach where Data == Range<Int>, ID == Int {
    public init(_ data: Range<Int>, @ViewBuilder content: @escaping (Int) -> Content) {
        self.data = data
        self.id = { $0 }
        self.content = content
    }
}

extension ForEach where Data == ClosedRange<Int>, ID == Int {
    public init(_ data: ClosedRange<Int>, @ViewBuilder content: @escaping (Int) -> Content) {
        self.data = data
        self.id = { $0 }
        self.content = content
    }
}

// MARK: - Modifier plumbing

/// A node-level modifier record: `kind` plus arbitrary JSON args, applied by the renderer in order.
public struct _Modifier {
    public var kind: String
    public var args: JSON
    public init(_ kind: String, _ args: JSON = [:]) {
        self.kind = kind
        self.args = args
    }
}

/// Modifiers that need to run Swift logic at render time (state, environment, handlers).
public protocol _RenderModifier {
    func _apply(to node: RenderNode, ctx: RenderContext)
}

public struct ModifiedContent<Content: View>: View, _PrimitiveView {
    let content: Content
    let modifier: _Modifier?
    let renderModifier: _RenderModifier?
    let environment: ((inout EnvironmentValues) -> Void)?

    init(content: Content, modifier: _Modifier) {
        self.content = content; self.modifier = modifier; renderModifier = nil; environment = nil
    }
    init(content: Content, renderModifier: _RenderModifier) {
        self.content = content; modifier = nil; self.renderModifier = renderModifier; environment = nil
    }
    init(content: Content, environment: @escaping (inout EnvironmentValues) -> Void) {
        self.content = content; modifier = nil; renderModifier = nil; self.environment = environment
    }

    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node: RenderNode
        if let env = environment {
            node = ctx.withEnvironment(env) { ctx.render(content) }
        } else {
            node = ctx.render(content)
        }
        if let m = modifier { node.modifiers.append(m) }
        if let rm = renderModifier { rm._apply(to: node, ctx: ctx) }
        return node
    }
}

extension View {
    public func _mod(_ kind: String, _ args: JSON = [:]) -> ModifiedContent<Self> {
        ModifiedContent(content: self, modifier: _Modifier(kind, args))
    }
    func _renderMod(_ m: _RenderModifier) -> ModifiedContent<Self> {
        ModifiedContent(content: self, renderModifier: m)
    }
    public func _env(_ f: @escaping (inout EnvironmentValues) -> Void) -> ModifiedContent<Self> {
        ModifiedContent(content: self, environment: f)
    }
}

// MARK: - ViewModifier (user-defined)

public protocol ViewModifier {
    associatedtype Body: View
    typealias Content = _ViewModifierContent
    @ViewBuilder func body(content: Content) -> Body
}

public struct _ViewModifierContent: View, _PrimitiveView {
    let renderer: (RenderContext) -> RenderNode
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode { renderer(ctx) }
}

public struct _UserModified<Content: View, M: ViewModifier>: View, _PrimitiveView {
    let content: Content
    let modifier: M
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let inner = _ViewModifierContent(renderer: { ctx in ctx.withPath("content") { ctx.render(content) } })
        ctx.linkDynamicProperties(of: modifier)
        return ctx.withPath(String(describing: M.self)) { ctx.render(modifier.body(content: inner)) }
    }
}

extension View {
    public func modifier<M: ViewModifier>(_ m: M) -> _UserModified<Self, M> { _UserModified(content: self, modifier: m) }
}

// MARK: - Preview support (no-ops so code with #Preview / PreviewProvider compiles)

public protocol PreviewProvider {
    associatedtype Previews: View
    @ViewBuilder static var previews: Previews { get }
}

public struct PreviewDevice: ExpressibleByStringLiteral {
    public var rawValue: String
    public init(rawValue: String) { self.rawValue = rawValue }
    public init(stringLiteral value: String) { rawValue = value }
}
