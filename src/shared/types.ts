// Types shared between the main process, preload bridge and renderer.

export interface ToolchainInfo {
  found: boolean
  swiftPath?: string
  swiftVersion?: string
  lspPath?: string
  lldbDapPath?: string
  toolchainRoot?: string
  problems: string[]
}

export type FileKind = 'swift' | 'package' | 'json' | 'markdown' | 'text' | 'folder' | 'resource'

export interface FileNode {
  name: string
  path: string
  kind: FileKind
  children?: FileNode[]
}

export interface ProjectInfo {
  root: string
  name: string
  packageManifest?: string
  products: ProductInfo[]
  tree: FileNode
}

export interface ProductInfo {
  name: string
  type: 'executable' | 'library' | 'test'
  /** True when the target's sources contain a SwiftUI `App` — Run opens the Simulator canvas. */
  isApp?: boolean
}

export type Severity = 'error' | 'warning' | 'note'

export interface Diagnostic {
  file: string
  line: number
  column: number
  severity: Severity
  message: string
}

export type BuildPhase = 'idle' | 'building' | 'running' | 'testing' | 'succeeded' | 'failed' | 'stopped'

export interface BuildStatus {
  phase: BuildPhase
  message: string
  diagnostics: Diagnostic[]
  startedAt?: number
  finishedAt?: number
}

export interface ConsoleChunk {
  stream: 'stdout' | 'stderr' | 'system'
  text: string
}

export interface TestResult {
  suite: string
  name: string
  status: 'passed' | 'failed' | 'skipped'
  duration?: number
  message?: string
}

// ---- LSP (subset surfaced to the renderer) ----

export interface LspPosition {
  line: number
  character: number
}
export interface LspRange {
  start: LspPosition
  end: LspPosition
}
export interface LspLocation {
  uri: string
  range: LspRange
}
export interface LspDiagnostic {
  range: LspRange
  severity?: number
  message: string
  source?: string
}
export interface LspCompletionItem {
  label: string
  kind?: number
  detail?: string
  documentation?: string | { value: string }
  insertText?: string
  filterText?: string
  sortText?: string
  textEdit?: { range: LspRange; newText: string }
}
export interface LspHover {
  contents: string | { value: string } | Array<string | { value: string }>
  range?: LspRange
}
export interface LspDocumentSymbol {
  name: string
  kind: number
  range: LspRange
  selectionRange: LspRange
  children?: LspDocumentSymbol[]
}

// ---- Debugger ----

export interface Breakpoint {
  id: string
  file: string
  line: number
  enabled: boolean
  verified?: boolean
}

export interface StackFrame {
  id: number
  name: string
  file?: string
  line?: number
  column?: number
}

export interface Variable {
  name: string
  value: string
  type?: string
  variablesReference: number
}

export interface Scope {
  name: string
  variablesReference: number
}

export type DebugState = 'inactive' | 'launching' | 'running' | 'paused' | 'terminated'

export interface DebugStatus {
  state: DebugState
  threadId?: number
  frames: StackFrame[]
  reason?: string
}

export interface NewProjectOptions {
  name: string
  location: string
  template: 'app' | 'executable' | 'library' | 'tool'
  createGit: boolean
}

// ---- Remote Mac (build with Xcode, run in the iOS Simulator over SSH) ----

export type RunDestination = 'pc' | 'mac'

export interface MacConnection {
  host: string
  user: string
  port?: number
  /** Folder on the Mac that projects are synced into (default ~/TomCodeProjects). */
  remoteRoot?: string
  /** Last IPv4 the host name resolved to; used when Windows can't resolve a `.local` name (flaky mDNS). */
  lastIp?: string
}

export type MacState = 'unconfigured' | 'connecting' | 'ready' | 'error'

export interface MacStatus {
  state: MacState
  hostname?: string
  macOS?: string
  xcode?: string
  /** facebook/idb is installed on the Mac (not installable on Intel macOS 13; kept for newer Macs). */
  idb?: boolean
  /**
   * WebDriverAgent — touch, swipe, typing and a faster video stream inside the Simulator.
   * missing = not built on the Mac yet, building = one-time setup running, ready = built.
   */
  input?: 'missing' | 'building' | 'ready'
  /**
   * The Mac keeps its own always-on simulator + WebDriverAgent (LaunchAgent dev.tomcode.simhost). When `running`,
   * F-Code attaches to it and never boots the simulator or starts/stops the agent itself.
   */
  persistent?: { udid: string; running: boolean }
  /** The Mac's host key is not pinned yet: these are its fingerprints, to compare with the Mac before trusting. */
  hostKey?: { host: string; fingerprints: string[] }
  detail?: string
}

export interface SimDevice {
  udid: string
  name: string
  runtime: string // e.g. "iOS 18.1"
  state: string // Booted | Shutdown
}

export type MacRunState = 'idle' | 'syncing' | 'building' | 'installing' | 'running' | 'failed' | 'stopped'

export interface MacRunStatus {
  state: MacRunState
  message: string
  udid?: string
  /** A WebDriverAgent session is live: clicks, drags and typing reach the Simulator. */
  input?: boolean
  /** Screen size in points, reported by the Simulator once input is live. */
  points?: { width: number; height: number }
}

// ---- Source control (git) ----

export type GitChangeKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'typechange' | 'untracked' | 'conflicted'

export interface GitChange {
  /** Repo-relative path with forward slashes. */
  path: string
  /** Previous path for a rename or copy. */
  origPath?: string
  /** State in the index (what the next commit will contain), if it differs from HEAD. */
  staged?: GitChangeKind
  /** State in the working tree, if it differs from the index. */
  unstaged?: GitChangeKind
}

export interface GitCommit {
  hash: string
  short: string
  author: string
  /** Unix seconds. */
  date: number
  subject: string
}

export interface GitInfo {
  /** The git executable was found. */
  available: boolean
  isRepo: boolean
  root?: string
  /** Current branch, or undefined when HEAD is detached. */
  branch?: string
  /** Short hash of HEAD when it is detached. */
  detached?: string
  upstream?: string
  ahead: number
  behind: number
  /** First remote (origin when present), with any credentials removed from the URL. */
  remote?: { name: string; url: string }
  changes: GitChange[]
  log: GitCommit[]
  branches: string[]
  /** Remote-tracking branches that have no local branch yet, as `origin/name`. */
  remoteBranches: string[]
  error?: string
}

export interface GitCloneProgress {
  phase: string
  percent?: number
}

export interface GitOpResult {
  ok: boolean
  message: string
}

export interface RecentProject {
  path: string
  name: string
  openedAt: number
}
