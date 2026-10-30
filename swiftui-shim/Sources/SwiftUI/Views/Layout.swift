import Foundation

// MARK: - Stacks

public struct VStack<Content: View>: View, _PrimitiveView {
    let alignment: HorizontalAlignment
    let spacing: CGFloat?
    let content: Content
    public init(alignment: HorizontalAlignment = .center, spacing: CGFloat? = nil, @ViewBuilder content: () -> Content) {
        self.alignment = alignment
        self.spacing = spacing
        self.content = content()
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "vstack", props: ["align": .string(alignment.rawValue), "spacing": .optional(spacing)])
        node.children = ctx.renderFlattened(content)
        return node
    }
}

public struct HStack<Content: View>: View, _PrimitiveView {
    let alignment: VerticalAlignment
    let spacing: CGFloat?
    let content: Content
    public init(alignment: VerticalAlignment = .center, spacing: CGFloat? = nil, @ViewBuilder content: () -> Content) {
        self.alignment = alignment
        self.spacing = spacing
        self.content = content()
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "hstack", props: ["align": .string(alignment.rawValue), "spacing": .optional(spacing)])
        node.children = ctx.renderFlattened(content)
        return node
    }
}

public struct ZStack<Content: View>: View, _PrimitiveView {
    let alignment: Alignment
    let content: Content
    public init(alignment: Alignment = .center, @ViewBuilder content: () -> Content) {
        self.alignment = alignment
        self.content = content()
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "zstack", props: ["align": alignment.json])
        node.children = ctx.renderFlattened(content)
        return node
    }
}

public typealias LazyVStack = VStack
public typealias LazyHStack = HStack

extension VStack {
    public init(alignment: HorizontalAlignment = .center, spacing: CGFloat? = nil, pinnedViews: PinnedScrollableViews, @ViewBuilder content: () -> Content) {
        self.init(alignment: alignment, spacing: spacing, content: content)
    }
}
extension HStack {
    public init(alignment: VerticalAlignment = .center, spacing: CGFloat? = nil, pinnedViews: PinnedScrollableViews, @ViewBuilder content: () -> Content) {
        self.init(alignment: alignment, spacing: spacing, content: content)
    }
}

public struct LazyVGrid<Content: View>: View, _PrimitiveView {
    let columns: [GridItem]
    let alignment: HorizontalAlignment
    let spacing: CGFloat?
    let content: Content
    public init(columns: [GridItem], alignment: HorizontalAlignment = .center, spacing: CGFloat? = nil, pinnedViews: PinnedScrollableViews = [], @ViewBuilder content: () -> Content) {
        self.columns = columns
        self.alignment = alignment
        self.spacing = spacing
        self.content = content()
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "vgrid", props: ["columns": .array(columns.map { $0.json }), "spacing": .optional(spacing), "align": .string(alignment.rawValue)])
        node.children = ctx.renderFlattened(content)
        return node
    }
}

public struct LazyHGrid<Content: View>: View, _PrimitiveView {
    let rows: [GridItem]
    let spacing: CGFloat?
    let content: Content
    public init(rows: [GridItem], alignment: VerticalAlignment = .center, spacing: CGFloat? = nil, pinnedViews: PinnedScrollableViews = [], @ViewBuilder content: () -> Content) {
        self.rows = rows
        self.spacing = spacing
        self.content = content()
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "hgrid", props: ["rows": .array(rows.map { $0.json }), "spacing": .optional(spacing)])
        node.children = ctx.renderFlattened(content)
        return node
    }
}

public struct Grid<Content: View>: View, _PrimitiveView {
    let content: Content
    let hSpacing: CGFloat?
    let vSpacing: CGFloat?
    public init(alignment: Alignment = .center, horizontalSpacing: CGFloat? = nil, verticalSpacing: CGFloat? = nil, @ViewBuilder content: () -> Content) {
        self.content = content()
        hSpacing = horizontalSpacing
        vSpacing = verticalSpacing
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "grid", props: ["hspacing": .optional(hSpacing), "vspacing": .optional(vSpacing)])
        node.children = ctx.renderFlattened(content)
        return node
    }
}

public struct GridRow<Content: View>: View, _PrimitiveView {
    let content: Content
    public init(alignment: VerticalAlignment? = nil, @ViewBuilder content: () -> Content) { self.content = content() }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "gridrow")
        node.children = ctx.renderFlattened(content)
        return node
    }
}

// MARK: - Spacer / Divider / Color-as-view

public struct Spacer: View, _PrimitiveView {
    let minLength: CGFloat?
    public init(minLength: CGFloat? = nil) { self.minLength = minLength }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        RenderNode(type: "spacer", props: ["min": .optional(minLength)])
    }
}

public struct Divider: View, _PrimitiveView {
    public init() {}
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode { RenderNode(type: "divider") }
}

extension Color: View, _PrimitiveView {
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode { RenderNode(type: "color", props: ["color": json]) }
}

extension LinearGradient: View, _PrimitiveView {
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode { RenderNode(type: "fill", props: ["style": _styleJSON]) }
}
extension RadialGradient: View, _PrimitiveView {
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode { RenderNode(type: "fill", props: ["style": _styleJSON]) }
}

// MARK: - ScrollView

public struct ScrollView<Content: View>: View, _PrimitiveView {
    let axes: Axis.Set
    let showsIndicators: Bool
    let content: Content
    public init(_ axes: Axis.Set = .vertical, showsIndicators: Bool = true, @ViewBuilder content: () -> Content) {
        self.axes = axes
        self.showsIndicators = showsIndicators
        self.content = content()
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "scroll", props: [
            "h": .bool(axes.contains(.horizontal)), "v": .bool(axes.contains(.vertical)), "indicators": .bool(showsIndicators),
        ])
        node.children = ctx.renderFlattened(content)
        return node
    }
}

public struct ScrollViewReader<Content: View>: View {
    let content: (ScrollViewProxy) -> Content
    public init(@ViewBuilder content: @escaping (ScrollViewProxy) -> Content) { self.content = content }
    public var body: some View { content(ScrollViewProxy()) }
}
public struct ScrollViewProxy {
    public func scrollTo<ID: Hashable>(_ id: ID, anchor: UnitPoint? = nil) {}
}

// MARK: - GeometryReader (reports the host-provided container size)

public struct GeometryProxy {
    public var size: CGSize
    public var safeAreaInsets: EdgeInsets = EdgeInsets()
    public func frame(in space: CoordinateSpace) -> CGRect { CGRect(origin: .zero, size: size) }
}
public enum CoordinateSpace { case global, local, named(AnyHashable) }

public struct GeometryReader<Content: View>: View, _PrimitiveView {
    let content: (GeometryProxy) -> Content
    public init(@ViewBuilder content: @escaping (GeometryProxy) -> Content) { self.content = content }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let size = (ctx.currentStorage().values["size"] as? CGSize) ?? CGSize(width: 393, height: 600)
        let node = RenderNode(type: "geometry")
        ctx.register(node, "size") { v in
            if let w = v["w"].doubleValue, let h = v["h"].doubleValue {
                ctx.storage(for: node.id!).values["size"] = CGSize(width: w, height: h)
            }
        }
        node.children = ctx.renderFlattened(content(GeometryProxy(size: size)))
        return node
    }
}

// MARK: - Shapes

public protocol Shape: View {
    var _shapeJSON: JSON { get }
}

public struct _ShapeView: View, _PrimitiveView {
    let shape: JSON
    var fill: JSON?
    var stroke: JSON?
    var lineWidth: CGFloat = 1
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        var p: [String: JSON] = ["shape": shape]
        if let f = fill { p["fill"] = f }
        if let s = stroke { p["stroke"] = s; p["lineWidth"] = JSON(lineWidth) }
        return RenderNode(type: "shape", props: p)
    }
}

extension Shape {
    public var body: some View { _ShapeView(shape: _shapeJSON, fill: ["hier": 1]) }
    public func fill<S: ShapeStyle>(_ style: S, style fillStyle: FillStyle = FillStyle()) -> _ShapeView { _ShapeView(shape: _shapeJSON, fill: style._styleJSON) }
    public func fill() -> _ShapeView { _ShapeView(shape: _shapeJSON, fill: ["hier": 1]) }
    public func stroke<S: ShapeStyle>(_ style: S, lineWidth: CGFloat = 1) -> _ShapeView { _ShapeView(shape: _shapeJSON, stroke: style._styleJSON, lineWidth: lineWidth) }
    public func stroke<S: ShapeStyle>(_ content: S, style: StrokeStyle) -> _ShapeView { _ShapeView(shape: _shapeJSON, stroke: content._styleJSON, lineWidth: style.lineWidth) }
    public func stroke(lineWidth: CGFloat = 1) -> _ShapeView { _ShapeView(shape: _shapeJSON, stroke: ["hier": 1], lineWidth: lineWidth) }
    public func strokeBorder<S: ShapeStyle>(_ style: S, lineWidth: CGFloat = 1) -> _ShapeView { stroke(style, lineWidth: lineWidth) }
    public func strokeBorder(lineWidth: CGFloat = 1) -> _ShapeView { stroke(lineWidth: lineWidth) }
    public func trim(from: CGFloat = 0, to: CGFloat = 1) -> Self { self }
    public func rotation(_ a: Angle, anchor: UnitPoint = .center) -> Self { self }
    public func scale(_ s: CGFloat, anchor: UnitPoint = .center) -> Self { self }
}

extension _ShapeView {
    public func fill<S: ShapeStyle>(_ style: S) -> _ShapeView { var v = self; v.fill = style._styleJSON; return v }
    public func stroke<S: ShapeStyle>(_ style: S, lineWidth: CGFloat = 1) -> _ShapeView { var v = self; v.stroke = style._styleJSON; v.lineWidth = lineWidth; return v }
}

public struct FillStyle { public init(eoFill: Bool = false, antialiased: Bool = true) {} }
public struct StrokeStyle {
    public var lineWidth: CGFloat
    public init(lineWidth: CGFloat = 1, lineCap: Any? = nil, lineJoin: Any? = nil, miterLimit: CGFloat = 10, dash: [CGFloat] = [], dashPhase: CGFloat = 0) { self.lineWidth = lineWidth }
}

public struct Angle: Hashable {
    public var radians: Double
    public var degrees: Double { radians * 180 / .pi }
    public init(radians: Double) { self.radians = radians }
    public init(degrees: Double) { radians = degrees * .pi / 180 }
    public static func degrees(_ d: Double) -> Angle { Angle(degrees: d) }
    public static func radians(_ r: Double) -> Angle { Angle(radians: r) }
    public static let zero = Angle(radians: 0)
}

public struct Rectangle: Shape { public init() {}; public var _shapeJSON: JSON { ["kind": "rect"] } }
public struct Circle: Shape { public init() {}; public var _shapeJSON: JSON { ["kind": "circle"] } }
public struct Ellipse: Shape { public init() {}; public var _shapeJSON: JSON { ["kind": "ellipse"] } }
public struct Capsule: Shape {
    public init(style: RoundedCornerStyle = .continuous) {}
    public var _shapeJSON: JSON { ["kind": "capsule"] }
}
public struct RoundedRectangle: Shape {
    let radius: CGFloat
    public init(cornerRadius: CGFloat, style: RoundedCornerStyle = .continuous) { radius = cornerRadius }
    public init(cornerSize: CGSize, style: RoundedCornerStyle = .continuous) { radius = cornerSize.width }
    public var _shapeJSON: JSON { ["kind": "rounded", "r": JSON(radius)] }
}
public struct UnevenRoundedRectangle: Shape {
    let tl: CGFloat, bl: CGFloat, br: CGFloat, tr: CGFloat
    public init(topLeadingRadius: CGFloat = 0, bottomLeadingRadius: CGFloat = 0, bottomTrailingRadius: CGFloat = 0, topTrailingRadius: CGFloat = 0, style: RoundedCornerStyle = .continuous) {
        tl = topLeadingRadius; bl = bottomLeadingRadius; br = bottomTrailingRadius; tr = topTrailingRadius
    }
    public var _shapeJSON: JSON { ["kind": "uneven", "tl": JSON(tl), "bl": JSON(bl), "br": JSON(br), "tr": JSON(tr)] }
}
public enum RoundedCornerStyle { case circular, continuous }

public struct Path: Shape {
    public init() {}
    public init(_ build: (inout Path) -> Void) { build(&self) }
    public mutating func move(to p: CGPoint) {}
    public mutating func addLine(to p: CGPoint) {}
    public mutating func addArc(center: CGPoint, radius: CGFloat, startAngle: Angle, endAngle: Angle, clockwise: Bool) {}
    public mutating func addCurve(to: CGPoint, control1: CGPoint, control2: CGPoint) {}
    public mutating func addQuadCurve(to: CGPoint, control: CGPoint) {}
    public mutating func addRect(_ r: CGRect) {}
    public mutating func addEllipse(in r: CGRect) {}
    public mutating func closeSubpath() {}
    public var _shapeJSON: JSON { ["kind": "path"] }
}

extension Shape where Self == Rectangle { public static var rect: Rectangle { Rectangle() } }
extension Shape where Self == Circle { public static var circle: Circle { Circle() } }
extension Shape where Self == Capsule { public static var capsule: Capsule { Capsule() } }
extension Shape where Self == Ellipse { public static var ellipse: Ellipse { Ellipse() } }
extension Shape where Self == RoundedRectangle {
    public static func rect(cornerRadius: CGFloat, style: RoundedCornerStyle = .continuous) -> RoundedRectangle { RoundedRectangle(cornerRadius: cornerRadius) }
}

public struct ContainerRelativeShape: Shape { public init() {}; public var _shapeJSON: JSON { ["kind": "rounded", "r": 12] } }
