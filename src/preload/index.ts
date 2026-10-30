import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  Breakpoint,
  BuildStatus,
  ConsoleChunk,
  DebugStatus,
  GitCloneProgress,
  GitInfo,
  GitOpResult,
  LspCompletionItem,
  LspDiagnostic,
  LspDocumentSymbol,
  LspHover,
  LspLocation,
  LspPosition,
  MacConnection,
  MacRunStatus,
  MacStatus,
  NewProjectOptions,
  SimDevice,
  ProjectInfo,
  RecentProject,
  Scope,
  TestResult,
  ToolchainInfo,
  Variable
} from '../shared/types'
import type { PreviewEnvironment, PreviewEvent, PreviewNode, PreviewStatus } from '../shared/preview-types'

type Unsub = () => void
function on<T>(channel: string, cb: (payload: T) => void): Unsub {
  const handler = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  platform: process.platform,
  toolchain: {
    detect: (force?: boolean): Promise<ToolchainInfo> => ipcRenderer.invoke(IPC.toolchainDetect, force),
    installCommands: (): Promise<{ title: string; command: string }[]> =>
      ipcRenderer.invoke(IPC.toolchainInstallCommand)
  },
  project: {
    openDialog: (): Promise<string | undefined> => ipcRenderer.invoke(IPC.projectOpenDialog),
    open: (root: string): Promise<string> => ipcRenderer.invoke(IPC.projectOpen, root),
    chooseLocation: (): Promise<string | undefined> => ipcRenderer.invoke(IPC.projectChooseLocation),
    create: (opts: NewProjectOptions): Promise<string> => ipcRenderer.invoke(IPC.projectCreate, opts),
    recent: (): Promise<RecentProject[]> => ipcRenderer.invoke(IPC.projectRecent),
    refresh: (): Promise<void> => ipcRenderer.invoke(IPC.projectRefresh),
    onChanged: (cb: (p: ProjectInfo) => void): Unsub => on(IPC.projectChanged, cb)
  },
  file: {
    read: (path: string): Promise<string> => ipcRenderer.invoke(IPC.fileRead, path),
    write: (path: string, contents: string): Promise<void> => ipcRenderer.invoke(IPC.fileWrite, path, contents),
    create: (path: string, contents = '', isFolder = false): Promise<void> =>
      ipcRenderer.invoke(IPC.fileCreate, path, contents, isFolder),
    delete: (path: string): Promise<boolean> => ipcRenderer.invoke(IPC.fileDelete, path),
    rename: (from: string, to: string): Promise<void> => ipcRenderer.invoke(IPC.fileRename, from, to),
    reveal: (path: string): Promise<void> => ipcRenderer.invoke(IPC.fileRevealInExplorer, path),
    join: (...parts: string[]): Promise<string> => ipcRenderer.invoke('path:join', ...parts)
  },
  build: {
    build: (product?: string): Promise<boolean> => ipcRenderer.invoke(IPC.buildStart, product),
    run: (product: string): Promise<void> => ipcRenderer.invoke(IPC.buildRun, product),
    test: (filter?: string): Promise<void> => ipcRenderer.invoke(IPC.buildTest, filter),
    clean: (): Promise<void> => ipcRenderer.invoke(IPC.buildClean),
    stop: (): Promise<void> => ipcRenderer.invoke(IPC.buildStop),
    sendInput: (text: string): void => ipcRenderer.send(IPC.consoleInput, text),
    onStatus: (cb: (s: BuildStatus) => void): Unsub => on(IPC.buildStatus, cb),
    onConsole: (cb: (c: ConsoleChunk) => void): Unsub => on(IPC.consoleOutput, cb),
    onTests: (cb: (t: TestResult[]) => void): Unsub => on(IPC.testResults, cb)
  },
  lsp: {
    open: (path: string, text: string): void => ipcRenderer.send(IPC.lspOpen, path, text),
    change: (path: string, text: string): void => ipcRenderer.send(IPC.lspChange, path, text),
    save: (path: string, text: string): void => ipcRenderer.send(IPC.lspSave, path, text),
    close: (path: string): void => ipcRenderer.send(IPC.lspClose, path),
    completion: (path: string, pos: LspPosition): Promise<LspCompletionItem[]> =>
      ipcRenderer.invoke(IPC.lspCompletion, path, pos),
    hover: (path: string, pos: LspPosition): Promise<LspHover | null> => ipcRenderer.invoke(IPC.lspHover, path, pos),
    definition: (path: string, pos: LspPosition): Promise<(LspLocation & { path: string })[]> =>
      ipcRenderer.invoke(IPC.lspDefinition, path, pos),
    documentSymbols: (path: string): Promise<LspDocumentSymbol[]> => ipcRenderer.invoke(IPC.lspDocumentSymbols, path),
    onDiagnostics: (cb: (d: { path: string; diagnostics: LspDiagnostic[] }) => void): Unsub =>
      on(IPC.lspDiagnostics, cb),
    onStatus: (cb: (s: { state: string; detail?: string }) => void): Unsub => on(IPC.lspStatus, cb)
  },
  debug: {
    start: (product: string, bps: Breakpoint[]): Promise<boolean> => ipcRenderer.invoke(IPC.debugStart, product, bps),
    stop: (): Promise<void> => ipcRenderer.invoke(IPC.debugStop),
    continue: (): Promise<void> => ipcRenderer.invoke(IPC.debugContinue),
    pause: (): Promise<void> => ipcRenderer.invoke(IPC.debugPause),
    stepOver: (): Promise<void> => ipcRenderer.invoke(IPC.debugStepOver),
    stepIn: (): Promise<void> => ipcRenderer.invoke(IPC.debugStepIn),
    stepOut: (): Promise<void> => ipcRenderer.invoke(IPC.debugStepOut),
    setBreakpoints: (bps: Breakpoint[]): Promise<void> => ipcRenderer.invoke(IPC.debugSetBreakpoints, bps),
    scopes: (frameId: number): Promise<Scope[]> => ipcRenderer.invoke(IPC.debugScopes, frameId),
    variables: (ref: number): Promise<Variable[]> => ipcRenderer.invoke(IPC.debugVariables, ref),
    evaluate: (expr: string, frameId?: number): Promise<string> => ipcRenderer.invoke(IPC.debugEvaluate, expr, frameId),
    onStatus: (cb: (s: DebugStatus) => void): Unsub => on(IPC.debugStatus, cb)
  },
  preview: {
    start: (product: string): Promise<boolean> => ipcRenderer.invoke(IPC.previewStart, product),
    stop: (): Promise<void> => ipcRenderer.invoke(IPC.previewStop),
    sendEvent: (ev: PreviewEvent): void => ipcRenderer.send(IPC.previewEvent, ev),
    sendEnvironment: (env: Partial<PreviewEnvironment>): void => ipcRenderer.send(IPC.previewEnv, env),
    onTree: (cb: (root: PreviewNode) => void): Unsub => on(IPC.previewTree, cb),
    onStatus: (cb: (s: PreviewStatus) => void): Unsub => on(IPC.previewStatus, cb)
  },
  mac: {
    config: (): Promise<{ connection?: MacConnection; simulatorUdid?: string; publicKey: string; status: MacStatus }> =>
      ipcRenderer.invoke(IPC.macConfig),
    configure: (conn: MacConnection | undefined, simulatorUdid?: string): Promise<MacStatus> =>
      ipcRenderer.invoke(IPC.macConfigure, conn, simulatorUdid),
    connect: (): Promise<MacStatus> => ipcRenderer.invoke(IPC.macConnect),
    simulators: (): Promise<SimDevice[]> => ipcRenderer.invoke(IPC.macSimulators),
    run: (product: string, udid: string): Promise<boolean> => ipcRenderer.invoke(IPC.macRun, product, udid),
    build: (product: string, udid: string): Promise<boolean> => ipcRenderer.invoke(IPC.macBuild, product, udid),
    test: (scheme: string, udid: string): Promise<boolean> => ipcRenderer.invoke(IPC.macTest, scheme, udid),
    stop: (): Promise<void> => ipcRenderer.invoke(IPC.macStop),
    setupInput: (udid: string): Promise<boolean> => ipcRenderer.invoke(IPC.macSetupInput, udid),
    trustHost: (): Promise<MacStatus> => ipcRenderer.invoke(IPC.macTrustHost),
    protectKey: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke(IPC.macProtectKey),
    tap: (x: number, y: number): void => ipcRenderer.send(IPC.macTap, x, y),
    swipe: (x1: number, y1: number, x2: number, y2: number, seconds?: number): void => ipcRenderer.send(IPC.macSwipe, x1, y1, x2, y2, seconds),
    text: (text: string): void => ipcRenderer.send(IPC.macText, text),
    key: (name: 'enter' | 'backspace' | 'tab'): void => ipcRenderer.send(IPC.macKey, name),
    button: (name: 'home' | 'volumeup' | 'volumedown'): void => ipcRenderer.send(IPC.macButton, name),
    ui: (what: 'appearance' | 'contentSize', value: string): void => ipcRenderer.send(IPC.macUi, what, value),
    onStatus: (cb: (s: MacStatus) => void): Unsub => on(IPC.macStatus, cb),
    onRunStatus: (cb: (s: MacRunStatus) => void): Unsub => on(IPC.macRunStatus, cb),
    onFrame: (cb: (base64: string) => void): Unsub => on(IPC.macFrame, cb)
  },
  git: {
    info: (): Promise<GitInfo> => ipcRenderer.invoke(IPC.gitInfo),
    init: (): Promise<GitOpResult> => ipcRenderer.invoke(IPC.gitInit),
    diff: (path: string, staged: boolean): Promise<string> => ipcRenderer.invoke(IPC.gitDiff, path, staged),
    stage: (paths: string[]): Promise<GitOpResult> => ipcRenderer.invoke(IPC.gitStage, paths),
    unstage: (paths: string[]): Promise<GitOpResult> => ipcRenderer.invoke(IPC.gitUnstage, paths),
    discard: (paths: string[]): Promise<GitOpResult> => ipcRenderer.invoke(IPC.gitDiscard, paths),
    commit: (message: string): Promise<GitOpResult> => ipcRenderer.invoke(IPC.gitCommit, message),
    fetch: (): Promise<GitOpResult> => ipcRenderer.invoke(IPC.gitFetch),
    pull: (): Promise<GitOpResult> => ipcRenderer.invoke(IPC.gitPull),
    push: (): Promise<GitOpResult> => ipcRenderer.invoke(IPC.gitPush),
    checkout: (branch: string): Promise<GitOpResult> => ipcRenderer.invoke(IPC.gitCheckout, branch),
    createBranch: (branch: string): Promise<GitOpResult> => ipcRenderer.invoke(IPC.gitCreateBranch, branch),
    addRemote: (url: string): Promise<GitOpResult> => ipcRenderer.invoke(IPC.gitAddRemote, url),
    chooseCloneLocation: (): Promise<string | undefined> => ipcRenderer.invoke(IPC.gitChooseCloneLocation),
    clone: (url: string, parentDir: string, folderName: string): Promise<GitOpResult & { path?: string }> =>
      ipcRenderer.invoke(IPC.gitClone, url, parentDir, folderName),
    cancelClone: (): Promise<void> => ipcRenderer.invoke(IPC.gitCloneCancel),
    onCloneProgress: (cb: (p: GitCloneProgress) => void): Unsub => on(IPC.gitCloneProgress, cb)
  },
  menu: {
    onCommand: (cb: (id: string) => void): Unsub => on(IPC.menuCommand, cb)
  },
  window: {
    setTitle: (title: string): void => ipcRenderer.send(IPC.windowSetTitle, title),
    setTheme: (theme: 'dark' | 'light'): void => ipcRenderer.send(IPC.windowSetTheme, theme),
    openExternal: (url: string): void => ipcRenderer.send(IPC.openExternal, url)
  }
}

export type XCodeApi = typeof api
contextBridge.exposeInMainWorld('xcode', api)
