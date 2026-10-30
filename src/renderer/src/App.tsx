import React, { useEffect } from 'react'
import { useStore } from '@/state/store'
import { Toolbar } from './components/Toolbar'
import { Navigator } from './components/Navigator'
import { EditorArea } from './components/EditorArea'
import { Inspector } from './components/Inspector'
import { DebugArea } from './components/DebugArea'
import { Welcome } from './components/Welcome'
import { Sheets } from './components/Sheets'
import { applyDiagnostics } from '@/lib/monaco'
import { actions } from '@/lib/actions'

export default function App(): JSX.Element {
  const screen = useStore((s) => s.screen)
  const theme = useStore((s) => s.theme)
  const toast = useStore((s) => s.toast)
  const project = useStore((s) => s.project)
  const tabs = useStore((s) => s.tabs)
  const activePath = useStore((s) => s.activePath)
  const navigatorVisible = useStore((s) => s.navigatorVisible)
  const inspectorVisible = useStore((s) => s.inspectorVisible)
  const debugAreaVisible = useStore((s) => s.debugAreaVisible)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.xcode.window.setTheme(theme) // colours the Windows minimise / maximise / close buttons
  }, [theme])

  // Wire main-process events into the store once.
  useEffect(() => {
    const st = useStore.getState()
    void window.xcode.toolchain.detect().then((t) => st.set({ toolchain: t }))
    void window.xcode.project.recent().then((r) => st.set({ recent: r }))
    void actions.refreshMac()

    // Frames per second actually received from the Mac, shown in the canvas toolbar.
    let frameCount = 0
    const fpsTimer = setInterval(() => {
      const n = frameCount
      frameCount = 0
      if (useStore.getState().macFps !== n) useStore.getState().set({ macFps: n })
    }, 1000)

    const subs = [
      window.xcode.mac.onStatus((m) => useStore.getState().set({ mac: m })),
      window.xcode.mac.onRunStatus((r) => useStore.getState().set({ macRun: r })),
      window.xcode.mac.onFrame((f) => {
        frameCount++
        useStore.getState().set({ macFrame: f })
      }),
      window.xcode.project.onChanged((p) => {
        useStore.getState().setProject(p)
        void window.xcode.project.recent().then((r) => useStore.getState().set({ recent: r }))
      }),
      window.xcode.build.onStatus((b) => useStore.getState().set({ build: b })),
      window.xcode.build.onConsole((c) => useStore.getState().appendConsole(c)),
      window.xcode.build.onTests((t) => useStore.getState().set({ tests: t })),
      window.xcode.lsp.onDiagnostics(({ path, diagnostics }) => {
        useStore.getState().set({ lspDiagnostics: { ...useStore.getState().lspDiagnostics, [path]: diagnostics } })
        applyDiagnostics(path, diagnostics)
      }),
      window.xcode.lsp.onStatus((s) => {
        useStore.getState().set({ lspState: s.state })
        document.body.dataset.lsp = s.state
      }),
      window.xcode.debug.onStatus((d) => {
        const prev = useStore.getState().debug
        useStore.getState().set({ debug: d, selectedFrameId: d.state === 'paused' ? d.frames[0]?.id : undefined })
        if (d.state === 'paused' && d.frames[0]?.file && d.frames[0].line && (prev.state !== 'paused' || prev.frames[0]?.id !== d.frames[0].id)) {
          void useStore.getState().openFile(d.frames[0].file, d.frames[0].line, d.frames[0].column)
        }
      }),
      window.xcode.preview.onTree((root) => useStore.getState().set({ previewTree: root })),
      window.xcode.preview.onStatus((status) => {
        const prev = useStore.getState().previewStatus
        useStore.getState().set({ previewStatus: status, previewTree: status.state === 'running' || status.state === 'crashed' ? useStore.getState().previewTree : prev.state === 'running' && status.state === 'stopped' ? useStore.getState().previewTree : undefined })
      }),
      window.xcode.menu.onCommand((id) => runCommand(id))
    ]
    // Test hooks: drive menu commands and inject preview trees (native accelerators don't fire under automation).
    const w = window as unknown as { __runCommand?: (id: string) => void; __previewTree?: (t: unknown) => void; __store?: typeof useStore }
    w.__runCommand = runCommand
    w.__store = useStore
    w.__previewTree = (t) => useStore.getState().set({ previewTree: t as never, canvasVisible: true, previewStatus: { state: 'running' } })
    return () => {
      clearInterval(fpsTimer)
      subs.forEach((u) => u())
    }
  }, [])

  // Window title with dirty indicator.
  useEffect(() => {
    const active = tabs.find((t) => t.path === activePath)
    const dirty = active && active.content !== active.saved
    const title = project ? `${active ? `${active.name}${dirty ? ' — Edited' : ''} — ` : ''}${project.name}` : 'F-Code'
    window.xcode.window.setTitle(title)
  }, [project, tabs, activePath])

  // Warn before closing with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent): void => {
      if (useStore.getState().tabs.some((t) => t.content !== t.saved)) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const active = tabs.find((t) => t.path === activePath)
  const dirty = active && active.content !== active.saved

  return (
    <>
      {screen === 'welcome' ? (
        <div className="window" style={{ gridTemplateRows: 'var(--titlebar-height) 1fr' }}>
          <div className="titlebar">
            <span className="title">
              <b>F-Code</b>
            </span>
          </div>
          <Welcome />
        </div>
      ) : (
        <div className="window">
          <div className="titlebar">
            <span className="title">
              <b>{project?.name}</b>
              {active && (
                <>
                  <span>—</span>
                  <span>{active.name}</span>
                  {dirty && <span className="dirty-dot" title="Edited" />}
                </>
              )}
            </span>
          </div>
          <Toolbar />
          <div className={`main ${navigatorVisible ? '' : 'no-nav'} ${inspectorVisible ? '' : 'no-inspector'}`}>
            {navigatorVisible ? <Navigator /> : <div className="hidden-col" />}
            <div className={`editor-area ${debugAreaVisible ? 'with-debug' : ''}`}>
              <EditorArea />
              {debugAreaVisible && <DebugArea />}
            </div>
            {inspectorVisible ? <Inspector /> : <div className="hidden-col" />}
          </div>
        </div>
      )}
      <Sheets />
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}

/** Dispatch a menu command id (see main/menu.ts) against the store and services. */
function runCommand(id: string): void {
  const st = useStore.getState()
  const editor = (window as unknown as { __editor?: import('monaco-editor').editor.IStandaloneCodeEditor }).__editor
  const nav = (n: typeof st.navigator): void => st.set({ navigator: n, navigatorVisible: true })
  switch (id) {
    case 'app.about':
      return st.set({ sheet: 'about' })
    case 'app.settings':
      return st.set({ sheet: 'settings' })
    case 'project.new':
      return st.set({ sheet: 'newProject' })
    case 'project.open':
      return void window.xcode.project.openDialog()
    case 'project.clone':
      return st.set({ sheet: 'clone' })
    case 'project.close':
      void window.xcode.build.stop()
      return st.set({ screen: 'welcome', project: undefined, tabs: [], activePath: undefined, selectedPath: undefined })
    case 'file.new':
      return st.project ? st.set({ sheet: 'newFile' }) : st.showToast('Open a project first')
    case 'file.newFolder':
      return st.showToast('Right-click a folder in the Project navigator ▸ New Folder')
    case 'file.save':
      return void st.saveTab()
    case 'file.saveAll':
      return void st.saveAll()
    case 'file.revert':
      return st.activePath ? st.revertTab(st.activePath) : undefined
    case 'file.reveal':
      return st.activePath ? void window.xcode.file.reveal(st.activePath) : undefined
    case 'editor.closeTab':
      return st.activePath ? st.closeTab(st.activePath) : undefined
    case 'editor.find':
      return void editor?.getAction('actions.find')?.run()
    case 'editor.replace':
      return void editor?.getAction('editor.action.startFindReplaceAction')?.run()
    case 'editor.gotoDefinition':
      return void editor?.getAction('editor.action.revealDefinition')?.run()
    case 'editor.gotoLine':
      return st.set({ sheet: 'gotoLine' })
    case 'editor.reindent':
      return void editor?.getAction('editor.action.reindentlines')?.run()
    case 'editor.toggleComment':
      return void editor?.getAction('editor.action.commentLine')?.run()
    case 'editor.toggleMinimap':
      return st.set({ minimap: !st.minimap })
    case 'nav.project':
      return nav('project')
    case 'nav.scm':
      return nav('scm')
    case 'nav.symbols':
      return nav('symbols')
    case 'nav.find':
      return nav('find')
    case 'nav.issues':
      return nav('issues')
    case 'nav.tests':
      return nav('tests')
    case 'nav.debug':
      return nav('debug')
    case 'nav.breakpoints':
      return nav('breakpoints')
    case 'nav.reports':
      return nav('reports')
    case 'nav.openQuickly':
      return st.project ? st.set({ sheet: 'openQuickly' }) : undefined
    case 'nav.revealCurrent':
      if (!st.activePath || !st.project) return
      {
        const parts = st.activePath.slice(st.project.root.length).split(/[\\/]/).filter(Boolean)
        const expanded = { ...st.expanded, [st.project.root]: true }
        let cur = st.project.root
        for (const p of parts.slice(0, -1)) {
          cur = `${cur}\\${p}`
          expanded[cur] = true
        }
        st.set({ expanded, selectedPath: st.activePath, navigator: 'project', navigatorVisible: true })
      }
      return
    case 'view.toggleNavigator':
      return st.set({ navigatorVisible: !st.navigatorVisible })
    case 'view.toggleInspector':
      return st.set({ inspectorVisible: !st.inspectorVisible })
    case 'view.toggleDebugArea':
      return st.set({ debugAreaVisible: !st.debugAreaVisible })
    case 'view.console':
      return st.set({ debugAreaVisible: true })
    case 'view.toggleCanvas':
      return st.set({ canvasVisible: !st.canvasVisible })
    case 'preview.resume':
      return void actions.resumePreview()
    case 'inspector.file':
      return st.set({ inspector: 'file', inspectorVisible: true })
    case 'inspector.help':
      return st.set({ inspector: 'help', inspectorVisible: true })
    case 'product.run':
      return void actions.run()
    case 'product.runOnly':
      return void actions.run()
    case 'product.debug':
      return void actions.debug()
    case 'product.build':
      return void actions.build()
    case 'product.test':
      return void actions.test()
    case 'product.clean':
      return void actions.clean()
    case 'product.stop':
      return void actions.stop()
    case 'debug.continue':
      return void window.xcode.debug.continue()
    case 'debug.pause':
      return void window.xcode.debug.pause()
    case 'debug.stepOver':
      return void window.xcode.debug.stepOver()
    case 'debug.stepIn':
      return void window.xcode.debug.stepIn()
    case 'debug.stepOut':
      return void window.xcode.debug.stepOut()
    case 'debug.toggleBreakpoint': {
      const pos = editor?.getPosition()
      if (pos && st.activePath) st.toggleBreakpoint(st.activePath, pos.lineNumber)
      return
    }
    case 'debug.toggleAllBreakpoints': {
      const next = !st.breakpointsEnabled
      st.set({ breakpointsEnabled: next })
      void window.xcode.debug.setBreakpoints(next ? st.breakpoints : st.breakpoints.map((b) => ({ ...b, enabled: false })))
      return
    }
    case 'debug.deleteAllBreakpoints':
      return st.clearBreakpoints()
    case 'help.main':
      return window.xcode.window.openExternal('https://www.swift.org/documentation/')
  }
}
