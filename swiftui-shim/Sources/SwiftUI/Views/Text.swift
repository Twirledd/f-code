import Foundation

// MARK: - Text

public struct Text: View, _PrimitiveView, Equatable {
    var runs: [Run]
    var textModifiers: [_Modifier] = []

    struct Run: Equatable {
        var string: String
        var font: Font?
        var color: Color?
        var bold = false
        var italic = false
        var underline = false
        var strikethrough = false
        var monospaced = false
        var kerning: CGFloat?
        var baselineOffset: CGFloat?
    }

    public init(_ content: String) { runs = [Run(string: content)] }
    public init(verbatim content: String) { runs = [Run(string: content)] }
    public init(_ key: LocalizedStringKey) { runs = [Run(string: key.key)] }
    public init<S: StringProtocol>(_ content: S) { runs = [Run(string: String(content))] }
    public init(_ date: Date, style: DateStyle) {
        let f = DateFormatter()
        switch style {
        case .date: f.dateStyle = .medium; f.timeStyle = .none
        case .time: f.dateStyle = .none; f.timeStyle = .short
        case .relative, .offset, .timer: f.dateStyle = .short; f.timeStyle = .short
        }
        runs = [Run(string: f.string(from: date))]
    }
    public init(_ date: Date, format: Date.FormatStyle) { runs = [Run(string: date.formatted(format))] }
    public init<F: FormatStyle>(_ input: F.FormatInput, format: F) where F.FormatOutput == String {
        runs = [Run(string: format.format(input))]
    }

    public enum DateStyle { case time, date, relative, offset, timer }

    public typealias Body = Never
    public static func == (a: Text, b: Text) -> Bool { a.runs == b.runs }

    func mapRuns(_ f: (inout Run) -> Void) -> Text {
        var t = self
        for i in t.runs.indices { f(&t.runs[i]) }
        return t
    }

    public func font(_ font: Font?) -> Text { mapRuns { $0.font = font } }
    public func fontWeight(_ w: Font.Weight?) -> Text { mapRuns { if let w = w { $0.font = ($0.font ?? .body).weight(w) } } }
    public func foregroundColor(_ c: Color?) -> Text { mapRuns { $0.color = c } }
    public func foregroundStyle<S: ShapeStyle>(_ s: S) -> Text { mapRuns { if let c = s as? Color { $0.color = c } } }
    public func bold(_ on: Bool = true) -> Text { mapRuns { $0.bold = on } }
    public func italic(_ on: Bool = true) -> Text { mapRuns { $0.italic = on } }
    public func underline(_ on: Bool = true, color: Color? = nil) -> Text { mapRuns { $0.underline = on } }
    public func strikethrough(_ on: Bool = true, color: Color? = nil) -> Text { mapRuns { $0.strikethrough = on } }
    public func monospaced(_ on: Bool = true) -> Text { mapRuns { $0.monospaced = on } }
    public func monospacedDigit() -> Text { self }
    public func kerning(_ k: CGFloat) -> Text { mapRuns { $0.kerning = k } }
    public func tracking(_ k: CGFloat) -> Text { mapRuns { $0.kerning = k } }
    public func baselineOffset(_ o: CGFloat) -> Text { mapRuns { $0.baselineOffset = o } }
    public func textCase(_ c: Case?) -> Text {
        mapRuns { r in
            switch c {
            case .uppercase: r.string = r.string.uppercased()
            case .lowercase: r.string = r.string.lowercased()
            case .none: break
            }
        }
    }
    public enum Case { case uppercase, lowercase }

    public static func + (a: Text, b: Text) -> Text {
        var t = a
        t.runs += b.runs
        return t
    }

    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "text")
        node.props["runs"] = .array(runs.map { r in
            var o: [String: JSON] = ["s": .string(r.string)]
            if let f = r.font { o["font"] = f.json }
            if let c = r.color { o["color"] = c.json }
            if r.bold { o["bold"] = true }
            if r.italic { o["italic"] = true }
            if r.underline { o["underline"] = true }
            if r.strikethrough { o["strike"] = true }
            if r.monospaced { o["mono"] = true }
            if let k = r.kerning { o["kerning"] = JSON(k) }
            return .object(o)
        })
        node.modifiers = textModifiers
        return node
    }
}

extension Text {
    /// `Text("\(value, specifier: "%.2f")")`-style interpolation support.
    public init(_ interpolation: LocalizedStringKey.StringInterpolation) { runs = [Run(string: "")] }
}

extension LocalizedStringKey {
    public struct StringInterpolation: StringInterpolationProtocol {
        var out = ""
        public init(literalCapacity: Int, interpolationCount: Int) {}
        public mutating func appendLiteral(_ literal: String) { out += literal }
        public mutating func appendInterpolation<T>(_ value: T) { out += String(describing: value) }
        public mutating func appendInterpolation<T>(_ value: T, specifier: String) {
            if let d = value as? Double { out += String(format: specifier, d) }
            else if let f = value as? Float { out += String(format: specifier, Double(f)) }
            else if let i = value as? Int { out += String(format: specifier, i) }
            else { out += String(describing: value) }
        }
        public mutating func appendInterpolation(_ text: Text) { out += text.runs.map(\.string).joined() }
    }
}

// MARK: - Label

public struct Label<Title: View, Icon: View>: View, _PrimitiveView {
    let title: Title
    let icon: Icon
    public init(@ViewBuilder title: () -> Title, @ViewBuilder icon: () -> Icon) {
        self.title = title()
        self.icon = icon()
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "label")
        ctx.withPath("icon") { node.children.append(ctx.render(icon)) }
        ctx.withPath("title") { node.children.append(ctx.render(title)) }
        return node
    }
}

extension Label where Title == Text, Icon == Image {
    public init(_ title: String, systemImage: String) {
        self.title = Text(title)
        icon = Image(systemName: systemImage)
    }
    public init(_ title: String, image: String) {
        self.title = Text(title)
        icon = Image(image)
    }
    public init(_ title: LocalizedStringKey, systemImage: String) { self.init(title.key, systemImage: systemImage) }
}

// MARK: - Image

public struct Image: View, _PrimitiveView, Equatable {
    enum Source: Equatable { case system(String), asset(String), data(String) }
    var source: Source
    var resizable = false
    var renderingMode: RenderingMode = .template
    var symbolScale: String = "medium"

    public enum RenderingMode { case original, template }
    public enum Scale { case small, medium, large }
    public enum ResizingMode { case tile, stretch }

    public init(systemName: String) { source = .system(systemName) }
    public init(_ name: String, bundle: Any? = nil) { source = .asset(name) }
    public init(decorative name: String, bundle: Any? = nil) { source = .asset(name) }
    public init(systemName: String, variableValue: Double?) { source = .system(systemName) }

    public func resizable(capInsets: EdgeInsets = EdgeInsets(), resizingMode: ResizingMode = .stretch) -> Image {
        var i = self
        i.resizable = true
        return i
    }
    public func renderingMode(_ m: RenderingMode?) -> Image { var i = self; i.renderingMode = m ?? .template; return i }
    public func interpolation(_ i: Any) -> Image { self }
    public func antialiased(_ b: Bool) -> Image { self }
    public func symbolRenderingMode(_ m: Any?) -> Image { self }

    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "image")
        switch source {
        case .system(let n): node.props["symbol"] = .string(n)
        case .asset(let n): node.props["asset"] = .string(n)
        case .data(let d): node.props["data"] = .string(d)
        }
        if resizable { node.props["resizable"] = true }
        return node
    }
}

extension View {
    public func imageScale(_ s: Image.Scale) -> ModifiedContent<Self> {
        _mod("imageScale", ["scale": .string(s == .small ? "small" : s == .large ? "large" : "medium")])
    }
}

// MARK: - AsyncImage (renders a placeholder; no network in previews)

public struct AsyncImage<Content: View>: View {
    let url: URL?
    let content: (AsyncImagePhase) -> Content
    public init(url: URL?, scale: CGFloat = 1, @ViewBuilder content: @escaping (AsyncImagePhase) -> Content) {
        self.url = url
        self.content = content
    }
    public var body: some View { content(.empty) }
}
extension AsyncImage where Content == _ConditionalContent<Image, Color> {
    public init(url: URL?, scale: CGFloat = 1) {
        self.url = url
        content = { phase in
            if case .success(let img) = phase { return ViewBuilder.buildEither(first: img) }
            return ViewBuilder.buildEither(second: Color.gray.opacity(0.3))
        }
    }
}
public enum AsyncImagePhase {
    case empty
    case success(Image)
    case failure(Error)
    public var image: Image? { if case .success(let i) = self { return i }; return nil }
    public var error: Error? { if case .failure(let e) = self { return e }; return nil }
}
