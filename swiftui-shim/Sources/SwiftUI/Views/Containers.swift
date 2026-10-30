import Foundation

// MARK: - List / Section / Form

public struct List<SelectionValue: Hashable, Content: View>: View, _PrimitiveView {
    let content: Content
    let selection: Binding<SelectionValue?>?

    public init(@ViewBuilder content: () -> Content) where SelectionValue == Never {
        self.content = content()
        selection = nil
    }
    public init(selection: Binding<SelectionValue?>?, @ViewBuilder content: () -> Content) {
        self.content = content()
        self.selection = selection
    }
    public init(selection: Binding<Set<SelectionValue>>, @ViewBuilder content: () -> Content) {
        self.content = content()
        self.selection = nil
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "list")
        node.children = ctx.renderFlattened(content)
        return node
    }
}

extension List where SelectionValue == Never {
    public init<Data: RandomAccessCollection, RowContent: View>(_ data: Data, @ViewBuilder rowContent: @escaping (Data.Element) -> RowContent)
    where Content == ForEach<Data, Data.Element.ID, RowContent>, Data.Element: Identifiable {
        content = ForEach(data, content: rowContent)
        selection = nil
    }
    public init<Data: RandomAccessCollection, ID: Hashable, RowContent: View>(_ data: Data, id: KeyPath<Data.Element, ID>, @ViewBuilder rowContent: @escaping (Data.Element) -> RowContent)
    where Content == ForEach<Data, ID, RowContent> {
        content = ForEach(data, id: id, content: rowContent)
        selection = nil
    }
    public init<RowContent: View>(_ data: Range<Int>, @ViewBuilder rowContent: @escaping (Int) -> RowContent) where Content == ForEach<Range<Int>, Int, RowContent> {
        content = ForEach(data, content: rowContent)
        selection = nil
    }
}

public struct Section<Parent: View, Content: View, Footer: View>: View, _PrimitiveView {
    let header: Parent?
    let footer: Footer?
    let content: Content
    public init(@ViewBuilder content: () -> Content, @ViewBuilder header: () -> Parent, @ViewBuilder footer: () -> Footer) {
        self.content = content(); self.header = header(); self.footer = footer()
    }
    public init(@ViewBuilder content: () -> Content, @ViewBuilder header: () -> Parent) where Footer == EmptyView {
        self.content = content(); self.header = header(); footer = nil
    }
    public init(@ViewBuilder content: () -> Content, @ViewBuilder footer: () -> Footer) where Parent == EmptyView {
        self.content = content(); header = nil; self.footer = footer()
    }
    public init(@ViewBuilder content: () -> Content) where Parent == EmptyView, Footer == EmptyView {
        self.content = content(); header = nil; footer = nil
    }
    public init(header: Parent, @ViewBuilder content: () -> Content) where Footer == EmptyView {
        self.content = content(); self.header = header; footer = nil
    }
    public init(header: Parent, footer: Footer, @ViewBuilder content: () -> Content) {
        self.content = content(); self.header = header; self.footer = footer
    }
    public init(_ title: String, @ViewBuilder content: () -> Content) where Parent == Text, Footer == EmptyView {
        self.content = content(); header = Text(title); footer = nil
    }
    public init(_ title: LocalizedStringKey, @ViewBuilder content: () -> Content) where Parent == Text, Footer == EmptyView {
        self.content = content(); header = Text(title.key); footer = nil
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "section")
        if let h = header { node.props["hasHeader"] = true; node.children.append(ctx.withPath("header") { ctx.render(h) }) }
        else { node.children.append(RenderNode(type: "empty")) }
        if let f = footer { node.props["hasFooter"] = true; node.children.append(ctx.withPath("footer") { ctx.render(f) }) }
        else { node.children.append(RenderNode(type: "empty")) }
        node.children += ctx.renderFlattened(content)
        return node
    }
}

public struct Form<Content: View>: View, _PrimitiveView {
    let content: Content
    public init(@ViewBuilder content: () -> Content) { self.content = content() }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "list", props: ["form": true])
        node.children = ctx.renderFlattened(content)
        return node
    }
}

public struct GroupBox<Label: View, Content: View>: View, _PrimitiveView {
    let label: Label?
    let content: Content
    public init(@ViewBuilder content: () -> Content, @ViewBuilder label: () -> Label) { self.content = content(); self.label = label() }
    public init(@ViewBuilder content: () -> Content) where Label == EmptyView { self.content = content(); label = nil }
    public init(_ title: String, @ViewBuilder content: () -> Content) where Label == Text { self.content = content(); label = Text(title) }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "groupbox")
        node.children.append(label.map { l in ctx.withPath("label") { ctx.render(l) } } ?? RenderNode(type: "empty"))
        node.children += ctx.renderFlattened(content)
        return node
    }
}

public struct DisclosureGroup<Label: View, Content: View>: View, _PrimitiveView {
    let label: Label
    let content: Content
    let isExpanded: Binding<Bool>?
    public init(isExpanded: Binding<Bool>, @ViewBuilder content: () -> Content, @ViewBuilder label: () -> Label) {
        self.isExpanded = isExpanded; self.content = content(); self.label = label()
    }
    public init(@ViewBuilder content: () -> Content, @ViewBuilder label: () -> Label) {
        isExpanded = nil; self.content = content(); self.label = label()
    }
    public init(_ title: String, isExpanded: Binding<Bool>, @ViewBuilder content: () -> Content) where Label == Text {
        self.isExpanded = isExpanded; self.content = content(); label = Text(title)
    }
    public init(_ title: String, @ViewBuilder content: () -> Content) where Label == Text {
        isExpanded = nil; self.content = content(); label = Text(title)
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let store = ctx.currentStorage()
        let expanded = isExpanded?.wrappedValue ?? (store.values["expanded"] as? Bool ?? false)
        let node = RenderNode(type: "disclosure", props: ["expanded": .bool(expanded)])
        ctx.register(node, "toggle") { _ in
            if let b = isExpanded { b.wrappedValue.toggle() } else { store.values["expanded"] = !expanded }
        }
        node.children.append(ctx.withPath("label") { ctx.render(label) })
        if expanded { node.children += ctx.withPath("content") { ctx.renderFlattened(content) } }
        return node
    }
}

// MARK: - Navigation

final class NavigationState {
    var stack: [(id: String, view: AnyView)] = []
}

public struct NavigationStack<Content: View>: View, _PrimitiveView {
    let content: Content
    let pathBinding: Binding<NavigationPath>?
    public init(@ViewBuilder root: () -> Content) { content = root(); pathBinding = nil }
    public init(path: Binding<NavigationPath>, @ViewBuilder root: () -> Content) { content = root(); pathBinding = path }
    public init<Data>(path: Binding<Data>, @ViewBuilder root: () -> Content) where Data: MutableCollection & RandomAccessCollection & RangeReplaceableCollection, Data.Element: Hashable {
        content = root()
        pathBinding = Binding(
            get: { NavigationPath(path.wrappedValue.map { AnyHashable($0) }) },
            set: { np in path.wrappedValue = Data(np.elements.compactMap { $0.base as? Data.Element }) }
        )
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let store = ctx.currentStorage()
        let nav = (store.values["nav"] as? NavigationState) ?? { let n = NavigationState(); store.values["nav"] = n; return n }()
        let node = RenderNode(type: "navstack")
        node.id = ctx.pathKey

        // Value-driven path: rebuild pushed pages from the binding each render.
        if let pb = pathBinding {
            var pages: [(id: String, view: AnyView)] = []
            for (i, v) in pb.wrappedValue.elements.enumerated() {
                let key = "\(i):\(String(describing: type(of: v.base)))"
                if let existing = nav.stack.first(where: { $0.id == key }) { pages.append(existing) }
                else if let dest = ctx.environment.destination(for: v.base) { pages.append((key, dest)) }
            }
            nav.stack = pages
        }

        ctx.register(node, "pop") { _ in
            if let pb = pathBinding { if !pb.wrappedValue.isEmpty { pb.wrappedValue.removeLast() } }
            else if !nav.stack.isEmpty { nav.stack.removeLast() }
        }

        let pop = { [weak ctx] in
            if let pb = pathBinding { if !pb.wrappedValue.isEmpty { pb.wrappedValue.removeLast() } }
            else if !nav.stack.isEmpty { nav.stack.removeLast() }
            ctx?.invalidate()
        }
        let push: (AnyView) -> Void = { [weak ctx] view in
            nav.stack.append((id: UUID().uuidString, view: view))
            ctx?.invalidate()
        }
        let pushValue: (AnyHashable) -> Void = { [weak ctx] value in
            if let pb = pathBinding { pb.wrappedValue.append(value) }
            else if let dest = ctx?.environment.destination(for: value.base) { nav.stack.append((id: UUID().uuidString, view: dest)) }
            ctx?.invalidate()
        }

        ctx.withEnvironment({ env in
            env.navigation = NavigationActions(push: push, pushValue: pushValue, pop: pop)
            env.dismiss = DismissAction(action: pop)
        }) {
            node.children.append(ctx.withPath("root") { RenderNode.page(ctx.render(content)) })
            for page in nav.stack {
                node.children.append(ctx.withPath("page:\(page.id)") { RenderNode.page(ctx.render(page.view)) })
            }
        }
        return node
    }
}

extension RenderNode {
    static func page(_ content: RenderNode) -> RenderNode {
        let p = RenderNode(type: "page")
        p.children = [content]
        return p
    }
}

public typealias NavigationView = NavigationStack

public struct NavigationActions {
    var push: (AnyView) -> Void = { _ in }
    var pushValue: (AnyHashable) -> Void = { _ in }
    var pop: () -> Void = {}
}

public struct NavigationPath {
    var elements: [AnyHashable]
    public init() { elements = [] }
    init(_ e: [AnyHashable]) { elements = e }
    public init<S: Sequence>(_ s: S) where S.Element: Hashable { elements = s.map { AnyHashable($0) } }
    public var count: Int { elements.count }
    public var isEmpty: Bool { elements.isEmpty }
    public mutating func append<V: Hashable>(_ v: V) { elements.append(AnyHashable(v)) }
    public mutating func removeLast(_ k: Int = 1) { elements.removeLast(min(k, elements.count)) }
}

public struct NavigationLink<Label: View, Destination: View>: View, _PrimitiveView {
    let label: Label
    let destination: (() -> AnyView)?
    let value: AnyHashable?

    public init(destination: Destination, @ViewBuilder label: () -> Label) {
        self.label = label()
        self.destination = { AnyView(destination) }
        value = nil
    }
    public init(@ViewBuilder destination: () -> Destination, @ViewBuilder label: () -> Label) {
        self.label = label()
        let d = destination()
        self.destination = { AnyView(d) }
        value = nil
    }
    public init(_ title: String, destination: Destination) where Label == Text {
        label = Text(title)
        self.destination = { AnyView(destination) }
        value = nil
    }
    public init(_ title: String, @ViewBuilder destination: () -> Destination) where Label == Text {
        label = Text(title)
        let d = destination()
        self.destination = { AnyView(d) }
        value = nil
    }
    public init<P: Hashable>(value: P?, @ViewBuilder label: () -> Label) where Destination == Never {
        self.label = label()
        destination = nil
        self.value = value.map { AnyHashable($0) }
    }
    public init<P: Hashable>(_ title: String, value: P?) where Label == Text, Destination == Never {
        label = Text(title)
        destination = nil
        self.value = value.map { AnyHashable($0) }
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "navlink")
        let nav = ctx.environment.navigation
        ctx.register(node, "tap") { _ in
            if let d = destination { nav.push(d()) }
            else if let v = value { nav.pushValue(v) }
        }
        node.children = [ctx.withPath("label") { ctx.render(label) }]
        return node
    }
}

// MARK: - TabView

public struct TabView<SelectionValue: Hashable, Content: View>: View, _PrimitiveView {
    let content: Content
    let selection: Binding<SelectionValue>?
    public init(@ViewBuilder content: () -> Content) where SelectionValue == Int {
        self.content = content()
        selection = nil
    }
    public init(selection: Binding<SelectionValue>?, @ViewBuilder content: () -> Content) {
        self.content = content()
        self.selection = selection
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let store = ctx.currentStorage()
        let node = RenderNode(type: "tabview")
        let tabs = ctx.renderFlattened(content)
        var tags: [AnyHashable] = []
        var selectedIndex = store.values["tab"] as? Int ?? 0
        for (i, t) in tabs.enumerated() {
            let tag = ctx.tagTable[t.id ?? ""] ?? AnyHashable(i)
            tags.append(tag)
            if let s = selection, tag == AnyHashable(s.wrappedValue) { selectedIndex = i }
        }
        node.props["selected"] = JSON(min(selectedIndex, max(tabs.count - 1, 0)))
        node.children = tabs
        ctx.register(node, "select") { v in
            guard let i = v.doubleValue.map(Int.init), i >= 0, i < tags.count else { return }
            store.values["tab"] = i
            if let s = selection, let t = tags[i].base as? SelectionValue { s.wrappedValue = t }
        }
        return node
    }
}

public struct TabViewStyleKind { var name: String }
public protocol TabViewStyle { var _name: String { get } }
public struct DefaultTabViewStyle: TabViewStyle { public init() {}; public var _name: String { "automatic" } }
public struct PageTabViewStyle: TabViewStyle {
    public enum IndexDisplayMode { case automatic, always, never }
    public init(indexDisplayMode: IndexDisplayMode = .automatic) {}
    public var _name: String { "page" }
}
extension TabViewStyle where Self == DefaultTabViewStyle { public static var automatic: DefaultTabViewStyle { .init() } }
extension TabViewStyle where Self == PageTabViewStyle {
    public static var page: PageTabViewStyle { .init() }
    public static func page(indexDisplayMode: PageTabViewStyle.IndexDisplayMode) -> PageTabViewStyle { .init(indexDisplayMode: indexDisplayMode) }
}

// MARK: - Environment extensions used by navigation & tags

extension EnvironmentValues {
    var navigation: NavigationActions {
        get { self[NavigationKey.self] }
        set { self[NavigationKey.self] = newValue }
    }
    var destinations: [String: (Any) -> AnyView] {
        get { self[DestinationKey.self] }
        set { self[DestinationKey.self] = newValue }
    }
    func destination(for value: Any) -> AnyView? {
        let key = String(describing: type(of: value))
        return destinations[key]?(value)
    }
}
struct NavigationKey: EnvironmentKey { static let defaultValue = NavigationActions() }
struct DestinationKey: EnvironmentKey { static let defaultValue: [String: (Any) -> AnyView] = [:] }

extension RenderContext {
    /// `.tag(_:)` values keyed by node id, consumed by Picker/TabView.
    var tagTable: [String: AnyHashable] {
        get { (storage(for: "__tags").values["t"] as? [String: AnyHashable]) ?? [:] }
        set { storage(for: "__tags").values["t"] = newValue }
    }
}

// MARK: - Sheets, alerts, popovers (render as overlays)

struct PresentationModifier: _RenderModifier {
    let kind: String
    let isPresented: Binding<Bool>
    let title: String?
    let content: () -> AnyView
    let onDismiss: (() -> Void)?

    func _apply(to node: RenderNode, ctx: RenderContext) {
        guard isPresented.wrappedValue else { return }
        let overlay = RenderNode(type: kind)
        if let t = title { overlay.props["title"] = .string(t) }
        overlay.id = ctx.pathKey + "/\(kind)"
        ctx.register(overlay, "dismiss") { _ in
            isPresented.wrappedValue = false
            onDismiss?()
        }
        ctx.withEnvironment({ env in
            env.dismiss = DismissAction { isPresented.wrappedValue = false; onDismiss?(); ctx.invalidate() }
        }) {
            overlay.children = ctx.withPath(kind) { ctx.renderFlattened(content()) }
        }
        node.modifiers.append(_Modifier("present", ["node": overlay.json]))
    }
}

extension View {
    public func sheet<Content: View>(isPresented: Binding<Bool>, onDismiss: (() -> Void)? = nil, @ViewBuilder content: @escaping () -> Content) -> ModifiedContent<Self> {
        _renderMod(PresentationModifier(kind: "sheet", isPresented: isPresented, title: nil, content: { AnyView(content()) }, onDismiss: onDismiss))
    }
    public func sheet<Item: Identifiable, Content: View>(item: Binding<Item?>, onDismiss: (() -> Void)? = nil, @ViewBuilder content: @escaping (Item) -> Content) -> ModifiedContent<Self> {
        let presented = Binding(get: { item.wrappedValue != nil }, set: { if !$0 { item.wrappedValue = nil } })
        return _renderMod(PresentationModifier(kind: "sheet", isPresented: presented, title: nil, content: {
            item.wrappedValue.map { AnyView(content($0)) } ?? AnyView(EmptyView())
        }, onDismiss: onDismiss))
    }
    public func fullScreenCover<Content: View>(isPresented: Binding<Bool>, onDismiss: (() -> Void)? = nil, @ViewBuilder content: @escaping () -> Content) -> ModifiedContent<Self> {
        _renderMod(PresentationModifier(kind: "cover", isPresented: isPresented, title: nil, content: { AnyView(content()) }, onDismiss: onDismiss))
    }
    public func popover<Content: View>(isPresented: Binding<Bool>, attachmentAnchor: Any? = nil, arrowEdge: Edge = .top, @ViewBuilder content: @escaping () -> Content) -> ModifiedContent<Self> {
        _renderMod(PresentationModifier(kind: "popover", isPresented: isPresented, title: nil, content: { AnyView(content()) }, onDismiss: nil))
    }
    public func alert<A: View>(_ title: String, isPresented: Binding<Bool>, @ViewBuilder actions: @escaping () -> A) -> ModifiedContent<Self> {
        _renderMod(PresentationModifier(kind: "alert", isPresented: isPresented, title: title, content: { AnyView(actions()) }, onDismiss: nil))
    }
    public func alert<A: View, M: View>(_ title: String, isPresented: Binding<Bool>, @ViewBuilder actions: @escaping () -> A, @ViewBuilder message: @escaping () -> M) -> ModifiedContent<Self> {
        _renderMod(PresentationModifier(kind: "alert", isPresented: isPresented, title: title, content: { AnyView(VStack { message(); actions() }) }, onDismiss: nil))
    }
    public func alert<A: View>(_ title: LocalizedStringKey, isPresented: Binding<Bool>, @ViewBuilder actions: @escaping () -> A) -> ModifiedContent<Self> {
        alert(title.key, isPresented: isPresented, actions: actions)
    }
    public func alert<A: View, M: View>(_ title: LocalizedStringKey, isPresented: Binding<Bool>, @ViewBuilder actions: @escaping () -> A, @ViewBuilder message: @escaping () -> M) -> ModifiedContent<Self> {
        alert(title.key, isPresented: isPresented, actions: actions, message: message)
    }
    public func confirmationDialog<A: View>(_ title: String, isPresented: Binding<Bool>, titleVisibility: Visibility = .automatic, @ViewBuilder actions: @escaping () -> A) -> ModifiedContent<Self> {
        _renderMod(PresentationModifier(kind: "dialog", isPresented: isPresented, title: title, content: { AnyView(actions()) }, onDismiss: nil))
    }
    public func confirmationDialog<A: View, M: View>(_ title: String, isPresented: Binding<Bool>, titleVisibility: Visibility = .automatic, @ViewBuilder actions: @escaping () -> A, @ViewBuilder message: @escaping () -> M) -> ModifiedContent<Self> {
        _renderMod(PresentationModifier(kind: "dialog", isPresented: isPresented, title: title, content: { AnyView(VStack { message(); actions() }) }, onDismiss: nil))
    }
}

public enum PresentationDetent: Hashable {
    case medium, large, fraction(CGFloat), height(CGFloat)
}
