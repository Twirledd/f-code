import Foundation

// MARK: - Geometry & layout vocabulary

public struct Alignment: Equatable, Hashable {
    public var horizontal: HorizontalAlignment
    public var vertical: VerticalAlignment
    public init(horizontal: HorizontalAlignment, vertical: VerticalAlignment) {
        self.horizontal = horizontal
        self.vertical = vertical
    }
    public static let center = Alignment(horizontal: .center, vertical: .center)
    public static let leading = Alignment(horizontal: .leading, vertical: .center)
    public static let trailing = Alignment(horizontal: .trailing, vertical: .center)
    public static let top = Alignment(horizontal: .center, vertical: .top)
    public static let bottom = Alignment(horizontal: .center, vertical: .bottom)
    public static let topLeading = Alignment(horizontal: .leading, vertical: .top)
    public static let topTrailing = Alignment(horizontal: .trailing, vertical: .top)
    public static let bottomLeading = Alignment(horizontal: .leading, vertical: .bottom)
    public static let bottomTrailing = Alignment(horizontal: .trailing, vertical: .bottom)
    var json: JSON { ["h": .string(horizontal.rawValue), "v": .string(vertical.rawValue)] }
}

public enum HorizontalAlignment: String, Hashable { case leading, center, trailing }
public enum VerticalAlignment: String, Hashable { case top, center, bottom, firstTextBaseline, lastTextBaseline }

public enum TextAlignment: String, Hashable { case leading, center, trailing }

public enum Axis: String, Hashable { case horizontal, vertical
    public struct Set: OptionSet {
        public let rawValue: Int
        public init(rawValue: Int) { self.rawValue = rawValue }
        public static let horizontal = Set(rawValue: 1)
        public static let vertical = Set(rawValue: 2)
    }
}

public enum Edge: Int8, CaseIterable, Hashable {
    case top, leading, bottom, trailing
    public struct Set: OptionSet {
        public let rawValue: Int8
        public init(rawValue: Int8) { self.rawValue = rawValue }
        public init(_ e: Edge) { self.init(rawValue: 1 << e.rawValue) }
        public static let top = Set(.top)
        public static let leading = Set(.leading)
        public static let bottom = Set(.bottom)
        public static let trailing = Set(.trailing)
        public static let all: Set = [.top, .leading, .bottom, .trailing]
        public static let horizontal: Set = [.leading, .trailing]
        public static let vertical: Set = [.top, .bottom]
    }
}

public struct EdgeInsets: Equatable {
    public var top: CGFloat, leading: CGFloat, bottom: CGFloat, trailing: CGFloat
    public init(top: CGFloat = 0, leading: CGFloat = 0, bottom: CGFloat = 0, trailing: CGFloat = 0) {
        self.top = top; self.leading = leading; self.bottom = bottom; self.trailing = trailing
    }
    public init() { self.init(top: 0, leading: 0, bottom: 0, trailing: 0) }
    var json: JSON { ["t": JSON(top), "l": JSON(leading), "b": JSON(bottom), "r": JSON(trailing)] }
}

public enum ColorScheme: String, Hashable, CaseIterable { case light, dark }

public enum LayoutDirection: String, Hashable { case leftToRight, rightToLeft }

public enum ContentMode: String, Hashable { case fit, fill }

public enum Visibility: String, Hashable { case automatic, visible, hidden }

// MARK: - Color

public struct Color: Hashable, CustomStringConvertible {
    enum Storage: Hashable {
        case system(String)
        case rgba(Double, Double, Double, Double)
        case asset(String)
    }
    var storage: Storage
    var opacityMultiplier: Double = 1

    init(storage: Storage) { self.storage = storage }

    public init(red: Double, green: Double, blue: Double, opacity: Double = 1) {
        storage = .rgba(red, green, blue, opacity)
    }
    public init(_ name: String) { storage = .asset(name) }
    public init(white: Double, opacity: Double = 1) { storage = .rgba(white, white, white, opacity) }
    public init(hue: Double, saturation: Double, brightness: Double, opacity: Double = 1) {
        // HSB → RGB
        let h = hue * 6, s = saturation, v = brightness
        let i = floor(h), f = h - i
        let p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f))
        let (r, g, b): (Double, Double, Double)
        switch Int(i) % 6 {
        case 0: (r, g, b) = (v, t, p)
        case 1: (r, g, b) = (q, v, p)
        case 2: (r, g, b) = (p, v, t)
        case 3: (r, g, b) = (p, q, v)
        case 4: (r, g, b) = (t, p, v)
        default: (r, g, b) = (v, p, q)
        }
        storage = .rgba(r, g, b, opacity)
    }

    public func opacity(_ o: Double) -> Color {
        var c = self
        c.opacityMultiplier *= o
        return c
    }

    public static let red = Color(storage: .system("red"))
    public static let orange = Color(storage: .system("orange"))
    public static let yellow = Color(storage: .system("yellow"))
    public static let green = Color(storage: .system("green"))
    public static let mint = Color(storage: .system("mint"))
    public static let teal = Color(storage: .system("teal"))
    public static let cyan = Color(storage: .system("cyan"))
    public static let blue = Color(storage: .system("blue"))
    public static let indigo = Color(storage: .system("indigo"))
    public static let purple = Color(storage: .system("purple"))
    public static let pink = Color(storage: .system("pink"))
    public static let brown = Color(storage: .system("brown"))
    public static let gray = Color(storage: .system("gray"))
    public static let black = Color(storage: .system("black"))
    public static let white = Color(storage: .system("white"))
    public static let clear = Color(storage: .system("clear"))
    public static let primary = Color(storage: .system("primary"))
    public static let secondary = Color(storage: .system("secondary"))
    public static let accentColor = Color(storage: .system("accent"))

    public var description: String { "Color(\(storage))" }

    var json: JSON {
        switch storage {
        case .system(let n): return ["sys": .string(n), "a": JSON(opacityMultiplier)]
        case .rgba(let r, let g, let b, let a): return ["r": JSON(r), "g": JSON(g), "b": JSON(b), "a": JSON(a * opacityMultiplier)]
        case .asset(let n): return ["asset": .string(n), "a": JSON(opacityMultiplier)]
        }
    }
}

// MARK: - ShapeStyle (Color, gradients, materials, hierarchical)

public protocol ShapeStyle {
    var _styleJSON: JSON { get }
}
extension Color: ShapeStyle {
    public var _styleJSON: JSON { ["color": json] }
}

public struct Gradient: Hashable {
    public struct Stop: Hashable {
        public var color: Color
        public var location: CGFloat
        public init(color: Color, location: CGFloat) { self.color = color; self.location = location }
    }
    public var stops: [Stop]
    public init(colors: [Color]) {
        let n = max(colors.count - 1, 1)
        stops = colors.enumerated().map { Stop(color: $1, location: CGFloat($0) / CGFloat(n)) }
    }
    public init(stops: [Stop]) { self.stops = stops }
    var json: JSON { .array(stops.map { ["c": $0.color.json, "at": JSON($0.location)] }) }
}

public struct UnitPoint: Hashable {
    public var x: CGFloat, y: CGFloat
    public init(x: CGFloat, y: CGFloat) { self.x = x; self.y = y }
    public static let zero = UnitPoint(x: 0, y: 0)
    public static let center = UnitPoint(x: 0.5, y: 0.5)
    public static let leading = UnitPoint(x: 0, y: 0.5)
    public static let trailing = UnitPoint(x: 1, y: 0.5)
    public static let top = UnitPoint(x: 0.5, y: 0)
    public static let bottom = UnitPoint(x: 0.5, y: 1)
    public static let topLeading = UnitPoint(x: 0, y: 0)
    public static let topTrailing = UnitPoint(x: 1, y: 0)
    public static let bottomLeading = UnitPoint(x: 0, y: 1)
    public static let bottomTrailing = UnitPoint(x: 1, y: 1)
    var json: JSON { ["x": JSON(x), "y": JSON(y)] }
}

public struct LinearGradient: ShapeStyle {
    var gradient: Gradient, start: UnitPoint, end: UnitPoint
    public init(gradient: Gradient, startPoint: UnitPoint, endPoint: UnitPoint) {
        self.gradient = gradient; start = startPoint; end = endPoint
    }
    public init(colors: [Color], startPoint: UnitPoint, endPoint: UnitPoint) {
        self.init(gradient: Gradient(colors: colors), startPoint: startPoint, endPoint: endPoint)
    }
    public init(stops: [Gradient.Stop], startPoint: UnitPoint, endPoint: UnitPoint) {
        self.init(gradient: Gradient(stops: stops), startPoint: startPoint, endPoint: endPoint)
    }
    public var _styleJSON: JSON { ["linear": ["stops": gradient.json, "from": start.json, "to": end.json]] }
}

public struct RadialGradient: ShapeStyle {
    var gradient: Gradient, center: UnitPoint, startRadius: CGFloat, endRadius: CGFloat
    public init(gradient: Gradient, center: UnitPoint, startRadius: CGFloat, endRadius: CGFloat) {
        self.gradient = gradient; self.center = center; self.startRadius = startRadius; self.endRadius = endRadius
    }
    public init(colors: [Color], center: UnitPoint, startRadius: CGFloat, endRadius: CGFloat) {
        self.init(gradient: Gradient(colors: colors), center: center, startRadius: startRadius, endRadius: endRadius)
    }
    public var _styleJSON: JSON { ["radial": ["stops": gradient.json, "center": center.json, "r0": JSON(startRadius), "r1": JSON(endRadius)]] }
}

public struct Material: ShapeStyle, Hashable {
    var name: String
    public static let ultraThin = Material(name: "ultraThin")
    public static let thin = Material(name: "thin")
    public static let regular = Material(name: "regular")
    public static let thick = Material(name: "thick")
    public static let ultraThick = Material(name: "ultraThick")
    public static let bar = Material(name: "bar")
    public var _styleJSON: JSON { ["material": .string(name)] }
}

public struct HierarchicalShapeStyle: ShapeStyle, Hashable {
    var level: Int
    public static let primary = HierarchicalShapeStyle(level: 1)
    public static let secondary = HierarchicalShapeStyle(level: 2)
    public static let tertiary = HierarchicalShapeStyle(level: 3)
    public static let quaternary = HierarchicalShapeStyle(level: 4)
    public var _styleJSON: JSON { ["hier": JSON(level)] }
}

public struct ForegroundStyle: ShapeStyle {
    public init() {}
    public var _styleJSON: JSON { ["hier": 1] }
}
public struct BackgroundStyle: ShapeStyle {
    public init() {}
    public var _styleJSON: JSON { ["background": true] }
}
public struct TintShapeStyle: ShapeStyle {
    public init() {}
    public var _styleJSON: JSON { ["color": Color.accentColor.json] }
}

extension ShapeStyle where Self == Color {
    public static var red: Color { .red }
    public static var orange: Color { .orange }
    public static var yellow: Color { .yellow }
    public static var green: Color { .green }
    public static var mint: Color { .mint }
    public static var teal: Color { .teal }
    public static var cyan: Color { .cyan }
    public static var blue: Color { .blue }
    public static var indigo: Color { .indigo }
    public static var purple: Color { .purple }
    public static var pink: Color { .pink }
    public static var brown: Color { .brown }
    public static var gray: Color { .gray }
    public static var black: Color { .black }
    public static var white: Color { .white }
    public static var clear: Color { .clear }
    public static var primary: Color { .primary }
    public static var secondary: Color { .secondary }
    public static var accentColor: Color { .accentColor }
}
extension ShapeStyle where Self == HierarchicalShapeStyle {
    public static var tertiary: HierarchicalShapeStyle { .tertiary }
    public static var quaternary: HierarchicalShapeStyle { .quaternary }
}
extension ShapeStyle where Self == Material {
    public static var ultraThinMaterial: Material { .ultraThin }
    public static var thinMaterial: Material { .thin }
    public static var regularMaterial: Material { .regular }
    public static var thickMaterial: Material { .thick }
    public static var ultraThickMaterial: Material { .ultraThick }
    public static var bar: Material { .bar }
}
extension ShapeStyle where Self == BackgroundStyle {
    public static var background: BackgroundStyle { BackgroundStyle() }
}
extension ShapeStyle where Self == TintShapeStyle {
    public static var tint: TintShapeStyle { TintShapeStyle() }
}

// MARK: - Font

public struct Font: Hashable {
    public enum TextStyle: String, Hashable, CaseIterable {
        case largeTitle, title, title2, title3, headline, subheadline, body, callout, footnote, caption, caption2
    }
    public enum Weight: String, Hashable {
        case ultraLight, thin, light, regular, medium, semibold, bold, heavy, black
    }
    public enum Design: String, Hashable { case `default`, serif, rounded, monospaced }
    public enum Width: String, Hashable { case compressed, condensed, standard, expanded }

    var style: TextStyle?
    var size: CGFloat?
    var weight: Weight?
    var design: Design?
    var isItalic = false
    var hasMonospacedDigit = false
    var custom: String?

    public static let largeTitle = Font(style: .largeTitle)
    public static let title = Font(style: .title)
    public static let title2 = Font(style: .title2)
    public static let title3 = Font(style: .title3)
    public static let headline = Font(style: .headline)
    public static let subheadline = Font(style: .subheadline)
    public static let body = Font(style: .body)
    public static let callout = Font(style: .callout)
    public static let footnote = Font(style: .footnote)
    public static let caption = Font(style: .caption)
    public static let caption2 = Font(style: .caption2)

    public static func system(size: CGFloat, weight: Weight = .regular, design: Design = .default) -> Font {
        Font(size: size, weight: weight, design: design)
    }
    public static func system(_ style: TextStyle, design: Design = .default, weight: Weight? = nil) -> Font {
        Font(style: style, weight: weight, design: design)
    }
    public static func custom(_ name: String, size: CGFloat) -> Font { Font(size: size, custom: name) }
    public static func custom(_ name: String, size: CGFloat, relativeTo: TextStyle) -> Font { Font(size: size, custom: name) }

    public func weight(_ w: Weight) -> Font { var f = self; f.weight = w; return f }
    public func bold() -> Font { weight(.bold) }
    public func italic() -> Font { var f = self; f.isItalic = true; return f }
    public func monospaced() -> Font { var f = self; f.design = .monospaced; return f }
    public func monospacedDigit() -> Font { var f = self; f.hasMonospacedDigit = true; return f }
    public func width(_ w: Width) -> Font { self }

    var json: JSON {
        [
            "style": .optional(style?.rawValue), "size": .optional(size), "weight": .optional(weight?.rawValue),
            "design": .optional(design?.rawValue), "italic": .bool(isItalic), "custom": .optional(custom),
        ]
    }
}

// MARK: - Animation (accepted, not animated in the preview)

public struct Animation: Hashable {
    var name: String
    var duration: Double
    public static let `default` = Animation(name: "default", duration: 0.35)
    public static func easeIn(duration: Double = 0.35) -> Animation { Animation(name: "easeIn", duration: duration) }
    public static func easeOut(duration: Double = 0.35) -> Animation { Animation(name: "easeOut", duration: duration) }
    public static func easeInOut(duration: Double = 0.35) -> Animation { Animation(name: "easeInOut", duration: duration) }
    public static func linear(duration: Double = 0.35) -> Animation { Animation(name: "linear", duration: duration) }
    public static let easeIn = Animation.easeIn()
    public static let easeOut = Animation.easeOut()
    public static let easeInOut = Animation.easeInOut()
    public static let linear = Animation.linear()
    public static let spring = Animation(name: "spring", duration: 0.5)
    public static let bouncy = Animation(name: "spring", duration: 0.5)
    public static let smooth = Animation(name: "easeInOut", duration: 0.5)
    public static let snappy = Animation(name: "easeOut", duration: 0.3)
    public static func spring(response: Double = 0.5, dampingFraction: Double = 0.8, blendDuration: Double = 0) -> Animation {
        Animation(name: "spring", duration: response)
    }
    public static func spring(duration: Double = 0.5, bounce: Double = 0, blendDuration: Double = 0) -> Animation {
        Animation(name: "spring", duration: duration)
    }
    public static func interactiveSpring(response: Double = 0.15, dampingFraction: Double = 0.86, blendDuration: Double = 0.25) -> Animation {
        Animation(name: "spring", duration: response)
    }
    public func delay(_ d: Double) -> Animation { self }
    public func speed(_ s: Double) -> Animation { self }
    public func repeatForever(autoreverses: Bool = true) -> Animation { self }
    public func repeatCount(_ n: Int, autoreverses: Bool = true) -> Animation { self }
}

public func withAnimation<Result>(_ animation: Animation? = .default, _ body: () throws -> Result) rethrows -> Result {
    try body()
}

public struct AnyTransition {
    public static let opacity = AnyTransition()
    public static let slide = AnyTransition()
    public static let scale = AnyTransition()
    public static let identity = AnyTransition()
    public static func move(edge: Edge) -> AnyTransition { AnyTransition() }
    public static func offset(x: CGFloat = 0, y: CGFloat = 0) -> AnyTransition { AnyTransition() }
    public static func scale(scale: CGFloat, anchor: UnitPoint = .center) -> AnyTransition { AnyTransition() }
    public static func asymmetric(insertion: AnyTransition, removal: AnyTransition) -> AnyTransition { AnyTransition() }
    public func combined(with other: AnyTransition) -> AnyTransition { self }
    public func animation(_ a: Animation?) -> AnyTransition { self }
}

// MARK: - Misc styles

public enum ListStyleKind: String { case automatic, plain, inset, grouped, insetGrouped, sidebar }
public struct AnyListStyle { var kind: ListStyleKind }
public protocol ListStyle { var _kind: ListStyleKind { get } }
public struct PlainListStyle: ListStyle { public init() {}; public var _kind: ListStyleKind { .plain } }
public struct InsetListStyle: ListStyle { public init() {}; public var _kind: ListStyleKind { .inset } }
public struct GroupedListStyle: ListStyle { public init() {}; public var _kind: ListStyleKind { .grouped } }
public struct InsetGroupedListStyle: ListStyle { public init() {}; public var _kind: ListStyleKind { .insetGrouped } }
public struct SidebarListStyle: ListStyle { public init() {}; public var _kind: ListStyleKind { .sidebar } }
public struct DefaultListStyle: ListStyle { public init() {}; public var _kind: ListStyleKind { .automatic } }
extension ListStyle where Self == PlainListStyle { public static var plain: PlainListStyle { .init() } }
extension ListStyle where Self == InsetListStyle { public static var inset: InsetListStyle { .init() } }
extension ListStyle where Self == GroupedListStyle { public static var grouped: GroupedListStyle { .init() } }
extension ListStyle where Self == InsetGroupedListStyle { public static var insetGrouped: InsetGroupedListStyle { .init() } }
extension ListStyle where Self == SidebarListStyle { public static var sidebar: SidebarListStyle { .init() } }
extension ListStyle where Self == DefaultListStyle { public static var automatic: DefaultListStyle { .init() } }

public protocol ButtonStyle { var _name: String { get } }
public struct DefaultButtonStyle: ButtonStyle { public init() {}; public var _name: String { "automatic" } }
public struct PlainButtonStyle: ButtonStyle { public init() {}; public var _name: String { "plain" } }
public struct BorderlessButtonStyle: ButtonStyle { public init() {}; public var _name: String { "borderless" } }
public struct BorderedButtonStyle: ButtonStyle { public init() {}; public var _name: String { "bordered" } }
public struct BorderedProminentButtonStyle: ButtonStyle { public init() {}; public var _name: String { "borderedProminent" } }
extension ButtonStyle where Self == DefaultButtonStyle { public static var automatic: DefaultButtonStyle { .init() } }
extension ButtonStyle where Self == PlainButtonStyle { public static var plain: PlainButtonStyle { .init() } }
extension ButtonStyle where Self == BorderlessButtonStyle { public static var borderless: BorderlessButtonStyle { .init() } }
extension ButtonStyle where Self == BorderedButtonStyle { public static var bordered: BorderedButtonStyle { .init() } }
extension ButtonStyle where Self == BorderedProminentButtonStyle { public static var borderedProminent: BorderedProminentButtonStyle { .init() } }

public enum ButtonRole: String { case destructive, cancel }

public enum ControlSize: String { case mini, small, regular, large, extraLarge }

public protocol PickerStyle { var _name: String { get } }
public struct DefaultPickerStyle: PickerStyle { public init() {}; public var _name: String { "automatic" } }
public struct MenuPickerStyle: PickerStyle { public init() {}; public var _name: String { "menu" } }
public struct SegmentedPickerStyle: PickerStyle { public init() {}; public var _name: String { "segmented" } }
public struct WheelPickerStyle: PickerStyle { public init() {}; public var _name: String { "wheel" } }
public struct InlinePickerStyle: PickerStyle { public init() {}; public var _name: String { "inline" } }
public struct NavigationLinkPickerStyle: PickerStyle { public init() {}; public var _name: String { "navigationLink" } }
extension PickerStyle where Self == DefaultPickerStyle { public static var automatic: DefaultPickerStyle { .init() } }
extension PickerStyle where Self == MenuPickerStyle { public static var menu: MenuPickerStyle { .init() } }
extension PickerStyle where Self == SegmentedPickerStyle { public static var segmented: SegmentedPickerStyle { .init() } }
extension PickerStyle where Self == WheelPickerStyle { public static var wheel: WheelPickerStyle { .init() } }
extension PickerStyle where Self == InlinePickerStyle { public static var inline: InlinePickerStyle { .init() } }
extension PickerStyle where Self == NavigationLinkPickerStyle { public static var navigationLink: NavigationLinkPickerStyle { .init() } }

public protocol TextFieldStyle { var _name: String { get } }
public struct DefaultTextFieldStyle: TextFieldStyle { public init() {}; public var _name: String { "automatic" } }
public struct PlainTextFieldStyle: TextFieldStyle { public init() {}; public var _name: String { "plain" } }
public struct RoundedBorderTextFieldStyle: TextFieldStyle { public init() {}; public var _name: String { "roundedBorder" } }
extension TextFieldStyle where Self == DefaultTextFieldStyle { public static var automatic: DefaultTextFieldStyle { .init() } }
extension TextFieldStyle where Self == PlainTextFieldStyle { public static var plain: PlainTextFieldStyle { .init() } }
extension TextFieldStyle where Self == RoundedBorderTextFieldStyle { public static var roundedBorder: RoundedBorderTextFieldStyle { .init() } }

public protocol ToggleStyle { var _name: String { get } }
public struct SwitchToggleStyle: ToggleStyle { public init() {}; public var _name: String { "switch" } }
public struct ButtonToggleStyle: ToggleStyle { public init() {}; public var _name: String { "button" } }
public struct DefaultToggleStyle: ToggleStyle { public init() {}; public var _name: String { "automatic" } }
extension ToggleStyle where Self == SwitchToggleStyle { public static var `switch`: SwitchToggleStyle { .init() } }
extension ToggleStyle where Self == ButtonToggleStyle { public static var button: ButtonToggleStyle { .init() } }
extension ToggleStyle where Self == DefaultToggleStyle { public static var automatic: DefaultToggleStyle { .init() } }

public protocol LabelStyle { var _name: String { get } }
public struct DefaultLabelStyle: LabelStyle { public init() {}; public var _name: String { "automatic" } }
public struct TitleOnlyLabelStyle: LabelStyle { public init() {}; public var _name: String { "titleOnly" } }
public struct IconOnlyLabelStyle: LabelStyle { public init() {}; public var _name: String { "iconOnly" } }
public struct TitleAndIconLabelStyle: LabelStyle { public init() {}; public var _name: String { "titleAndIcon" } }
extension LabelStyle where Self == DefaultLabelStyle { public static var automatic: DefaultLabelStyle { .init() } }
extension LabelStyle where Self == TitleOnlyLabelStyle { public static var titleOnly: TitleOnlyLabelStyle { .init() } }
extension LabelStyle where Self == IconOnlyLabelStyle { public static var iconOnly: IconOnlyLabelStyle { .init() } }
extension LabelStyle where Self == TitleAndIconLabelStyle { public static var titleAndIcon: TitleAndIconLabelStyle { .init() } }

public protocol ProgressViewStyle { var _name: String { get } }
public struct LinearProgressViewStyle: ProgressViewStyle { public init() {}; public var _name: String { "linear" } }
public struct CircularProgressViewStyle: ProgressViewStyle { public init() {}; public var _name: String { "circular" } }
public struct DefaultProgressViewStyle: ProgressViewStyle { public init() {}; public var _name: String { "automatic" } }
extension ProgressViewStyle where Self == LinearProgressViewStyle { public static var linear: LinearProgressViewStyle { .init() } }
extension ProgressViewStyle where Self == CircularProgressViewStyle { public static var circular: CircularProgressViewStyle { .init() } }
extension ProgressViewStyle where Self == DefaultProgressViewStyle { public static var automatic: DefaultProgressViewStyle { .init() } }

public enum NavigationBarItemTitleDisplayMode: String { case automatic, inline, large }
public enum ToolbarItemPlacement: String {
    case automatic, principal, navigation, primaryAction, confirmationAction, cancellationAction, destructiveAction,
         status, bottomBar, keyboard, topBarLeading, topBarTrailing, navigationBarLeading, navigationBarTrailing
}

public struct TextInputAutocapitalization: Hashable {
    var name: String
    public static let never = TextInputAutocapitalization(name: "never")
    public static let words = TextInputAutocapitalization(name: "words")
    public static let sentences = TextInputAutocapitalization(name: "sentences")
    public static let characters = TextInputAutocapitalization(name: "characters")
}
public enum UIKeyboardType: String { case `default`, numberPad, decimalPad, emailAddress, URL, phonePad, numbersAndPunctuation, webSearch, asciiCapable, twitter, namePhonePad }
public enum SubmitLabel: String { case done, go, send, join, route, search, `return`, next, `continue` }

public struct ScrollIndicatorVisibility: Hashable {
    var name: String
    public static let automatic = ScrollIndicatorVisibility(name: "automatic")
    public static let visible = ScrollIndicatorVisibility(name: "visible")
    public static let hidden = ScrollIndicatorVisibility(name: "hidden")
    public static let never = ScrollIndicatorVisibility(name: "never")
}

public enum SafeAreaRegions { case all, container, keyboard }

public struct GridItem {
    public enum Size { case fixed(CGFloat), flexible(minimum: CGFloat = 10, maximum: CGFloat = .infinity), adaptive(minimum: CGFloat, maximum: CGFloat = .infinity) }
    public var size: Size
    public var spacing: CGFloat?
    public var alignment: Alignment?
    public init(_ size: Size = .flexible(), spacing: CGFloat? = nil, alignment: Alignment? = nil) {
        self.size = size; self.spacing = spacing; self.alignment = alignment
    }
    var json: JSON {
        switch size {
        case .fixed(let w): return ["kind": "fixed", "w": JSON(w)]
        case .flexible(let mn, let mx): return ["kind": "flexible", "min": JSON(mn), "max": JSON(mx.isInfinite ? -1 : mx)]
        case .adaptive(let mn, let mx): return ["kind": "adaptive", "min": JSON(mn), "max": JSON(mx.isInfinite ? -1 : mx)]
        }
    }
}

public struct PinnedScrollableViews: OptionSet {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }
    public static let sectionHeaders = PinnedScrollableViews(rawValue: 1)
    public static let sectionFooters = PinnedScrollableViews(rawValue: 2)
}

public struct LocalizedStringKey: ExpressibleByStringLiteral, ExpressibleByStringInterpolation, Equatable {
    public var key: String
    public init(_ value: String) { key = value }
    public init(stringLiteral value: String) { key = value }
    public init(stringInterpolation: StringInterpolation) { key = stringInterpolation.out }
}
