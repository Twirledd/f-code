import Foundation

// MARK: - App / Scene

public protocol Scene {
    func _render(_ ctx: RenderContext) -> RenderNode
}

public struct WindowGroup<Content: View>: Scene {
    let content: Content
    let title: String?
    public init(@ViewBuilder content: () -> Content) { self.content = content(); title = nil }
    public init(_ title: String, @ViewBuilder content: () -> Content) { self.content = content(); self.title = title }
    public init(id: String, @ViewBuilder content: () -> Content) { self.content = content(); title = id }
    public func _render(_ ctx: RenderContext) -> RenderNode {
        ctx.withPath("WindowGroup") { ctx.render(content) }
    }
}

public struct Settings<Content: View>: Scene {
    let content: Content
    public init(@ViewBuilder content: () -> Content) { self.content = content() }
    public func _render(_ ctx: RenderContext) -> RenderNode { RenderNode(type: "empty") }
}

@resultBuilder
public enum SceneBuilder {
    public static func buildBlock<S: Scene>(_ s: S) -> S { s }
    public static func buildBlock<S0: Scene, S1: Scene>(_ s0: S0, _ s1: S1) -> S0 { s0 }
    public static func buildBlock<S0: Scene, S1: Scene, S2: Scene>(_ s0: S0, _ s1: S1, _ s2: S2) -> S0 { s0 }
}

public protocol App {
    associatedtype Body: Scene
    @SceneBuilder var body: Body { get }
    init()
}

extension App {
    public static func main() {
        let app = Self()
        PreviewHost.run { ctx in
            ctx.linkDynamicProperties(of: app)
            return app.body._render(ctx)
        }
    }
}

// MARK: - Preview host loop
//
// Wire protocol (newline-delimited JSON, each line prefixed with "\u{1}XC" so the
// program's own `print` output can be separated by the IDE):
//   app → host:  {"type":"tree","root":{...}}            after every render
//                {"type":"log","text":"..."}
//   host → app:  {"type":"event","id":"...","kind":"tap","value":...}
//                {"type":"env","colorScheme":"dark","dynamicTypeSize":"large","width":393,"height":852}
//                {"type":"quit"}

public enum PreviewHost {
    static let prefix = "\u{1}XC"
    static let trace = ProcessInfo.processInfo.environment["XCODE_PREVIEW_TRACE"] != nil

    public static func run(_ root: @escaping (RenderContext) -> RenderNode) {
        let ctx = RenderContext()
        RenderContext.current = ctx

        // Reader thread: host → app messages.
        let reader = Thread {
            while let line = readLine(strippingNewline: true) {
                guard let msg = JSONParser.parse(line) else { continue }
                ctx.enqueue(msg)
            }
            ctx.enqueue(["type": "quit"])
        }
        reader.start()

        emit(["type": "ready", "protocol": 1])

        var running = true
        while running {
            // Drain events.
            ctx.wakeup.lock()
            while ctx.pendingEvents.isEmpty && !ctx.needsRender { ctx.wakeup.wait() }
            let events = ctx.pendingEvents
            ctx.pendingEvents.removeAll()
            ctx.wakeup.unlock()

            for e in events {
                switch e["type"].stringValue {
                case "event":
                    if trace { log("[trace] dispatch \(e["kind"].stringValue ?? "?") \(e["id"].stringValue ?? "?")") }
                    ctx.dispatch(e)
                case "env": applyEnvironment(e, to: ctx)
                case "quit": running = false
                default: break
                }
            }
            if !running { break }
            // Handlers ran above and may have invalidated; one render covers both the events and any
            // invalidation. Clearing the flag here (not before dispatch) avoids a second identical render.
            ctx.wakeup.lock()
            let shouldRender = ctx.needsRender || !events.isEmpty
            ctx.needsRender = false
            ctx.wakeup.unlock()
            if shouldRender {
                if trace { log("[trace] render (events=\(events.count))") }
                renderOnce(ctx, root)
            }
        }
        exit(0)
    }

    static func renderOnce(_ ctx: RenderContext, _ root: (RenderContext) -> RenderNode) {
        ctx.handlers.removeAll()
        ctx.onAppear.removeAll()
        ctx.tasks.removeAll()
        ctx.path.removeAll()
        let node = root(ctx)
        emit(["type": "tree", "root": node.json])

        // Lifecycle: onAppear / task run once per identity after it first renders.
        var changed = false
        for (key, f) in ctx.onAppear {
            let s = ctx.storage(for: key)
            if !s.appeared {
                s.appeared = true
                f()
                changed = true
            }
        }
        for (key, f) in ctx.tasks where !ctx.startedTasks.contains(key) {
            ctx.startedTasks.insert(key)
            Task {
                await f()
                ctx.invalidate()
            }
        }
        if changed { ctx.invalidate() }
    }

    static func applyEnvironment(_ e: JSON, to ctx: RenderContext) {
        var env = ctx.environmentStack[0]
        if let cs = e["colorScheme"].stringValue, let v = ColorScheme(rawValue: cs) { env.colorScheme = v }
        if let dt = e["dynamicTypeSize"].stringValue {
            let names = ["xSmall", "small", "medium", "large", "xLarge", "xxLarge", "xxxLarge", "accessibility1", "accessibility2", "accessibility3", "accessibility4", "accessibility5"]
            if let i = names.firstIndex(of: dt), let v = DynamicTypeSize(rawValue: i) { env.dynamicTypeSize = v }
        }
        if let w = e["width"].doubleValue {
            env.horizontalSizeClass = w >= 600 ? .regular : .compact
        }
        ctx.environmentStack[0] = env
        ctx.needsRender = true
    }

    static func emit(_ msg: JSON) {
        FileHandle.standardOutput.write((prefix + msg.serialize() + "\n").data(using: .utf8)!)
    }

    public static func log(_ text: String) { emit(["type": "log", "text": .string(text)]) }
}

/// Entry point for previewing a single view without an `App` (used by generated preview mains).
public func _previewMain<V: View>(_ make: @escaping () -> V) -> Never {
    PreviewHost.run { ctx in ctx.render(make()) }
    fatalError("unreachable")
}
