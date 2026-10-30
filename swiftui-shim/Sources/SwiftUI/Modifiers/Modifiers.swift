import Foundation

// Layout-affecting and styling modifiers. Each appends a `_Modifier` record that the
// X-Code canvas applies in order (inner → outer), matching SwiftUI's wrapping semantics.

extension View {
    // MARK: Padding / frame / offset

    public func padding(_ edges: Edge.Set = .all, _ length: CGFloat? = nil) -> ModifiedContent<Self> {
        _mod("padding", ["edges": edgesJSON(edges), "length": .optional(length)])
    }
    public func padding(_ length: CGFloat) -> ModifiedContent<Self> { padding(.all, length) }
    public func padding(_ insets: EdgeInsets) -> ModifiedContent<Self> { _mod("padding", ["insets": insets.json]) }

    public func frame(width: CGFloat? = nil, height: CGFloat? = nil, alignment: Alignment = .center) -> ModifiedContent<Self> {
        _mod("frame", ["w": .optional(width), "h": .optional(height), "align": alignment.json])
    }
    public func frame(minWidth: CGFloat? = nil, idealWidth: CGFloat? = nil, maxWidth: CGFloat? = nil, minHeight: CGFloat? = nil, idealHeight: CGFloat? = nil, maxHeight: CGFloat? = nil, alignment: Alignment = .center) -> ModifiedContent<Self> {
        _mod("flexframe", [
            "minW": .optional(minWidth), "maxW": inf(maxWidth), "minH": .optional(minHeight), "maxH": inf(maxHeight),
            "idealW": .optional(idealWidth), "idealH": .optional(idealHeight), "align": alignment.json,
        ])
    }
    public func frame() -> ModifiedContent<Self> { _mod("frame", [:]) }
    public func fixedSize(horizontal: Bool = true, vertical: Bool = true) -> ModifiedContent<Self> {
        _mod("fixedSize", ["h": .bool(horizontal), "v": .bool(vertical)])
    }
    public func layoutPriority(_ p: Double) -> ModifiedContent<Self> { _mod("layoutPriority", ["p": JSON(p)]) }
    public func offset(x: CGFloat = 0, y: CGFloat = 0) -> ModifiedContent<Self> { _mod("offset", ["x": JSON(x), "y": JSON(y)]) }
    public func offset(_ size: CGSize) -> ModifiedContent<Self> { offset(x: size.width, y: size.height) }
    public func position(x: CGFloat, y: CGFloat) -> ModifiedContent<Self> { _mod("position", ["x": JSON(x), "y": JSON(y)]) }
    public func position(_ p: CGPoint) -> ModifiedContent<Self> { position(x: p.x, y: p.y) }
    public func aspectRatio(_ ratio: CGFloat? = nil, contentMode: ContentMode) -> ModifiedContent<Self> {
        _mod("aspect", ["ratio": .optional(ratio), "mode": .string(contentMode.rawValue)])
    }
    public func aspectRatio(_ size: CGSize, contentMode: ContentMode) -> ModifiedContent<Self> { aspectRatio(size.width / size.height, contentMode: contentMode) }
    public func scaledToFit() -> ModifiedContent<Self> { aspectRatio(contentMode: .fit) }
    public func scaledToFill() -> ModifiedContent<Self> { aspectRatio(contentMode: .fill) }
    public func ignoresSafeArea(_ regions: SafeAreaRegions = .all, edges: Edge.Set = .all) -> ModifiedContent<Self> { _mod("ignoresSafeArea", ["edges": edgesJSON(edges)]) }
    public func edgesIgnoringSafeArea(_ edges: Edge.Set) -> ModifiedContent<Self> { _mod("ignoresSafeArea", ["edges": edgesJSON(edges)]) }
    public func safeAreaInset<V: View>(edge: Edge, alignment: Alignment = .center, spacing: CGFloat? = nil, @ViewBuilder content: () -> V) -> ModifiedContent<Self> {
        _overlayLike("safeAreaInset", content(), ["edge": .string("\(edge)")])
    }
    public func safeAreaPadding(_ edges: Edge.Set = .all, _ length: CGFloat? = nil) -> ModifiedContent<Self> { padding(edges, length) }
    public func containerRelativeFrame(_ axes: Axis.Set, alignment: Alignment = .center) -> ModifiedContent<Self> { frame(maxWidth: .infinity) }
    public func zIndex(_ z: Double) -> ModifiedContent<Self> { _mod("zIndex", ["z": JSON(z)]) }

    // MARK: Background / overlay / border / clipping

    public func background<S: ShapeStyle>(_ style: S, ignoresSafeAreaEdges: Edge.Set = .all) -> ModifiedContent<Self> {
        _mod("background", ["style": style._styleJSON])
    }
    public func background<S: ShapeStyle, Sh: Shape>(_ style: S, in shape: Sh, fillStyle: FillStyle = FillStyle()) -> ModifiedContent<Self> {
        _mod("background", ["style": style._styleJSON, "shape": shape._shapeJSON])
    }
    public func background<V: View>(alignment: Alignment = .center, @ViewBuilder content: () -> V) -> ModifiedContent<Self> {
        _overlayLike("backgroundView", content(), ["align": alignment.json])
    }
    public func background<V: View>(_ view: V, alignment: Alignment = .center) -> ModifiedContent<Self> {
        _overlayLike("backgroundView", view, ["align": alignment.json])
    }
    public func background() -> ModifiedContent<Self> { _mod("background", ["style": ["background": true]]) }
    public func overlay<V: View>(alignment: Alignment = .center, @ViewBuilder content: () -> V) -> ModifiedContent<Self> {
        _overlayLike("overlay", content(), ["align": alignment.json])
    }
    public func overlay<V: View>(_ view: V, alignment: Alignment = .center) -> ModifiedContent<Self> {
        _overlayLike("overlay", view, ["align": alignment.json])
    }
    public func overlay<S: ShapeStyle>(_ style: S) -> ModifiedContent<Self> { _mod("overlayFill", ["style": style._styleJSON]) }
    public func overlay<S: ShapeStyle, Sh: Shape>(_ style: S, in shape: Sh) -> ModifiedContent<Self> {
        _mod("overlayFill", ["style": style._styleJSON, "shape": shape._shapeJSON])
    }
    public func border<S: ShapeStyle>(_ style: S, width: CGFloat = 1) -> ModifiedContent<Self> { _mod("border", ["style": style._styleJSON, "width": JSON(width)]) }
    public func cornerRadius(_ r: CGFloat, antialiased: Bool = true) -> ModifiedContent<Self> { _mod("clip", ["shape": ["kind": "rounded", "r": JSON(r)]]) }
    public func clipShape<Sh: Shape>(_ shape: Sh, style: FillStyle = FillStyle()) -> ModifiedContent<Self> { _mod("clip", ["shape": shape._shapeJSON]) }
    public func clipped(antialiased: Bool = false) -> ModifiedContent<Self> { _mod("clip", ["shape": ["kind": "rect"]]) }
    public func mask<V: View>(alignment: Alignment = .center, @ViewBuilder _ mask: () -> V) -> ModifiedContent<Self> { _overlayLike("mask", mask(), [:]) }
    public func shadow(color: Color = Color(white: 0, opacity: 0.33), radius: CGFloat, x: CGFloat = 0, y: CGFloat = 0) -> ModifiedContent<Self> {
        _mod("shadow", ["color": color.json, "radius": JSON(radius), "x": JSON(x), "y": JSON(y)])
    }
    public func glassEffect() -> ModifiedContent<Self> { _mod("background", ["style": ["material": "regular"], "shape": ["kind": "capsule"]]) }

    func _overlayLike<V: View>(_ kind: String, _ view: V, _ args: [String: JSON]) -> ModifiedContent<Self> {
        _renderMod(OverlayModifier(kind: kind, view: AnyView(view), args: args))
    }

    // MARK: Text & font styling (inherited by descendants)

    public func font(_ f: Font?) -> ModifiedContent<Self> { _mod("font", ["font": f.map { $0.json } ?? .null]) }
    public func fontWeight(_ w: Font.Weight?) -> ModifiedContent<Self> { _mod("fontWeight", ["weight": .optional(w?.rawValue)]) }
    public func fontDesign(_ d: Font.Design?) -> ModifiedContent<Self> { _mod("fontDesign", ["design": .optional(d?.rawValue)]) }
    public func fontWidth(_ w: Font.Width?) -> ModifiedContent<Self> { _mod("noop") }
    public func bold(_ on: Bool = true) -> ModifiedContent<Self> { _mod("fontWeight", ["weight": on ? "bold" : .null]) }
    public func italic(_ on: Bool = true) -> ModifiedContent<Self> { _mod("italic", ["on": .bool(on)]) }
    public func underline(_ on: Bool = true, color: Color? = nil) -> ModifiedContent<Self> { _mod("underline", ["on": .bool(on)]) }
    public func strikethrough(_ on: Bool = true, color: Color? = nil) -> ModifiedContent<Self> { _mod("strike", ["on": .bool(on)]) }
    public func monospaced(_ on: Bool = true) -> ModifiedContent<Self> { _mod("fontDesign", ["design": on ? "monospaced" : .null]) }
    public func monospacedDigit() -> ModifiedContent<Self> { _mod("noop") }
    public func foregroundColor(_ c: Color?) -> ModifiedContent<Self> { _mod("foreground", ["style": c.map { $0._styleJSON } ?? .null]) }
    public func foregroundStyle<S: ShapeStyle>(_ s: S) -> ModifiedContent<Self> { _mod("foreground", ["style": s._styleJSON]) }
    public func foregroundStyle<S1: ShapeStyle, S2: ShapeStyle>(_ p: S1, _ s: S2) -> ModifiedContent<Self> { _mod("foreground", ["style": p._styleJSON]) }
    public func tint<S: ShapeStyle>(_ s: S?) -> ModifiedContent<Self> { _mod("tint", ["style": s?._styleJSON ?? .null]) }
    public func accentColor(_ c: Color?) -> ModifiedContent<Self> { _mod("tint", ["style": c?._styleJSON ?? .null]) }
    public func multilineTextAlignment(_ a: TextAlignment) -> ModifiedContent<Self> { _mod("textAlign", ["align": .string(a.rawValue)]) }
    public func lineLimit(_ n: Int?) -> ModifiedContent<Self> { _mod("lineLimit", ["n": n.map { JSON($0) } ?? .null]) }
    public func lineLimit(_ r: ClosedRange<Int>) -> ModifiedContent<Self> { _mod("lineLimit", ["n": JSON(r.upperBound), "min": JSON(r.lowerBound)]) }
    public func lineLimit(_ n: Int, reservesSpace: Bool) -> ModifiedContent<Self> { _mod("lineLimit", ["n": JSON(n), "reserve": .bool(reservesSpace)]) }
    public func lineSpacing(_ s: CGFloat) -> ModifiedContent<Self> { _mod("lineSpacing", ["s": JSON(s)]) }
    public func truncationMode(_ m: Text.TruncationMode) -> ModifiedContent<Self> { _mod("noop") }
    public func minimumScaleFactor(_ f: CGFloat) -> ModifiedContent<Self> { _mod("noop") }
    public func allowsTightening(_ b: Bool) -> ModifiedContent<Self> { _mod("noop") }
    public func textCase(_ c: Text.Case?) -> ModifiedContent<Self> { _mod("textCase", ["case": c == .uppercase ? "upper" : c == .lowercase ? "lower" : .null]) }
    public func textSelection<S>(_ s: S) -> ModifiedContent<Self> { _mod("noop") }
    public func kerning(_ k: CGFloat) -> ModifiedContent<Self> { _mod("kerning", ["k": JSON(k)]) }
    public func tracking(_ k: CGFloat) -> ModifiedContent<Self> { _mod("kerning", ["k": JSON(k)]) }
    public func dynamicTypeSize(_ s: DynamicTypeSize) -> ModifiedContent<Self> { _mod("noop") }
    public func dynamicTypeSize<R: RangeExpression>(_ r: R) -> ModifiedContent<Self> where R.Bound == DynamicTypeSize { _mod("noop") }
    public func symbolRenderingMode(_ m: SymbolRenderingMode?) -> ModifiedContent<Self> { _mod("noop") }
    public func symbolVariant(_ v: SymbolVariants) -> ModifiedContent<Self> { _mod("symbolVariant", ["v": .string(v.name)]) }
    public func symbolEffect<T>(_ e: T, value: some Equatable) -> ModifiedContent<Self> { _mod("noop") }
    public func symbolEffect<T>(_ e: T) -> ModifiedContent<Self> { _mod("noop") }

    // MARK: Appearance

    public func opacity(_ o: Double) -> ModifiedContent<Self> { _mod("opacity", ["o": JSON(o)]) }
    public func hidden() -> ModifiedContent<Self> { _mod("hidden") }
    public func disabled(_ d: Bool) -> some View { _env { $0.isEnabled = !d }._mod("disabled", ["d": .bool(d)]) }
    public func blur(radius: CGFloat, opaque: Bool = false) -> ModifiedContent<Self> { _mod("blur", ["r": JSON(radius)]) }
    public func brightness(_ b: Double) -> ModifiedContent<Self> { _mod("brightness", ["b": JSON(b)]) }
    public func contrast(_ c: Double) -> ModifiedContent<Self> { _mod("contrast", ["c": JSON(c)]) }
    public func saturation(_ s: Double) -> ModifiedContent<Self> { _mod("saturation", ["s": JSON(s)]) }
    public func grayscale(_ g: Double) -> ModifiedContent<Self> { _mod("grayscale", ["g": JSON(g)]) }
    public func colorInvert() -> ModifiedContent<Self> { _mod("invert") }
    public func colorMultiply(_ c: Color) -> ModifiedContent<Self> { _mod("noop") }
    public func hueRotation(_ a: Angle) -> ModifiedContent<Self> { _mod("hueRotate", ["deg": JSON(a.degrees)]) }
    public func rotationEffect(_ a: Angle, anchor: UnitPoint = .center) -> ModifiedContent<Self> { _mod("rotate", ["deg": JSON(a.degrees), "anchor": anchor.json]) }
    public func rotation3DEffect(_ a: Angle, axis: (x: CGFloat, y: CGFloat, z: CGFloat), anchor: UnitPoint = .center, anchorZ: CGFloat = 0, perspective: CGFloat = 1) -> ModifiedContent<Self> {
        _mod("rotate3d", ["deg": JSON(a.degrees), "x": JSON(axis.x), "y": JSON(axis.y), "z": JSON(axis.z)])
    }
    public func scaleEffect(_ s: CGFloat, anchor: UnitPoint = .center) -> ModifiedContent<Self> { _mod("scale", ["x": JSON(s), "y": JSON(s), "anchor": anchor.json]) }
    public func scaleEffect(x: CGFloat = 1, y: CGFloat = 1, anchor: UnitPoint = .center) -> ModifiedContent<Self> { _mod("scale", ["x": JSON(x), "y": JSON(y), "anchor": anchor.json]) }
    public func scaleEffect(_ s: CGSize, anchor: UnitPoint = .center) -> ModifiedContent<Self> { scaleEffect(x: s.width, y: s.height, anchor: anchor) }
    public func transformEffect(_ t: Any) -> ModifiedContent<Self> { _mod("noop") }
    public func compositingGroup() -> ModifiedContent<Self> { _mod("noop") }
    public func drawingGroup(opaque: Bool = false, colorMode: Any? = nil) -> ModifiedContent<Self> { _mod("noop") }
    public func preferredColorScheme(_ s: ColorScheme?) -> ModifiedContent<Self> { _mod("colorScheme", ["s": .optional(s?.rawValue)]) }
    public func colorScheme(_ s: ColorScheme) -> some View { _env { $0.colorScheme = s }._mod("colorScheme", ["s": .string(s.rawValue)]) }
    public func redacted(reason: RedactionReasons) -> ModifiedContent<Self> { _mod("redacted") }
    public func unredacted() -> ModifiedContent<Self> { _mod("noop") }
    public func privacySensitive(_ b: Bool = true) -> ModifiedContent<Self> { _mod("noop") }
    public func contentShape<Sh: Shape>(_ s: Sh, eoFill: Bool = false) -> ModifiedContent<Self> { _mod("noop") }
    public func contentShape<Sh: Shape>(_ kind: ContentShapeKinds, _ s: Sh, eoFill: Bool = false) -> ModifiedContent<Self> { _mod("noop") }
    public func allowsHitTesting(_ b: Bool) -> ModifiedContent<Self> { _mod("hitTesting", ["on": .bool(b)]) }
    public func transition(_ t: AnyTransition) -> ModifiedContent<Self> { _mod("noop") }
    public func animation<V: Equatable>(_ a: Animation?, value: V) -> ModifiedContent<Self> { _mod("animation", ["name": .optional(a?.name), "duration": .optional(a?.duration)]) }
    public func animation(_ a: Animation?) -> ModifiedContent<Self> { _mod("animation", ["name": .optional(a?.name), "duration": .optional(a?.duration)]) }
    public func contentTransition(_ t: Any) -> ModifiedContent<Self> { _mod("noop") }
    public func matchedGeometryEffect<ID: Hashable>(id: ID, in ns: Namespace.ID, properties: Any? = nil, anchor: UnitPoint = .center, isSource: Bool = true) -> ModifiedContent<Self> { _mod("noop") }
    public func geometryGroup() -> ModifiedContent<Self> { _mod("noop") }

    // MARK: Control styles

    public func buttonStyle<S: ButtonStyle>(_ s: S) -> ModifiedContent<Self> { _mod("buttonStyle", ["name": .string(s._name)]) }
    public func buttonBorderShape(_ s: ButtonBorderShape) -> ModifiedContent<Self> { _mod("buttonBorderShape", ["shape": .string(s.name)]) }
    public func controlSize(_ s: ControlSize) -> ModifiedContent<Self> { _mod("controlSize", ["size": .string(s.rawValue)]) }
    public func pickerStyle<S: PickerStyle>(_ s: S) -> ModifiedContent<Self> { _mod("pickerStyle", ["name": .string(s._name)]) }
    public func textFieldStyle<S: TextFieldStyle>(_ s: S) -> ModifiedContent<Self> { _mod("textFieldStyle", ["name": .string(s._name)]) }
    public func toggleStyle<S: ToggleStyle>(_ s: S) -> ModifiedContent<Self> { _mod("toggleStyle", ["name": .string(s._name)]) }
    public func labelStyle<S: LabelStyle>(_ s: S) -> ModifiedContent<Self> { _mod("labelStyle", ["name": .string(s._name)]) }
    public func progressViewStyle<S: ProgressViewStyle>(_ s: S) -> ModifiedContent<Self> { _mod("progressStyle", ["name": .string(s._name)]) }
    public func listStyle<S: ListStyle>(_ s: S) -> ModifiedContent<Self> { _mod("listStyle", ["name": .string(s._kind.rawValue)]) }
    public func tabViewStyle<S: TabViewStyle>(_ s: S) -> ModifiedContent<Self> { _mod("tabViewStyle", ["name": .string(s._name)]) }
    public func datePickerStyle<S>(_ s: S) -> ModifiedContent<Self> { _mod("noop") }
    public func menuStyle<S>(_ s: S) -> ModifiedContent<Self> { _mod("noop") }
    public func groupBoxStyle<S>(_ s: S) -> ModifiedContent<Self> { _mod("noop") }
    public func labelsHidden() -> ModifiedContent<Self> { _mod("labelsHidden") }
    public func keyboardType(_ t: UIKeyboardType) -> ModifiedContent<Self> { _mod("keyboard", ["type": .string(t.rawValue)]) }
    public func textInputAutocapitalization(_ a: TextInputAutocapitalization?) -> ModifiedContent<Self> { _mod("noop") }
    public func autocorrectionDisabled(_ d: Bool = true) -> ModifiedContent<Self> { _mod("noop") }
    public func submitLabel(_ l: SubmitLabel) -> ModifiedContent<Self> { _mod("submitLabel", ["label": .string(l.rawValue)]) }
    public func textContentType(_ t: Any?) -> ModifiedContent<Self> { _mod("noop") }
    public func focused<V: Hashable>(_ b: Binding<V?>, equals v: V) -> ModifiedContent<Self> { _mod("noop") }
    public func focused(_ b: Binding<Bool>) -> ModifiedContent<Self> { _mod("noop") }
    public func scrollContentBackground(_ v: Visibility) -> ModifiedContent<Self> { _mod("scrollContentBackground", ["v": .string(v.rawValue)]) }
    public func scrollIndicators(_ v: ScrollIndicatorVisibility, axes: Axis.Set = [.vertical, .horizontal]) -> ModifiedContent<Self> { _mod("scrollIndicators", ["v": .string(v.name)]) }
    public func scrollDisabled(_ d: Bool) -> ModifiedContent<Self> { _mod("scrollDisabled", ["d": .bool(d)]) }
    public func scrollDismissesKeyboard(_ m: Any) -> ModifiedContent<Self> { _mod("noop") }
    public func scrollTargetBehavior(_ b: Any) -> ModifiedContent<Self> { _mod("noop") }
    public func scrollTargetLayout(isEnabled: Bool = true) -> ModifiedContent<Self> { _mod("noop") }
    public func scrollBounceBehavior(_ b: Any, axes: Axis.Set = .vertical) -> ModifiedContent<Self> { _mod("noop") }
    public func scrollClipDisabled(_ d: Bool = true) -> ModifiedContent<Self> { _mod("noop") }
    public func defaultScrollAnchor(_ a: UnitPoint?) -> ModifiedContent<Self> { _mod("noop") }
    public func listRowBackground<V: View>(_ v: V?) -> ModifiedContent<Self> { v.map { _overlayLike("listRowBackground", $0, [:]) } ?? _mod("noop") }
    public func listRowInsets(_ i: EdgeInsets?) -> ModifiedContent<Self> { _mod("listRowInsets", ["insets": i?.json ?? .null]) }
    public func listRowSeparator(_ v: Visibility, edges: Edge.Set = .all) -> ModifiedContent<Self> { _mod("listRowSeparator", ["v": .string(v.rawValue)]) }
    public func listRowSeparatorTint(_ c: Color?, edges: Edge.Set = .all) -> ModifiedContent<Self> { _mod("noop") }
    public func listSectionSeparator(_ v: Visibility, edges: Edge.Set = .all) -> ModifiedContent<Self> { _mod("noop") }
    public func listRowSpacing(_ s: CGFloat?) -> ModifiedContent<Self> { _mod("listRowSpacing", ["s": .optional(s)]) }
    public func listSectionSpacing(_ s: CGFloat) -> ModifiedContent<Self> { _mod("noop") }
    public func listItemTint(_ c: Color?) -> ModifiedContent<Self> { _mod("noop") }
    public func headerProminence(_ p: Prominence) -> ModifiedContent<Self> { _mod("noop") }
    public func badge(_ n: Int) -> ModifiedContent<Self> { _mod("badge", ["text": n == 0 ? .null : .string(String(n))]) }
    public func badge(_ s: String?) -> ModifiedContent<Self> { _mod("badge", ["text": .optional(s)]) }
    public func swipeActions<V: View>(edge: HorizontalEdge = .trailing, allowsFullSwipe: Bool = true, @ViewBuilder content: () -> V) -> ModifiedContent<Self> { _mod("noop") }
    public func refreshable(action: @escaping @Sendable () async -> Void) -> ModifiedContent<Self> { _mod("noop") }
    public func searchable(text: Binding<String>, placement: Any? = nil, prompt: String? = nil) -> ModifiedContent<Self> {
        _renderMod(SearchableModifier(text: text, prompt: prompt ?? "Search"))
    }
    public func searchable(text: Binding<String>, prompt: Text?) -> ModifiedContent<Self> {
        _renderMod(SearchableModifier(text: text, prompt: prompt?.runs.map(\.string).joined() ?? "Search"))
    }
    public func deleteDisabled(_ b: Bool) -> ModifiedContent<Self> { _mod("noop") }
    public func moveDisabled(_ b: Bool) -> ModifiedContent<Self> { _mod("noop") }
    public func selectionDisabled(_ b: Bool = true) -> ModifiedContent<Self> { _mod("noop") }
    public func interactiveDismissDisabled(_ b: Bool = true) -> ModifiedContent<Self> { _mod("noop") }
    public func presentationDetents(_ d: Set<PresentationDetent>) -> ModifiedContent<Self> { _mod("detents", ["medium": .bool(d.contains(.medium) && !d.contains(.large))]) }
    public func presentationDetents(_ d: Set<PresentationDetent>, selection: Binding<PresentationDetent>) -> ModifiedContent<Self> { presentationDetents(d) }
    public func presentationDragIndicator(_ v: Visibility) -> ModifiedContent<Self> { _mod("noop") }
    public func presentationBackground<S: ShapeStyle>(_ s: S) -> ModifiedContent<Self> { _mod("noop") }
    public func presentationCornerRadius(_ r: CGFloat?) -> ModifiedContent<Self> { _mod("noop") }
    public func presentationBackgroundInteraction(_ i: Any) -> ModifiedContent<Self> { _mod("noop") }

    // MARK: Navigation chrome

    public func navigationTitle(_ t: String) -> ModifiedContent<Self> { _mod("navTitle", ["title": .string(t)]) }
    public func navigationTitle(_ t: LocalizedStringKey) -> ModifiedContent<Self> { navigationTitle(t.key) }
    public func navigationTitle(_ t: Text) -> ModifiedContent<Self> { navigationTitle(t.runs.map(\.string).joined()) }
    public func navigationTitle(_ t: Binding<String>) -> ModifiedContent<Self> { navigationTitle(t.wrappedValue) }
    public func navigationSubtitle(_ t: String) -> ModifiedContent<Self> { _mod("noop") }
    public func navigationBarTitleDisplayMode(_ m: NavigationBarItemTitleDisplayMode) -> ModifiedContent<Self> { _mod("navTitleMode", ["mode": .string(m.rawValue)]) }
    public func navigationBarHidden(_ h: Bool) -> ModifiedContent<Self> { _mod("navBarHidden", ["h": .bool(h)]) }
    public func navigationBarBackButtonHidden(_ h: Bool = true) -> ModifiedContent<Self> { _mod("navBackHidden", ["h": .bool(h)]) }
    public func navigationBarTitle(_ t: String, displayMode: NavigationBarItemTitleDisplayMode = .automatic) -> some View { navigationTitle(t)._mod("navTitleMode", ["mode": .string(displayMode.rawValue)]) }
    public func navigationDestination<D: Hashable, C: View>(for type: D.Type, @ViewBuilder destination: @escaping (D) -> C) -> ModifiedContent<Self> {
        _env { env in env.destinations[String(describing: D.self)] = { any in AnyView(destination(any as! D)) } }
    }
    public func navigationDestination<C: View>(isPresented: Binding<Bool>, @ViewBuilder destination: () -> C) -> ModifiedContent<Self> {
        let d = destination()
        return _renderMod(NavigationDestinationPresenter(isPresented: isPresented, view: AnyView(d)))
    }
    public func navigationDestination<D: Hashable, C: View>(item: Binding<D?>, @ViewBuilder destination: @escaping (D) -> C) -> ModifiedContent<Self> {
        let presented = Binding(get: { item.wrappedValue != nil }, set: { if !$0 { item.wrappedValue = nil } })
        let v = item.wrappedValue.map { AnyView(destination($0)) } ?? AnyView(EmptyView())
        return _renderMod(NavigationDestinationPresenter(isPresented: presented, view: v))
    }
    public func toolbar<C: View>(@ViewBuilder content: () -> C) -> ModifiedContent<Self> { _overlayLike("toolbar", content(), [:]) }
    public func toolbar(_ v: Visibility, for bars: Any...) -> ModifiedContent<Self> { _mod("toolbarVisibility", ["v": .string(v.rawValue)]) }
    public func toolbarBackground<S: ShapeStyle>(_ s: S, for bars: Any...) -> ModifiedContent<Self> { _mod("noop") }
    public func toolbarBackground(_ v: Visibility, for bars: Any...) -> ModifiedContent<Self> { _mod("noop") }
    public func toolbarColorScheme(_ s: ColorScheme?, for bars: Any...) -> ModifiedContent<Self> { _mod("noop") }
    public func toolbarTitleDisplayMode(_ m: Any) -> ModifiedContent<Self> { _mod("noop") }
    public func toolbarRole(_ r: Any) -> ModifiedContent<Self> { _mod("noop") }
    public func navigationBarItems<L: View, T: View>(leading: L, trailing: T) -> ModifiedContent<Self> {
        toolbar { ToolbarItem(placement: .navigationBarLeading) { leading }; ToolbarItem(placement: .navigationBarTrailing) { trailing } }
    }
    public func navigationBarItems<T: View>(trailing: T) -> ModifiedContent<Self> { toolbar { ToolbarItem(placement: .navigationBarTrailing) { trailing } } }
    public func navigationBarItems<L: View>(leading: L) -> ModifiedContent<Self> { toolbar { ToolbarItem(placement: .navigationBarLeading) { leading } } }
    public func tabItem<V: View>(@ViewBuilder _ label: () -> V) -> ModifiedContent<Self> { _overlayLike("tabItem", label(), [:]) }
    public func tag<V: Hashable>(_ t: V) -> ModifiedContent<Self> { _renderMod(TagModifier(tag: AnyHashable(t))) }
    public func id<ID: Hashable>(_ i: ID) -> ModifiedContent<Self> { _renderMod(IdentityModifier(id: String(describing: i))) }
    public func statusBarHidden(_ h: Bool = true) -> ModifiedContent<Self> { _mod("statusBarHidden", ["h": .bool(h)]) }
    public func persistentSystemOverlays(_ v: Visibility) -> ModifiedContent<Self> { _mod("noop") }

    // MARK: Lifecycle & gestures

    public func onAppear(perform action: (() -> Void)? = nil) -> ModifiedContent<Self> { _renderMod(LifecycleModifier(onAppear: action)) }
    public func onDisappear(perform action: (() -> Void)? = nil) -> ModifiedContent<Self> { _mod("noop") }
    public func task(priority: TaskPriority = .userInitiated, _ action: @escaping @Sendable () async -> Void) -> ModifiedContent<Self> {
        _renderMod(LifecycleModifier(task: action))
    }
    public func task<T: Equatable>(id: T, priority: TaskPriority = .userInitiated, _ action: @escaping @Sendable () async -> Void) -> ModifiedContent<Self> {
        _renderMod(LifecycleModifier(task: action, taskID: String(describing: id)))
    }
    public func onChange<V: Equatable>(of value: V, initial: Bool = false, _ action: @escaping () -> Void) -> ModifiedContent<Self> {
        _renderMod(ChangeModifier(value: AnyEquatable(value), initial: initial) { _, _ in action() })
    }
    public func onChange<V: Equatable>(of value: V, initial: Bool = false, _ action: @escaping (V, V) -> Void) -> ModifiedContent<Self> {
        _renderMod(ChangeModifier(value: AnyEquatable(value), initial: initial) { old, new in action((old.base as? V) ?? value, (new.base as? V) ?? value) })
    }
    public func onChange<V: Equatable>(of value: V, perform action: @escaping (V) -> Void) -> ModifiedContent<Self> {
        _renderMod(ChangeModifier(value: AnyEquatable(value), initial: false) { _, new in action((new.base as? V) ?? value) })
    }
    public func onTapGesture(count: Int = 1, perform action: @escaping () -> Void) -> ModifiedContent<Self> { _renderMod(GestureModifier(kind: "tap", action: action)) }
    public func onTapGesture(count: Int = 1, coordinateSpace: Any? = nil, perform action: @escaping (CGPoint) -> Void) -> ModifiedContent<Self> { _renderMod(GestureModifier(kind: "tap", action: { action(.zero) })) }
    public func onLongPressGesture(minimumDuration: Double = 0.5, maximumDistance: CGFloat = 10, perform action: @escaping () -> Void, onPressingChanged: ((Bool) -> Void)? = nil) -> ModifiedContent<Self> { _renderMod(GestureModifier(kind: "longpress", action: action)) }
    public func onSubmit(of triggers: Any? = nil, _ action: @escaping () -> Void) -> ModifiedContent<Self> { _renderMod(GestureModifier(kind: "submit", action: action)) }
    public func gesture<G>(_ g: G, including mask: Any? = nil) -> ModifiedContent<Self> { _mod("noop") }
    public func simultaneousGesture<G>(_ g: G, including mask: Any? = nil) -> ModifiedContent<Self> { _mod("noop") }
    public func highPriorityGesture<G>(_ g: G, including mask: Any? = nil) -> ModifiedContent<Self> { _mod("noop") }
    public func onReceive<P>(_ p: P, perform: @escaping (Any) -> Void) -> ModifiedContent<Self> { _mod("noop") }
    public func onOpenURL(perform: @escaping (URL) -> Void) -> ModifiedContent<Self> { _mod("noop") }
    public func onHover(perform: @escaping (Bool) -> Void) -> ModifiedContent<Self> { _mod("noop") }
    public func keyboardShortcut(_ k: Any, modifiers: Any? = nil) -> ModifiedContent<Self> { _mod("noop") }
    public func contextMenu<M: View>(@ViewBuilder menuItems: () -> M) -> ModifiedContent<Self> { _overlayLike("contextMenu", menuItems(), [:]) }
    public func help(_ s: String) -> ModifiedContent<Self> { _mod("help", ["text": .string(s)]) }
    public func sensoryFeedback<T: Equatable>(_ f: Any, trigger: T) -> ModifiedContent<Self> { _mod("noop") }

    // MARK: Environment

    public func environment<V>(_ keyPath: WritableKeyPath<EnvironmentValues, V>, _ value: V) -> ModifiedContent<Self> {
        _env { $0[keyPath: keyPath] = value }
    }
    public func environmentObject<O: ObservableObject>(_ object: O) -> ModifiedContent<Self> {
        _env { $0.objects[ObjectIdentifier(O.self)] = object }
    }
    public func environment<O: AnyObject>(_ object: O?) -> ModifiedContent<Self> {
        _env { if let o = object { $0.objects[ObjectIdentifier(O.self)] = o } }
    }
    public func transformEnvironment<V>(_ keyPath: WritableKeyPath<EnvironmentValues, V>, transform: @escaping (inout V) -> Void) -> ModifiedContent<Self> {
        _env { transform(&$0[keyPath: keyPath]) }
    }
    public func preference<K: PreferenceKey>(key: K.Type, value: K.Value) -> ModifiedContent<Self> { _mod("noop") }
    public func onPreferenceChange<K: PreferenceKey>(_ key: K.Type, perform: @escaping (K.Value) -> Void) -> ModifiedContent<Self> where K.Value: Equatable { _mod("noop") }
    public func coordinateSpace(name: String) -> ModifiedContent<Self> { _mod("noop") }
    public func coordinateSpace<N: Hashable>(_ name: N) -> ModifiedContent<Self> { _mod("noop") }

    // MARK: Accessibility (accepted)

    public func accessibilityLabel(_ s: String) -> ModifiedContent<Self> { _mod("a11yLabel", ["text": .string(s)]) }
    public func accessibilityLabel(_ t: Text) -> ModifiedContent<Self> { _mod("a11yLabel", ["text": .string(t.runs.map(\.string).joined())]) }
    public func accessibilityHint(_ s: String) -> ModifiedContent<Self> { _mod("noop") }
    public func accessibilityValue(_ s: String) -> ModifiedContent<Self> { _mod("noop") }
    public func accessibilityIdentifier(_ s: String) -> ModifiedContent<Self> { _mod("testID", ["id": .string(s)]) }
    public func accessibilityHidden(_ b: Bool) -> ModifiedContent<Self> { _mod("noop") }
    public func accessibilityAddTraits(_ t: Any) -> ModifiedContent<Self> { _mod("noop") }
    public func accessibilityRemoveTraits(_ t: Any) -> ModifiedContent<Self> { _mod("noop") }
    public func accessibilityElement(children: Any? = nil) -> ModifiedContent<Self> { _mod("noop") }
    public func accessibilitySortPriority(_ p: Double) -> ModifiedContent<Self> { _mod("noop") }
    public func accessibilityAction(_ k: Any? = nil, _ h: @escaping () -> Void) -> ModifiedContent<Self> { _mod("noop") }
}

extension ModifiedContent {
    func _modChain(_ kind: String, _ args: JSON) -> ModifiedContent<Self> { _mod(kind, args) }
}

// MARK: - Render-time modifiers

struct OverlayModifier: _RenderModifier {
    let kind: String
    let view: AnyView
    let args: [String: JSON]
    func _apply(to node: RenderNode, ctx: RenderContext) {
        let child = ctx.withPath(kind) { ctx.render(view) }
        var a = args
        a["node"] = child.json
        node.modifiers.append(_Modifier(kind, .object(a)))
    }
}

struct TagModifier: _RenderModifier {
    let tag: AnyHashable
    func _apply(to node: RenderNode, ctx: RenderContext) {
        if node.id == nil { node.id = ctx.pathKey + "/tag" }
        var t = ctx.tagTable
        t[node.id!] = tag
        ctx.tagTable = t
    }
}

struct IdentityModifier: _RenderModifier {
    let id: String
    func _apply(to node: RenderNode, ctx: RenderContext) {
        node.props["viewID"] = .string(id)
    }
}

struct LifecycleModifier: _RenderModifier {
    var onAppear: (() -> Void)? = nil
    var task: (@Sendable () async -> Void)? = nil
    var taskID: String? = nil
    func _apply(to node: RenderNode, ctx: RenderContext) {
        let key = ctx.pathKey + "/life" + (taskID.map { "#\($0)" } ?? "")
        if let a = onAppear { ctx.onAppear.append((key, a)) }
        if let t = task { ctx.tasks.append((key, t)) }
    }
}

struct AnyEquatable {
    let base: Any
    let equals: (Any) -> Bool
    init<T: Equatable>(_ v: T) {
        base = v
        equals = { ($0 as? T) == v }
    }
}

struct ChangeModifier: _RenderModifier {
    let value: AnyEquatable
    let initial: Bool
    let action: (AnyEquatable, AnyEquatable) -> Void
    func _apply(to node: RenderNode, ctx: RenderContext) {
        let store = ctx.currentStorage()
        let key = "change:" + ctx.pathKey
        if let old = store.values[key] as? AnyEquatable {
            if !old.equals(value.base) {
                store.values[key] = value
                let new = value
                ctx.onAppear.append((UUID().uuidString, { action(old, new) }))
            }
        } else {
            store.values[key] = value
            if initial { ctx.onAppear.append((UUID().uuidString, { action(value, value) })) }
        }
    }
}

struct GestureModifier: _RenderModifier {
    let kind: String
    let action: () -> Void
    func _apply(to node: RenderNode, ctx: RenderContext) {
        ctx.register(node, kind) { _ in action() }
        node.modifiers.append(_Modifier("gesture", ["kind": .string(kind)]))
    }
}

struct SearchableModifier: _RenderModifier {
    let text: Binding<String>
    let prompt: String
    func _apply(to node: RenderNode, ctx: RenderContext) {
        if node.id == nil { node.id = ctx.pathKey + "/search" }
        ctx.register(node, "search") { v in text.wrappedValue = v.stringValue ?? "" }
        node.modifiers.append(_Modifier("searchable", ["text": .string(text.wrappedValue), "prompt": .string(prompt)]))
    }
}

struct NavigationDestinationPresenter: _RenderModifier {
    let isPresented: Binding<Bool>
    let view: AnyView
    func _apply(to node: RenderNode, ctx: RenderContext) {
        let store = ctx.currentStorage()
        let wasPresented = store.values["navdest"] as? Bool ?? false
        if isPresented.wrappedValue && !wasPresented {
            store.values["navdest"] = true
            let nav = ctx.environment.navigation
            let onPop = view
            ctx.onAppear.append((UUID().uuidString, {
                nav.push(AnyView(onPop._env { $0.dismiss = DismissAction { isPresented.wrappedValue = false; store.values["navdest"] = false; nav.pop() } }))
            }))
        } else if !isPresented.wrappedValue && wasPresented {
            store.values["navdest"] = false
        }
    }
}

// MARK: - Toolbar items

public struct ToolbarItem<Content: View>: View, _PrimitiveView {
    let placement: ToolbarItemPlacement
    let content: Content
    public init(id: String = "", placement: ToolbarItemPlacement = .automatic, @ViewBuilder content: () -> Content) {
        self.placement = placement
        self.content = content()
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "toolbarItem", props: ["placement": .string(placement.rawValue)])
        node.children = ctx.renderFlattened(content)
        return node
    }
}

public struct ToolbarItemGroup<Content: View>: View, _PrimitiveView {
    let placement: ToolbarItemPlacement
    let content: Content
    public init(placement: ToolbarItemPlacement = .automatic, @ViewBuilder content: () -> Content) {
        self.placement = placement
        self.content = content()
    }
    public typealias Body = Never
    public func _render(_ ctx: RenderContext) -> RenderNode {
        let node = RenderNode(type: "toolbarItem", props: ["placement": .string(placement.rawValue)])
        node.children = ctx.renderFlattened(content)
        return node
    }
}

// MARK: - Supporting types referenced by modifiers

public struct ButtonBorderShape { var name: String
    public static let automatic = ButtonBorderShape(name: "automatic")
    public static let capsule = ButtonBorderShape(name: "capsule")
    public static let circle = ButtonBorderShape(name: "circle")
    public static let roundedRectangle = ButtonBorderShape(name: "roundedRectangle")
    public static func roundedRectangle(radius: CGFloat) -> ButtonBorderShape { ButtonBorderShape(name: "roundedRectangle") }
}
public enum Prominence { case standard, increased }
public enum HorizontalEdge { case leading, trailing }
public struct RedactionReasons: OptionSet {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }
    public static let placeholder = RedactionReasons(rawValue: 1)
    public static let privacy = RedactionReasons(rawValue: 2)
}
public struct ContentShapeKinds: OptionSet {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }
    public static let interaction = ContentShapeKinds(rawValue: 1)
    public static let contextMenuPreview = ContentShapeKinds(rawValue: 2)
}
public enum SymbolRenderingMode { case monochrome, hierarchical, palette, multicolor }
public struct SymbolVariants { var name: String
    public static let none = SymbolVariants(name: "none")
    public static let circle = SymbolVariants(name: "circle")
    public static let square = SymbolVariants(name: "square")
    public static let rectangle = SymbolVariants(name: "rectangle")
    public static let fill = SymbolVariants(name: "fill")
    public static let slash = SymbolVariants(name: "slash")
}
public protocol PreferenceKey {
    associatedtype Value
    static var defaultValue: Value { get }
    static func reduce(value: inout Value, nextValue: () -> Value)
}
@propertyWrapper
public struct Namespace: _DynamicProperty {
    public struct ID: Hashable { let raw: Int }
    public init() {}
    public var wrappedValue: ID { ID(raw: 0) }
    public func _link(storage: NodeStorage, label: String, ctx: RenderContext) {}
}
extension Text {
    public enum TruncationMode { case head, middle, tail }
}
public struct TapGesture { public init(count: Int = 1) {}; public func onEnded(_ f: @escaping () -> Void) -> TapGesture { self } }
public struct DragGesture {
    public struct Value { public var translation: CGSize = .zero; public var location: CGPoint = .zero; public var startLocation: CGPoint = .zero; public var predictedEndTranslation: CGSize = .zero; public var velocity: CGSize = .zero }
    public init(minimumDistance: CGFloat = 10, coordinateSpace: Any? = nil) {}
    public func onChanged(_ f: @escaping (Value) -> Void) -> DragGesture { self }
    public func onEnded(_ f: @escaping (Value) -> Void) -> DragGesture { self }
}
public struct LongPressGesture { public init(minimumDuration: Double = 0.5) {}; public func onEnded(_ f: @escaping (Bool) -> Void) -> LongPressGesture { self } }
public struct MagnificationGesture { public init() {}; public func onChanged(_ f: @escaping (CGFloat) -> Void) -> MagnificationGesture { self }; public func onEnded(_ f: @escaping (CGFloat) -> Void) -> MagnificationGesture { self } }
public struct RotationGesture { public init() {}; public func onChanged(_ f: @escaping (Angle) -> Void) -> RotationGesture { self }; public func onEnded(_ f: @escaping (Angle) -> Void) -> RotationGesture { self } }
@propertyWrapper
public struct GestureState<Value>: _DynamicProperty {
    let initial: Value
    public init(initialValue: Value) { initial = initialValue }
    public init(wrappedValue: Value) { initial = wrappedValue }
    public var wrappedValue: Value { initial }
    public var projectedValue: GestureState<Value> { self }
    public func _link(storage: NodeStorage, label: String, ctx: RenderContext) {}
}

// MARK: - Helpers

func edgesJSON(_ e: Edge.Set) -> JSON {
    ["t": .bool(e.contains(.top)), "l": .bool(e.contains(.leading)), "b": .bool(e.contains(.bottom)), "r": .bool(e.contains(.trailing))]
}
func inf(_ v: CGFloat?) -> JSON {
    guard let v = v else { return .null }
    return v.isInfinite ? .string("inf") : JSON(v)
}
