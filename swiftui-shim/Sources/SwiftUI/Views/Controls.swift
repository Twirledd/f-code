import Foundation

// MARK: - Button

public struct Button<Label: View>: View, _PrimitiveView {
    let label: Label
    let action: () -> Void
    let role: ButtonRole?

    public init(action: @escaping () -> Void, @ViewBuilder label: () -> Label) {
        self.action = action
        self.label = label()
        role = nil
    }
    public init(role: ButtonRole?, action: @escaping () -> Void, @ViewBuilder label: () -> Label) {
        self.action = action
        self.label = label()
        self.role = role
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "button")
        if let r = role { node.props["role"] = .string(r.rawValue) }
        ctx.register(node, "tap") { _ in action() }
        node.children = [ctx.withPath("label") { ctx.render(label) }]
        return node
    }
}

extension Button where Label == Text {
    public init(_ title: String, action: @escaping () -> Void) { self.init(action: action) { Text(title) } }
    public init(_ title: LocalizedStringKey, action: @escaping () -> Void) { self.init(action: action) { Text(title) } }
    public init(_ title: String, role: ButtonRole?, action: @escaping () -> Void) { self.init(role: role, action: action) { Text(title) } }
    public init(_ title: LocalizedStringKey, role: ButtonRole?, action: @escaping () -> Void) { self.init(role: role, action: action) { Text(title) } }
}
extension Button where Label == SwiftUI.Label<Text, Image> {
    public init(_ title: String, systemImage: String, action: @escaping () -> Void) {
        self.init(action: action) { SwiftUI.Label(title, systemImage: systemImage) }
    }
    public init(_ title: String, systemImage: String, role: ButtonRole?, action: @escaping () -> Void) {
        self.init(role: role, action: action) { SwiftUI.Label(title, systemImage: systemImage) }
    }
}

// MARK: - Toggle

public struct Toggle<Label: View>: View, _PrimitiveView {
    let isOn: Binding<Bool>
    let label: Label
    public init(isOn: Binding<Bool>, @ViewBuilder label: () -> Label) {
        self.isOn = isOn
        self.label = label()
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "toggle", props: ["on": .bool(isOn.wrappedValue)])
        ctx.register(node, "toggle") { v in isOn.wrappedValue = v.boolValue ?? !isOn.wrappedValue }
        node.children = [ctx.withPath("label") { ctx.render(label) }]
        return node
    }
}
extension Toggle where Label == Text {
    public init(_ title: String, isOn: Binding<Bool>) { self.init(isOn: isOn) { Text(title) } }
    public init(_ title: LocalizedStringKey, isOn: Binding<Bool>) { self.init(isOn: isOn) { Text(title) } }
}
extension Toggle where Label == SwiftUI.Label<Text, Image> {
    public init(_ title: String, systemImage: String, isOn: Binding<Bool>) { self.init(isOn: isOn) { SwiftUI.Label(title, systemImage: systemImage) } }
}

// MARK: - TextField / SecureField / TextEditor

public struct TextField<Label: View>: View, _PrimitiveView {
    let text: Binding<String>
    let placeholder: String
    let axis: Axis
    public init(_ titleKey: String, text: Binding<String>, axis: Axis = .horizontal) where Label == Text {
        self.text = text
        placeholder = titleKey
        self.axis = axis
    }
    public init(_ titleKey: LocalizedStringKey, text: Binding<String>, axis: Axis = .horizontal) where Label == Text {
        self.text = text
        placeholder = titleKey.key
        self.axis = axis
    }
    public init(_ titleKey: String, text: Binding<String>, prompt: Text?, axis: Axis = .horizontal) where Label == Text {
        self.text = text
        placeholder = prompt?.runs.map(\.string).joined() ?? titleKey
        self.axis = axis
    }
    public init<V>(_ titleKey: String, value: Binding<V>, format: Any, prompt: Text? = nil) where Label == Text, V: LosslessStringConvertible {
        text = Binding(get: { String(value.wrappedValue) }, set: { if let v = V($0) { value.wrappedValue = v } })
        placeholder = titleKey
        axis = .horizontal
    }
    public init<V>(_ titleKey: String, value: Binding<V>, formatter: Formatter) where Label == Text, V: LosslessStringConvertible {
        text = Binding(get: { String(value.wrappedValue) }, set: { if let v = V($0) { value.wrappedValue = v } })
        placeholder = titleKey
        axis = .horizontal
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "textfield", props: ["text": .string(text.wrappedValue), "prompt": .string(placeholder), "multiline": .bool(axis == .vertical)])
        ctx.register(node, "text") { v in text.wrappedValue = v.stringValue ?? "" }
        return node
    }
}

public struct SecureField<Label: View>: View, _PrimitiveView {
    let text: Binding<String>
    let placeholder: String
    public init(_ titleKey: String, text: Binding<String>) where Label == Text {
        self.text = text
        placeholder = titleKey
    }
    public init(_ titleKey: String, text: Binding<String>, prompt: Text?) where Label == Text {
        self.text = text
        placeholder = prompt?.runs.map(\.string).joined() ?? titleKey
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "textfield", props: ["text": .string(text.wrappedValue), "prompt": .string(placeholder), "secure": true])
        ctx.register(node, "text") { v in text.wrappedValue = v.stringValue ?? "" }
        return node
    }
}

public struct TextEditor: View, _PrimitiveView {
    let text: Binding<String>
    public init(text: Binding<String>) { self.text = text }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "texteditor", props: ["text": .string(text.wrappedValue)])
        ctx.register(node, "text") { v in text.wrappedValue = v.stringValue ?? "" }
        return node
    }
}

// MARK: - Slider / Stepper / ProgressView

public struct Slider<Label: View>: View, _PrimitiveView {
    let value: Binding<Double>
    let range: ClosedRange<Double>
    let step: Double?
    public init<V: BinaryFloatingPoint>(value: Binding<V>, in bounds: ClosedRange<V> = 0...1, step: V.Stride? = nil, onEditingChanged: @escaping (Bool) -> Void = { _ in }) where Label == EmptyView, V.Stride: BinaryFloatingPoint {
        self.value = Binding(get: { Double(value.wrappedValue) }, set: { value.wrappedValue = V($0) })
        range = Double(bounds.lowerBound)...Double(bounds.upperBound)
        self.step = step.map { Double($0) }
    }
    public init<V: BinaryFloatingPoint>(value: Binding<V>, in bounds: ClosedRange<V> = 0...1, step: V.Stride? = nil, @ViewBuilder label: () -> Label) where V.Stride: BinaryFloatingPoint {
        self.value = Binding(get: { Double(value.wrappedValue) }, set: { value.wrappedValue = V($0) })
        range = Double(bounds.lowerBound)...Double(bounds.upperBound)
        self.step = step.map { Double($0) }
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "slider", props: ["value": JSON(value.wrappedValue), "min": JSON(range.lowerBound), "max": JSON(range.upperBound), "step": .optional(step)])
        ctx.register(node, "value") { v in if let d = v.doubleValue { value.wrappedValue = d } }
        return node
    }
}

public struct Stepper<Label: View>: View, _PrimitiveView {
    let label: Label
    let onIncrement: () -> Void
    let onDecrement: () -> Void
    public init(onIncrement: (() -> Void)?, onDecrement: (() -> Void)?, @ViewBuilder label: () -> Label) {
        self.label = label()
        self.onIncrement = onIncrement ?? {}
        self.onDecrement = onDecrement ?? {}
    }
    public init<V: Strideable>(value: Binding<V>, in bounds: ClosedRange<V>, step: V.Stride = 1, @ViewBuilder label: () -> Label) {
        self.label = label()
        onIncrement = { let n = value.wrappedValue.advanced(by: step); if n <= bounds.upperBound { value.wrappedValue = n } }
        onDecrement = { let n = value.wrappedValue.advanced(by: -step); if n >= bounds.lowerBound { value.wrappedValue = n } }
    }
    public init<V: Strideable>(value: Binding<V>, step: V.Stride = 1, @ViewBuilder label: () -> Label) {
        self.label = label()
        onIncrement = { value.wrappedValue = value.wrappedValue.advanced(by: step) }
        onDecrement = { value.wrappedValue = value.wrappedValue.advanced(by: -step) }
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "stepper")
        ctx.register(node, "inc") { _ in onIncrement() }
        ctx.register(node, "dec") { _ in onDecrement() }
        node.children = [ctx.withPath("label") { ctx.render(label) }]
        return node
    }
}
extension Stepper where Label == Text {
    public init<V: Strideable>(_ title: String, value: Binding<V>, in bounds: ClosedRange<V>, step: V.Stride = 1) { self.init(value: value, in: bounds, step: step) { Text(title) } }
    public init<V: Strideable>(_ title: String, value: Binding<V>, step: V.Stride = 1) { self.init(value: value, step: step) { Text(title) } }
}

public struct ProgressView<Label: View>: View, _PrimitiveView {
    let value: Double?
    let total: Double
    let label: Label?
    public init() where Label == EmptyView { value = nil; total = 1; label = nil }
    public init(_ title: String) where Label == Text { value = nil; total = 1; label = Text(title) }
    public init<V: BinaryFloatingPoint>(value: V?, total: V = 1) where Label == EmptyView {
        self.value = value.map { Double($0) }
        self.total = Double(total)
        label = nil
    }
    public init<V: BinaryFloatingPoint>(_ title: String, value: V?, total: V = 1) where Label == Text {
        self.value = value.map { Double($0) }
        self.total = Double(total)
        label = Text(title)
    }
    public init<V: BinaryFloatingPoint>(value: V?, total: V = 1, @ViewBuilder label: () -> Label) {
        self.value = value.map { Double($0) }
        self.total = Double(total)
        self.label = label()
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "progress", props: ["value": .optional(value), "total": JSON(total)])
        if let l = label { node.children = [ctx.withPath("label") { ctx.render(l) }] }
        return node
    }
}

// MARK: - Picker

public struct Picker<SelectionValue: Hashable, Content: View, Label: View>: View, _PrimitiveView {
    let selection: Binding<SelectionValue>
    let content: Content
    let label: Label
    public init(selection: Binding<SelectionValue>, @ViewBuilder content: () -> Content, @ViewBuilder label: () -> Label) {
        self.selection = selection
        self.content = content()
        self.label = label()
    }
    public init(_ title: String, selection: Binding<SelectionValue>, @ViewBuilder content: () -> Content) where Label == Text {
        self.selection = selection
        self.content = content()
        label = Text(title)
    }
    public init(_ title: LocalizedStringKey, selection: Binding<SelectionValue>, @ViewBuilder content: () -> Content) where Label == Text {
        self.selection = selection
        self.content = content()
        label = Text(title.key)
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "picker")
        let options = ctx.withPath("options") { ctx.renderFlattened(content) }
        // Each option's tag comes from `.tag(_:)`; untagged options use their index.
        var tags: [AnyHashable] = []
        var selectedIndex = -1
        for (i, opt) in options.enumerated() {
            let tag = ctx.tagTable[opt.id ?? ""] ?? AnyHashable(i)
            tags.append(tag)
            if tag == AnyHashable(selection.wrappedValue) { selectedIndex = i }
        }
        node.props["selected"] = JSON(selectedIndex)
        node.children = options
        ctx.register(node, "select") { v in
            if let i = v.doubleValue.map(Int.init), i >= 0, i < tags.count, let t = tags[i].base as? SelectionValue {
                selection.wrappedValue = t
            }
        }
        node.children.append(ctx.withPath("label") { ctx.render(label) })
        node.props["labelIndex"] = JSON(options.count)
        return node
    }
}

public struct DatePickerComponents: OptionSet {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }
    public static let date = DatePickerComponents(rawValue: 1)
    public static let hourAndMinute = DatePickerComponents(rawValue: 2)
}

public struct DatePicker<Label: View>: View, _PrimitiveView {
    let selection: Binding<Date>
    let label: Label
    let components: Components
    public typealias Components = DatePickerComponents
    public init(selection: Binding<Date>, displayedComponents: Components = [.date, .hourAndMinute], @ViewBuilder label: () -> Label) {
        self.selection = selection
        self.label = label()
        components = displayedComponents
    }
    public init(_ title: String, selection: Binding<Date>, displayedComponents: Components = [.date, .hourAndMinute]) where Label == Text {
        self.selection = selection
        label = Text(title)
        components = displayedComponents
    }
    public init(_ title: String, selection: Binding<Date>, in range: ClosedRange<Date>, displayedComponents: Components = [.date, .hourAndMinute]) where Label == Text {
        self.init(title, selection: selection, displayedComponents: displayedComponents)
    }
    public init(_ title: String, selection: Binding<Date>, in range: PartialRangeFrom<Date>, displayedComponents: Components = [.date, .hourAndMinute]) where Label == Text {
        self.init(title, selection: selection, displayedComponents: displayedComponents)
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "datepicker", props: [
            "iso": .string(ISO8601DateFormatter().string(from: selection.wrappedValue)),
            "date": .bool(components.contains(.date)), "time": .bool(components.contains(.hourAndMinute)),
        ])
        ctx.register(node, "date") { v in
            if let s = v.stringValue, let d = ISO8601DateFormatter().date(from: s) { selection.wrappedValue = d }
        }
        node.children = [ctx.withPath("label") { ctx.render(label) }]
        return node
    }
}

public struct ColorPicker<Label: View>: View, _PrimitiveView {
    let selection: Binding<Color>
    let label: Label
    public init(selection: Binding<Color>, supportsOpacity: Bool = true, @ViewBuilder label: () -> Label) {
        self.selection = selection
        self.label = label()
    }
    public init(_ title: String, selection: Binding<Color>, supportsOpacity: Bool = true) where Label == Text {
        self.selection = selection
        label = Text(title)
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "colorpicker", props: ["color": selection.wrappedValue.json])
        ctx.register(node, "color") { v in
            if let r = v["r"].doubleValue, let g = v["g"].doubleValue, let b = v["b"].doubleValue {
                selection.wrappedValue = Color(red: r, green: g, blue: b, opacity: v["a"].doubleValue ?? 1)
            }
        }
        node.children = [ctx.withPath("label") { ctx.render(label) }]
        return node
    }
}

// MARK: - Link / Menu

public struct Link<Label: View>: View, _PrimitiveView {
    let destination: URL
    let label: Label
    public init(destination: URL, @ViewBuilder label: () -> Label) {
        self.destination = destination
        self.label = label()
    }
    public init(_ title: String, destination: URL) where Label == Text {
        self.destination = destination
        label = Text(title)
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "link", props: ["url": .string(destination.absoluteString)])
        node.children = [ctx.withPath("label") { ctx.render(label) }]
        return node
    }
}

public struct Menu<Label: View, Content: View>: View, _PrimitiveView {
    let label: Label
    let content: Content
    public init(@ViewBuilder content: () -> Content, @ViewBuilder label: () -> Label) {
        self.content = content()
        self.label = label()
    }
    public init(_ title: String, @ViewBuilder content: () -> Content) where Label == Text {
        self.content = content()
        label = Text(title)
    }
    public init(_ title: String, systemImage: String, @ViewBuilder content: () -> Content) where Label == SwiftUI.Label<Text, Image> {
        self.content = content()
        label = SwiftUI.Label(title, systemImage: systemImage)
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "menu")
        node.children = [ctx.withPath("label") { ctx.render(label) }]
        node.children += ctx.withPath("items") { ctx.renderFlattened(content) }
        return node
    }
}

// MARK: - LabeledContent

public struct LabeledContent<Label: View, Content: View>: View, _PrimitiveView {
    let label: Label
    let content: Content
    public init(@ViewBuilder content: () -> Content, @ViewBuilder label: () -> Label) {
        self.content = content()
        self.label = label()
    }
    public init(_ title: String, @ViewBuilder content: () -> Content) where Label == Text {
        self.content = content()
        label = Text(title)
    }
    public init(_ title: String, value: String) where Label == Text, Content == Text {
        content = Text(value)
        label = Text(title)
    }
    public init<V: CustomStringConvertible>(_ title: String, value: V) where Label == Text, Content == Text {
        content = Text(value.description)
        label = Text(title)
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "labeled")
        node.children = [ctx.withPath("label") { ctx.render(label) }, ctx.withPath("content") { ctx.render(content) }]
        return node
    }
}

// MARK: - EditButton / misc

public struct EditButton: View {
    public init() {}
    public var body: some View { Button("Edit") {} }
}

public struct ContentUnavailableView<Label: View, Description: View, Actions: View>: View {
    let label: Label, description: Description, actions: Actions
    public init(@ViewBuilder label: () -> Label, @ViewBuilder description: () -> Description, @ViewBuilder actions: () -> Actions) {
        self.label = label(); self.description = description(); self.actions = actions()
    }
    public init(@ViewBuilder label: () -> Label, @ViewBuilder description: () -> Description) where Actions == EmptyView {
        self.label = label(); self.description = description(); actions = EmptyView()
    }
    public var body: some View {
        VStack(spacing: 10) {
            label.font(.title2).fontWeight(.bold)
            description.foregroundStyle(.secondary).multilineTextAlignment(.center)
            actions
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
extension ContentUnavailableView where Label == SwiftUI.Label<Text, Image>, Description == Text?, Actions == EmptyView {
    public init(_ title: String, systemImage: String, description: Text? = nil) {
        label = SwiftUI.Label(title, systemImage: systemImage)
        self.description = description
        actions = EmptyView()
    }
    public static var search: ContentUnavailableView { ContentUnavailableView("No Results", systemImage: "magnifyingglass") }
}
