import { create } from 'zustand'
import type {
  Breakpoint,
  BuildStatus,
  ConsoleChunk,
  DebugStatus,
  Diagnostic,
  LspDiagnostic,
  MacConnection,
  MacRunStatus,
  MacStatus,
  ProjectInfo,
  RecentProject,
  RunDestination,
  SimDevice,
  TestResult,
  ToolchainInfo
} from '@shared/types'
import type { PreviewNode, PreviewStatus } from '@shared/preview-types'

export type NavigatorKind =
  | 'project'
  | 'scm'
  | 'symbols'
  | 'find'
  | 'issues'
  | 'tests'
  | 'debug'
  | 'breakpoints'
  | 'reports'

export type InspectorKind = 'file' | 'help'
export type Screen = 'welcome' | 'ide'
export type Sheet = 'none' | 'newProject' | 'settings' | 'newFile' | 'openQuickly' | 'about' | 'gotoLine' | 'clone' | 'gitDiff'

export interface Tab {
  path: string
  name: string
  content: string
  saved: string
  loading: boolean
}

export interface ConsoleLine extends ConsoleChunk {
  id: number
}

interface State {
  screen: Screen
  sheet: Sheet
  /** File shown in the Git diff sheet. */
  gitDiffTarget?: { path: string; staged: boolean }
  theme: 'dark' | 'light'
  toolchain?: ToolchainInfo
  recent: RecentProject[]

  project?: ProjectInfo
  selectedPath?: string
  expanded: Record<string, boolean>

  tabs: Tab[]
  activePath?: string
  revealRequest?: { path: string; line: number; column?: number; nonce: number }

  navigator: NavigatorKind
  navigatorVisible: boolean
  inspector: InspectorKind
  inspectorVisible: boolean
  debugAreaVisible: boolean
  minimap: boolean

  scheme?: string
  build: BuildStatus
  console: ConsoleLine[]
  lspDiagnostics: Record<string, LspDiagnostic[]>
  lspState: string
  tests: TestResult[]

  breakpoints: Breakpoint[]
  breakpointsEnabled: boolean
  debug: DebugStatus
  selectedFrameId?: number

  toast?: string

  // Simulator canvas
  canvasVisible: boolean
  previewTree?: PreviewNode
  previewStatus: PreviewStatus
  device: string
  previewScheme: 'light' | 'dark'
  previewTypeSize: string
  previewLandscape: boolean
  previewZoom: number // 0 = fit

  // Remote Mac destination
  destination: RunDestination
  mac: MacStatus
  macConn?: MacConnection
  macPublicKey?: string
  simulators: SimDevice[]
  simUdid?: string
  macRun: MacRunStatus
  macFrame?: string // latest Simulator frame (base64 JPEG)
  macFps: number // frames received in the last second

  // actions
  set: (patch: Partial<State>) => void
  setProject: (p: ProjectInfo | undefined) => void
  openFile: (path: string, line?: number, column?: number) => Promise<void>
  closeTab: (path: string) => void
  updateContent: (path: string, content: string) => void
  saveTab: (path?: string) => Promise<void>
  saveAll: () => Promise<void>
  revertTab: (path: string) => void
  toggleExpanded: (path: string) => void
  appendConsole: (chunk: ConsoleChunk) => void
  clearConsole: () => void
  toggleBreakpoint: (file: string, line: number) => void
  setBreakpointEnabled: (id: string, enabled: boolean) => void
  removeBreakpoint: (id: string) => void
  clearBreakpoints: () => void
  showToast: (msg: string) => void
}

let consoleId = 0
let revealNonce = 0

export const useStore = create<State>((set, get) => ({
  screen: 'welcome',
  sheet: 'none',
  theme: 'dark',
  recent: [],
  expanded: {},
  tabs: [],
  navigator: 'project',
  navigatorVisible: true,
  inspector: 'file',
  inspectorVisible: true,
  debugAreaVisible: true,
  minimap: true,
  build: { phase: 'idle', message: 'Ready', diagnostics: [] },
  console: [],
  lspDiagnostics: {},
  lspState: 'stopped',
  tests: [],
  breakpoints: [],
  breakpointsEnabled: true,
  debug: { state: 'inactive', frames: [] },
  canvasVisible: false,
  previewStatus: { state: 'stopped' },
  device: 'iphone16pro',
  previewScheme: 'light',
  previewTypeSize: 'large',
  previewLandscape: false,
  previewZoom: 0,
  destination: ((): RunDestination => {
    try {
      return localStorage.getItem('tomcode.destination') === 'mac' ? 'mac' : 'pc'
    } catch {
      return 'pc'
    }
  })(),
  mac: { state: 'unconfigured' },
  simulators: [],
  macRun: { state: 'idle', message: '' },
  macFps: 0,

  set: (patch) => set(patch),

  setProject: (p) => {
    const prev = get().project
    const patch: Partial<State> = { project: p }
    if (p && prev?.root !== p.root) {
      // New project: pick a default scheme and expand the root + Sources folder.
      const exe = p.products.find((x) => x.type === 'executable') ?? p.products[0]
      patch.scheme = exe?.name
      // Expand root, top-level folders and their target folders (Sources/Foo, Tests/FooTests), like Xcode.
      const expanded: Record<string, boolean> = { [p.root]: true }
      for (const c of p.tree.children ?? []) {
        if (c.kind !== 'folder') continue
        expanded[c.path] = true
        for (const g of c.children ?? []) if (g.kind === 'folder') expanded[g.path] = true
      }
      patch.expanded = expanded
      patch.screen = 'ide'
      patch.tabs = []
      patch.activePath = undefined
      patch.selectedPath = undefined
      patch.console = []
      patch.tests = []
      patch.lspDiagnostics = {}
      patch.previewTree = undefined
      patch.canvasVisible = !!exe?.isApp
      window.xcode.window.setTitle(`${p.name} — F-Code`)
    } else if (p) {
      // Keep scheme valid when products change.
      const names = p.products.map((x) => x.name)
      if (get().scheme && !names.includes(get().scheme!)) {
        const exe = p.products.find((x) => x.type === 'executable') ?? p.products[0]
        patch.scheme = exe?.name
      }
    }
    set(patch)
  },

  openFile: async (path, line, column) => {
    const { tabs } = get()
    const name = path.split(/[\\/]/).pop() ?? path
    if (!tabs.some((t) => t.path === path)) {
      set({ tabs: [...tabs, { path, name, content: '', saved: '', loading: true }], activePath: path, selectedPath: path })
      try {
        const text = await window.xcode.file.read(path)
        set((s) => ({
          tabs: s.tabs.map((t) => (t.path === path ? { ...t, content: text, saved: text, loading: false } : t))
        }))
        if (path.toLowerCase().endsWith('.swift')) window.xcode.lsp.open(path, text)
      } catch (e) {
        set((s) => ({ tabs: s.tabs.filter((t) => t.path !== path) }))
        get().showToast(`Couldn't open ${name}: ${(e as Error).message}`)
        return
      }
    } else {
      set({ activePath: path, selectedPath: path })
    }
    if (line !== undefined) set({ revealRequest: { path, line, column, nonce: ++revealNonce } })
  },

  closeTab: (path) => {
    const { tabs, activePath } = get()
    const idx = tabs.findIndex((t) => t.path === path)
    if (idx < 0) return
    const next = tabs.filter((t) => t.path !== path)
    let nextActive = activePath
    if (activePath === path) nextActive = next[Math.min(idx, next.length - 1)]?.path
    set({ tabs: next, activePath: nextActive })
    if (path.toLowerCase().endsWith('.swift')) window.xcode.lsp.close(path)
  },

  updateContent: (path, content) => {
    set((s) => ({ tabs: s.tabs.map((t) => (t.path === path ? { ...t, content } : t)) }))
    if (path.toLowerCase().endsWith('.swift')) window.xcode.lsp.change(path, content)
  },

  saveTab: async (path) => {
    const p = path ?? get().activePath
    if (!p) return
    const tab = get().tabs.find((t) => t.path === p)
    if (!tab || tab.content === tab.saved) return
    await window.xcode.file.write(p, tab.content)
    set((s) => ({ tabs: s.tabs.map((t) => (t.path === p ? { ...t, saved: t.content } : t)) }))
    if (p.toLowerCase().endsWith('.swift')) window.xcode.lsp.save(p, tab.content)
  },

  saveAll: async () => {
    for (const t of get().tabs) if (t.content !== t.saved) await get().saveTab(t.path)
  },

  revertTab: (path) => {
    set((s) => ({ tabs: s.tabs.map((t) => (t.path === path ? { ...t, content: t.saved } : t)) }))
  },

  toggleExpanded: (path) => set((s) => ({ expanded: { ...s.expanded, [path]: !s.expanded[path] } })),

  appendConsole: (chunk) =>
    set((s) => {
      const next = [...s.console, { ...chunk, id: consoleId++ }]
      return { console: next.length > 4000 ? next.slice(-3000) : next }
    }),
  clearConsole: () => set({ console: [] }),

  toggleBreakpoint: (file, line) => {
    const { breakpoints } = get()
    const existing = breakpoints.find((b) => b.file === file && b.line === line)
    const next = existing
      ? breakpoints.filter((b) => b !== existing)
      : [...breakpoints, { id: `${file}:${line}:${Date.now()}`, file, line, enabled: true }]
    set({ breakpoints: next })
    void window.xcode.debug.setBreakpoints(effectiveBreakpoints(next, get().breakpointsEnabled))
  },
  setBreakpointEnabled: (id, enabled) => {
    const next = get().breakpoints.map((b) => (b.id === id ? { ...b, enabled } : b))
    set({ breakpoints: next })
    void window.xcode.debug.setBreakpoints(effectiveBreakpoints(next, get().breakpointsEnabled))
  },
  removeBreakpoint: (id) => {
    const next = get().breakpoints.filter((b) => b.id !== id)
    set({ breakpoints: next })
    void window.xcode.debug.setBreakpoints(effectiveBreakpoints(next, get().breakpointsEnabled))
  },
  clearBreakpoints: () => {
    set({ breakpoints: [] })
    void window.xcode.debug.setBreakpoints([])
  },

  showToast: (msg) => {
    set({ toast: msg })
    setTimeout(() => {
      if (get().toast === msg) set({ toast: undefined })
    }, 3200)
  }
}))

export function effectiveBreakpoints(bps: Breakpoint[], globalEnabled: boolean): Breakpoint[] {
  return globalEnabled ? bps : bps.map((b) => ({ ...b, enabled: false }))
}

/** Build diagnostics plus LSP diagnostics merged into Xcode's Issue Navigator shape. */
export function allIssues(state: Pick<State, 'build' | 'lspDiagnostics'>): Diagnostic[] {
  const out: Diagnostic[] = [...state.build.diagnostics]
  const seen = new Set(out.map((d) => `${d.file}:${d.line}:${d.message}`))
  for (const [file, diags] of Object.entries(state.lspDiagnostics)) {
    for (const d of diags) {
      const sev = d.severity === 1 ? 'error' : d.severity === 2 ? 'warning' : 'note'
      const key = `${file}:${d.range.start.line + 1}:${d.message}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ file, line: d.range.start.line + 1, column: d.range.start.character + 1, severity: sev, message: d.message })
    }
  }
  const rank = { error: 0, warning: 1, note: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.file.localeCompare(b.file) || a.line - b.line)
}
