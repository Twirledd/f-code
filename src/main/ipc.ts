import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { watch, FSWatcher } from 'chokidar'
import { basename, dirname, join } from 'path'
import { IPC } from '@shared/ipc-channels'
import type { Breakpoint, LspPosition, NewProjectOptions } from '@shared/types'
import { detectToolchain, installCommands, toolchainEnv } from './toolchain'
import * as project from './project'
import * as settings from './settings'
import { SwiftPM } from './swiftpm'
import { SourceKitLSP } from './lsp'
import { LLDBDebugger } from './debugger'
import { PreviewHost } from './preview'
import { MacBridge } from './remote-mac'
import * as gitSvc from './git'
import { isAppTheme, titleBarOverlay, windowBackground } from './theme'
import type { GitOpResult } from '@shared/types'
import { assertAppearance, assertConnection, assertContentSize, assertProduct, assertUdid } from './validate'
import type { MacConnection } from '@shared/types'
import type { PreviewEnvironment, PreviewEvent } from '@shared/preview-types'

interface Services {
  swiftpm: SwiftPM
  lsp: SourceKitLSP
  debugger: LLDBDebugger
  preview: PreviewHost
  mac: MacBridge
  currentRoot: () => string | undefined
  setRoot: (root: string | undefined) => void
}

let swiftPathChanged: (t: { swiftPath?: string; lspPath?: string; lldbDapPath?: string }) => void = () => {}

export function createServices(): Services {
  let root: string | undefined
  let swiftPath: string | undefined
  let lspPath: string | undefined
  let dapPath: string | undefined
  swiftPathChanged = (t) => {
    swiftPath = t.swiftPath
    lspPath = t.lspPath
    dapPath = t.lldbDapPath
  }
  void detectToolchain().then(swiftPathChanged)
  const swiftpm = new SwiftPM(
    () => swiftPath,
    () => root
  )
  const lsp = new SourceKitLSP(() => lspPath)
  const dbg = new LLDBDebugger(() => dapPath)
  const preview = new PreviewHost()
  const mac = new MacBridge()
  try {
    mac.configure(settings.load().mac)
  } catch (e) {
    // Corrupt or tampered settings must not stop the app from starting; the Mac just stays unconfigured.
    process.stderr.write(`[mac] ignoring invalid saved connection: ${(e as Error).message}\n`)
  }
  return {
    swiftpm,
    lsp,
    debugger: dbg,
    preview,
    mac,
    currentRoot: () => root,
    setRoot: (r) => {
      root = r
    }
  }
}

export function registerIpc(win: () => BrowserWindow | undefined, services: Services): void {
  const send = (channel: string, ...args: unknown[]): void => {
    const w = win()
    if (w && !w.isDestroyed()) w.webContents.send(channel, ...args)
  }

  let watcher: FSWatcher | undefined
  let refreshTimer: NodeJS.Timeout | undefined

  async function pushProject(root: string): Promise<void> {
    const t = await detectToolchain()
    const info = await project.openProject(root, t.swiftPath)
    send(IPC.projectChanged, info)
  }

  async function activateProject(root: string): Promise<void> {
    services.setRoot(root)
    await settings.addRecent(root, basename(root))
    watcher?.close()
    watcher = watch(root, {
      ignored: (p) => /[\\/](\.build|\.git|\.swiftpm|\.index-build)([\\/]|$)/.test(p),
      ignoreInitial: true,
      depth: 12
    })
    watcher.on('all', () => {
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => void pushProject(root), 250)
    })
    await pushProject(root)
    void services.lsp.start(root)
  }

  // ---- toolchain -------------------------------------------------------
  ipcMain.handle(IPC.toolchainDetect, async (_e, force?: boolean) => {
    const t = await detectToolchain(force)
    if (force) {
      void toolchainEnv(true)
      swiftPathChanged(t)
    }
    return t
  })
  ipcMain.handle(IPC.toolchainInstallCommand, () => installCommands())

  // ---- project ---------------------------------------------------------
  ipcMain.handle(IPC.projectOpenDialog, async () => {
    const w = win()
    if (!w) return undefined
    const r = await dialog.showOpenDialog(w, {
      title: 'Open Swift Package',
      properties: ['openDirectory'],
      buttonLabel: 'Open'
    })
    if (r.canceled || !r.filePaths[0]) return undefined
    let path = r.filePaths[0]
    if (basename(path) === 'Package.swift') path = dirname(path)
    await activateProject(path)
    return path
  })
  ipcMain.handle(IPC.projectOpen, async (_e, root: string) => {
    await activateProject(root)
    return root
  })
  ipcMain.handle(IPC.projectChooseLocation, async () => {
    const w = win()
    if (!w) return undefined
    const r = await dialog.showOpenDialog(w, {
      title: 'Choose a location for the new project',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Create'
    })
    return r.canceled ? undefined : r.filePaths[0]
  })
  ipcMain.handle(IPC.projectCreate, async (_e, opts: NewProjectOptions) => {
    const root = await project.createProject(opts)
    await activateProject(root)
    return root
  })
  ipcMain.handle(IPC.projectRecent, () => settings.load().recentProjects)
  ipcMain.handle(IPC.projectRefresh, async () => {
    const root = services.currentRoot()
    if (root) await pushProject(root)
  })

  // ---- files -----------------------------------------------------------
  ipcMain.handle(IPC.fileRead, (_e, path: string) => project.readFile(path))
  ipcMain.handle(IPC.fileWrite, (_e, path: string, contents: string) => project.writeFile(path, contents))
  ipcMain.handle(IPC.fileCreate, async (_e, path: string, contents: string, isFolder?: boolean) => {
    if (isFolder) await project.createFolder(path)
    else await project.createFile(path, contents)
  })
  ipcMain.handle(IPC.fileDelete, async (_e, path: string) => {
    const w = win()
    if (!w) return false
    const r = await dialog.showMessageBox(w, {
      type: 'warning',
      message: `Do you want to move "${basename(path)}" to the Recycle Bin, or only remove the reference to it?`,
      buttons: ['Move to Recycle Bin', 'Cancel'],
      defaultId: 0,
      cancelId: 1
    })
    if (r.response !== 0) return false
    await shell.trashItem(path)
    return true
  })
  ipcMain.handle(IPC.fileRename, (_e, from: string, to: string) => project.renamePath(from, to))
  ipcMain.handle(IPC.fileRevealInExplorer, (_e, path: string) => shell.showItemInFolder(path))

  // ---- build / run / test ---------------------------------------------
  services.swiftpm.on('status', (s) => send(IPC.buildStatus, s))
  services.swiftpm.on('console', (c) => send(IPC.consoleOutput, c))
  services.swiftpm.on('tests', (t) => send(IPC.testResults, t))

  ipcMain.handle(IPC.buildStart, (_e, product?: string) => services.swiftpm.build(product))
  ipcMain.handle(IPC.buildRun, (_e, product: string) => services.swiftpm.buildAndRun(product))
  ipcMain.handle(IPC.buildTest, (_e, filter?: string) => services.swiftpm.test(filter))
  ipcMain.handle(IPC.buildClean, () => services.swiftpm.clean())
  ipcMain.handle(IPC.buildStop, async () => {
    services.swiftpm.stop()
    await services.debugger.stop()
    await services.preview.stop()
    await services.mac.stop()
  })

  // ---- Remote Mac --------------------------------------------------------
  services.mac.on('status', (s) => send(IPC.macStatus, s))
  services.mac.on('run', (s) => send(IPC.macRunStatus, s))
  services.mac.on('build', (s) => send(IPC.buildStatus, s))
  services.mac.on('console', (c) => send(IPC.consoleOutput, c))
  services.mac.on('frame', (f) => send(IPC.macFrame, f))
  services.mac.on('resolved', (ip: string) => {
    const saved = settings.load().mac
    if (saved) void settings.save({ mac: { ...saved, lastIp: ip } })
  })

  ipcMain.handle(IPC.macConfig, async () => ({
    connection: settings.load().mac,
    simulatorUdid: settings.load().simulatorUdid,
    publicKey: await MacBridge.ensureKey().catch((e: Error) => `(could not create key: ${e.message})`),
    status: services.mac.current
  }))
  ipcMain.handle(IPC.macConfigure, async (_e, conn: MacConnection | undefined, simulatorUdid?: string) => {
    // Validate everything that came from the renderer before it is stored or reaches ssh.
    if (conn) assertConnection(conn)
    if (simulatorUdid !== undefined) assertUdid(simulatorUdid)
    await settings.save({ mac: conn, simulatorUdid })
    services.mac.configure(conn)
    return conn ? services.mac.connect() : services.mac.current
  })
  ipcMain.handle(IPC.macConnect, () => services.mac.connect())
  ipcMain.handle(IPC.macSimulators, () => services.mac.listSimulators())
  ipcMain.handle(IPC.macRun, async (_e, product: string, udid: string) => {
    assertProduct(product)
    assertUdid(udid)
    const root = services.currentRoot()
    if (!root) throw new Error('No project open')
    await settings.save({ simulatorUdid: udid })
    return services.mac.run(root, product, udid)
  })
  ipcMain.handle(IPC.macBuild, async (_e, product: string, udid: string) => {
    assertProduct(product)
    assertUdid(udid)
    const root = services.currentRoot()
    if (!root) throw new Error('No project open')
    return services.mac.buildOnly(root, product, udid)
  })
  ipcMain.handle(IPC.macTest, async (_e, scheme: string, udid: string) => {
    assertProduct(scheme)
    assertUdid(udid)
    const root = services.currentRoot()
    if (!root) throw new Error('No project open')
    return services.mac.testOnly(root, scheme, udid)
  })
  ipcMain.handle(IPC.macStop, () => services.mac.stop())
  ipcMain.handle(IPC.macSetupInput, (_e, udid: string) => services.mac.setupInput(assertUdid(udid)))
  ipcMain.handle(IPC.macTrustHost, () => services.mac.trustHostKey())
  ipcMain.handle(IPC.macProtectKey, () => MacBridge.protectKey())
  const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 100000
  ipcMain.on(IPC.macTap, (_e, x: number, y: number) => {
    if (num(x) && num(y)) void services.mac.tap(x, y)
  })
  ipcMain.on(IPC.macSwipe, (_e, x1: number, y1: number, x2: number, y2: number, seconds?: number) => {
    if (num(x1) && num(y1) && num(x2) && num(y2) && (seconds === undefined || (num(seconds) && seconds >= 0 && seconds <= 10))) void services.mac.swipe(x1, y1, x2, y2, seconds)
  })
  ipcMain.on(IPC.macText, (_e, text: string) => {
    if (typeof text === 'string' && text.length <= 10000) void services.mac.text(text)
  })
  ipcMain.on(IPC.macKey, (_e, name: string) => void services.mac.key(String(name)))
  ipcMain.on(IPC.macButton, (_e, name: string) => {
    if (name === 'home' || name === 'volumeup' || name === 'volumedown') void services.mac.button(name)
  })
  ipcMain.on(IPC.macUi, (_e, what: 'appearance' | 'contentSize', value: string) => {
    try {
      if (what === 'appearance') void services.mac.setAppearance(assertAppearance(value))
      else if (what === 'contentSize') void services.mac.setContentSize(assertContentSize(value))
    } catch (e) {
      process.stderr.write(`[mac] rejected ${String(what)}: ${(e as Error).message}\n`)
    }
  })

  // ---- SwiftUI preview ---------------------------------------------------
  services.preview.on('tree', (t) => send(IPC.previewTree, t))
  services.preview.on('status', (s) => send(IPC.previewStatus, s))
  services.preview.on('console', (c) => send(IPC.consoleOutput, c))

  ipcMain.handle(IPC.previewStart, async (_e, product: string) => {
    const root = services.currentRoot()
    if (!root) throw new Error('No project open')
    send(IPC.previewStatus, { state: 'building', message: `Building ${product}…` })
    const exe = await services.swiftpm.buildForDebug(product)
    if (!exe) {
      send(IPC.previewStatus, { state: 'stopped', message: 'Build failed' })
      return false
    }
    await services.preview.launch(exe, root)
    return true
  })
  ipcMain.handle(IPC.previewStop, () => services.preview.stop())
  ipcMain.on(IPC.previewEvent, (_e, ev: PreviewEvent) => services.preview.sendEvent(ev))
  ipcMain.on(IPC.previewEnv, (_e, env: Partial<PreviewEnvironment>) => services.preview.sendEnvironment(env))
  ipcMain.on(IPC.consoleInput, (_e, text: string) => services.swiftpm.writeInput(text))

  // ---- LSP -------------------------------------------------------------
  services.lsp.on('diagnostics', (d) => send(IPC.lspDiagnostics, d))
  services.lsp.on('status', (s) => send(IPC.lspStatus, s))
  services.lsp.on('log', (text: string) => {
    if (process.env.XCODE_LSP_LOG) process.stderr.write(`[lsp] ${text}`)
  })

  ipcMain.on(IPC.lspOpen, (_e, path: string, text: string) => services.lsp.didOpen(path, text))
  ipcMain.on(IPC.lspChange, (_e, path: string, text: string) => services.lsp.didChange(path, text))
  ipcMain.on(IPC.lspSave, (_e, path: string, text: string) => services.lsp.didSave(path, text))
  ipcMain.on(IPC.lspClose, (_e, path: string) => services.lsp.didClose(path))
  ipcMain.handle(IPC.lspCompletion, (_e, path: string, pos: LspPosition) => services.lsp.completion(path, pos))
  ipcMain.handle(IPC.lspHover, (_e, path: string, pos: LspPosition) => services.lsp.hover(path, pos))
  ipcMain.handle(IPC.lspDefinition, async (_e, path: string, pos: LspPosition) => {
    const locs = await services.lsp.definition(path, pos)
    return locs.map((l) => ({ ...l, path: SourceKitLSP.path(l.uri) }))
  })
  ipcMain.handle(IPC.lspDocumentSymbols, (_e, path: string) => services.lsp.documentSymbols(path))

  // ---- Debug -----------------------------------------------------------
  services.debugger.on('status', (s) => send(IPC.debugStatus, s))
  services.debugger.on('console', (c) => send(IPC.consoleOutput, c))

  ipcMain.handle(IPC.debugStart, async (_e, product: string, breakpoints: Breakpoint[]) => {
    const root = services.currentRoot()
    if (!root) throw new Error('No project open')
    const exe = await services.swiftpm.buildForDebug(product)
    if (!exe) return false
    send(IPC.consoleOutput, { stream: 'system', text: `\nLaunching ${basename(exe)} under lldb…\n\n` })
    await services.debugger.launch(exe, root, breakpoints)
    return true
  })
  ipcMain.handle(IPC.debugStop, () => services.debugger.stop())
  ipcMain.handle(IPC.debugContinue, () => services.debugger.continue())
  ipcMain.handle(IPC.debugPause, () => services.debugger.pause())
  ipcMain.handle(IPC.debugStepOver, () => services.debugger.stepOver())
  ipcMain.handle(IPC.debugStepIn, () => services.debugger.stepIn())
  ipcMain.handle(IPC.debugStepOut, () => services.debugger.stepOut())
  ipcMain.handle(IPC.debugSetBreakpoints, (_e, bps: Breakpoint[]) => services.debugger.setBreakpoints(bps))
  ipcMain.handle(IPC.debugScopes, (_e, frameId: number) => services.debugger.scopes(frameId))
  ipcMain.handle(IPC.debugVariables, (_e, ref: number) => services.debugger.variables(ref))
  ipcMain.handle(IPC.debugEvaluate, (_e, expr: string, frameId?: number) => services.debugger.evaluate(expr, frameId))

  // ---- Source control (git) ----------------------------------------------
  // The repository is always the open project's; the renderer never names a repository path. Everything the
  // renderer does send (URL, folder name, branch, file list, message) is re-validated inside git.ts.
  const gitFail = (e: unknown): GitOpResult => ({ ok: false, message: (e as Error).message })
  ipcMain.handle(IPC.gitInfo, () => gitSvc.getInfo(services.currentRoot()))
  ipcMain.handle(IPC.gitInit, () => gitSvc.init(services.currentRoot()).catch(gitFail))
  ipcMain.handle(IPC.gitDiff, (_e, path: string, staged: boolean) =>
    gitSvc.diff(services.currentRoot(), path, staged === true).catch((e: Error) => `Could not show the changes: ${e.message}`)
  )
  ipcMain.handle(IPC.gitStage, (_e, paths: string[]) => gitSvc.stage(services.currentRoot(), paths).catch(gitFail))
  ipcMain.handle(IPC.gitUnstage, (_e, paths: string[]) => gitSvc.unstage(services.currentRoot(), paths).catch(gitFail))
  ipcMain.handle(IPC.gitDiscard, async (_e, paths: string[]) => {
    const w = win()
    if (!w || !Array.isArray(paths) || paths.length === 0) return { ok: false, message: 'Nothing to discard' }
    const r = await dialog.showMessageBox(w, {
      type: 'warning',
      message: `Discard changes to ${paths.length === 1 ? `"${basename(String(paths[0]))}"` : `${paths.length} files`}?`,
      detail: 'Your edits to these files will be lost. This cannot be undone.',
      buttons: ['Discard Changes', 'Cancel'],
      defaultId: 1,
      cancelId: 1
    })
    if (r.response !== 0) return { ok: false, message: 'Cancelled' }
    return gitSvc.discard(services.currentRoot(), paths).catch(gitFail)
  })
  ipcMain.handle(IPC.gitCommit, (_e, message: string) => gitSvc.commit(services.currentRoot(), message).catch(gitFail))
  ipcMain.handle(IPC.gitFetch, () => gitSvc.fetchRemote(services.currentRoot()).catch(gitFail))
  ipcMain.handle(IPC.gitPull, () => gitSvc.pull(services.currentRoot()).catch(gitFail))
  ipcMain.handle(IPC.gitPush, () => gitSvc.push(services.currentRoot()).catch(gitFail))
  ipcMain.handle(IPC.gitCheckout, (_e, branch: string) => gitSvc.checkout(services.currentRoot(), branch).catch(gitFail))
  ipcMain.handle(IPC.gitCreateBranch, (_e, branch: string) => gitSvc.createBranch(services.currentRoot(), branch).catch(gitFail))
  ipcMain.handle(IPC.gitAddRemote, (_e, url: string) => gitSvc.addRemote(services.currentRoot(), url).catch(gitFail))
  ipcMain.handle(IPC.gitChooseCloneLocation, async () => {
    const w = win()
    if (!w) return undefined
    const r = await dialog.showOpenDialog(w, {
      title: 'Choose where to clone the repository',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Choose'
    })
    return r.canceled ? undefined : r.filePaths[0]
  })
  let cloning: gitSvc.CloneHandle | undefined
  ipcMain.handle(IPC.gitClone, async (_e, url: string, parentDir: string, folderName: string): Promise<GitOpResult & { path?: string }> => {
    if (cloning) return { ok: false, message: 'A clone is already running' }
    cloning = gitSvc.cloneRepository(url, parentDir, folderName, (p) => send(IPC.gitCloneProgress, p))
    try {
      const path = await cloning.promise
      cloning = undefined
      await activateProject(path)
      return { ok: true, message: 'Cloned', path }
    } catch (e) {
      cloning = undefined
      return gitFail(e)
    }
  })
  ipcMain.handle(IPC.gitCloneCancel, () => cloning?.cancel())

  // ---- misc ------------------------------------------------------------
  ipcMain.on(IPC.windowSetTitle, (_e, title: string) => win()?.setTitle(title))
  ipcMain.on(IPC.windowSetTheme, (_e, theme: unknown) => {
    const w = win()
    if (!w || w.isDestroyed() || !isAppTheme(theme)) return
    w.setBackgroundColor(windowBackground(theme))
    // Windows draws the minimise / maximise / close buttons itself; give them the app's colours.
    if (process.platform === 'win32') w.setTitleBarOverlay(titleBarOverlay(theme))
  })
  ipcMain.on(IPC.openExternal, (_e, url: string) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })

  // Convenience for the renderer: path join without exposing `path`.
  ipcMain.handle('path:join', (_e, ...parts: string[]) => join(...parts))
}
