import React, { useEffect, useMemo, useRef, useState } from 'react'
import { monaco, languageForPath, modelPath } from '@/lib/monaco'
import { allIssues, useStore } from '@/state/store'
import { FileIcon } from './FileTree'
import { ArrowLeft, ArrowRight, Chevron, Close, FileSwift } from './Icons'
import type { LspDocumentSymbol } from '@shared/types'
import { SimulatorPane } from '@/simulator/SimulatorPane'

/** One Monaco instance; models are swapped as tabs change (like Xcode's single source editor). */
export function EditorArea(): JSX.Element {
  const tabs = useStore((s) => s.tabs)
  const activePath = useStore((s) => s.activePath)
  const set = useStore((s) => s.set)
  const closeTab = useStore((s) => s.closeTab)
  const active = tabs.find((t) => t.path === activePath)
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)

  // Jump history for the back/forward arrows in the jump bar.
  useEffect(() => {
    if (!activePath) return
    setHistory((h) => {
      if (h[histIdx] === activePath) return h
      const next = [...h.slice(0, histIdx + 1), activePath].slice(-50)
      setHistIdx(next.length - 1)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath])

  const go = (dir: -1 | 1): void => {
    const idx = histIdx + dir
    if (idx < 0 || idx >= history.length) return
    setHistIdx(idx)
    set({ activePath: history[idx], selectedPath: history[idx] })
  }

  const canvasVisible = useStore((s) => s.canvasVisible)
  return (
    <div className={`editor-split ${canvasVisible ? 'with-canvas' : ''}`}>
    <div className="editor-stack">
      <div className="tabbar">
        {tabs.map((t) => {
          const dirty = t.content !== t.saved
          return (
            <div
              key={t.path}
              className={`tab ${t.path === activePath ? 'active' : ''} ${dirty ? 'dirty' : ''}`}
              onClick={() => set({ activePath: t.path, selectedPath: t.path })}
              onMouseDown={(e) => e.button === 1 && closeTab(t.path)}
              title={t.path}
            >
              <span className="row-icon">
                <FileIcon kind={t.path.endsWith('.swift') ? 'swift' : t.name === 'Package.swift' ? 'package' : 'text'} />
              </span>
              <span className="name">{t.name}</span>
              <button
                className="close"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(t.path)
                }}
                title="Close"
              >
                <Close className="x" />
                {dirty && <span className="dot" style={{ width: 7, height: 7, borderRadius: 4, background: 'currentColor' }} />}
              </button>
            </div>
          )
        })}
      </div>
      <JumpBar path={active?.path} onBack={() => go(-1)} onForward={() => go(1)} canBack={histIdx > 0} canForward={histIdx < history.length - 1} />
      <div className="editor-host">{active ? <MonacoHost key="editor" /> : <Placeholder />}</div>
    </div>
    {canvasVisible && <SimulatorPane />}
    </div>
  )
}

function Placeholder(): JSX.Element {
  return (
    <div className="editor-placeholder">
      <div className="big">
        <FileSwift />
        <div>No Editor</div>
        <div className="muted" style={{ fontSize: 12 }}>
          Select a file in the Project navigator, or press Ctrl+Shift+O to Open Quickly.
        </div>
      </div>
    </div>
  )
}

function JumpBar({
  path,
  onBack,
  onForward,
  canBack,
  canForward
}: {
  path?: string
  onBack: () => void
  onForward: () => void
  canBack: boolean
  canForward: boolean
}): JSX.Element {
  const project = useStore((s) => s.project)
  const lspState = useStore((s) => s.lspState)
  const [symbols, setSymbols] = useState<LspDocumentSymbol[]>([])
  const [cursorLine, setCursorLine] = useState(1)
  const tabs = useStore((s) => s.tabs)
  const content = tabs.find((t) => t.path === path)?.content

  useEffect(() => {
    const onCursor = (e: Event): void => setCursorLine((e as CustomEvent<number>).detail)
    window.addEventListener('xcode:cursor', onCursor)
    return () => window.removeEventListener('xcode:cursor', onCursor)
  }, [])

  useEffect(() => {
    if (!path?.toLowerCase().endsWith('.swift') || lspState !== 'running') return setSymbols([])
    const h = setTimeout(() => void window.xcode.lsp.documentSymbols(path).then(setSymbols), 600)
    return () => clearTimeout(h)
  }, [path, content, lspState])

  const crumbs = useMemo(() => {
    if (!path || !project) return []
    const rel = path.startsWith(project.root) ? path.slice(project.root.length + 1) : path
    return [project.name, ...rel.split(/[\\/]/)]
  }, [path, project])

  const enclosing = useMemo(() => {
    const find = (list: LspDocumentSymbol[], chain: string[]): string[] => {
      for (const s of list) {
        if (cursorLine - 1 >= s.range.start.line && cursorLine - 1 <= s.range.end.line) {
          return find(s.children ?? [], [...chain, s.name])
        }
      }
      return chain
    }
    return find(symbols, [])
  }, [symbols, cursorLine])

  return (
    <div className="jumpbar">
      <span className="nav-arrows">
        <button onClick={onBack} disabled={!canBack} title="Go Back">
          <ArrowLeft />
        </button>
        <button onClick={onForward} disabled={!canForward} title="Go Forward">
          <ArrowRight />
        </button>
      </span>
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <span className="chev">
              <Chevron />
            </span>
          )}
          <span className="crumb">
            {i === 0 ? <FileIcon kind="package" /> : i === crumbs.length - 1 ? <FileIcon kind={c.endsWith('.swift') ? 'swift' : 'text'} /> : <FileIcon kind="folder" />}
            {c}
          </span>
        </React.Fragment>
      ))}
      {enclosing.map((name, i) => (
        <React.Fragment key={`s${i}`}>
          <span className="chev">
            <Chevron />
          </span>
          <span className="crumb" style={{ color: 'var(--text)' }}>
            {name}
          </span>
        </React.Fragment>
      ))}
      <span className="spacer" />
      <span className="muted">Line {cursorLine}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------

function MonacoHost(): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor>()
  const activePath = useStore((s) => s.activePath)
  const tabs = useStore((s) => s.tabs)
  const theme = useStore((s) => s.theme)
  const minimap = useStore((s) => s.minimap)
  const revealRequest = useStore((s) => s.revealRequest)
  const breakpoints = useStore((s) => s.breakpoints)
  const bpEnabled = useStore((s) => s.breakpointsEnabled)
  const debug = useStore((s) => s.debug)
  const selectedFrameId = useStore((s) => s.selectedFrameId)
  const build = useStore((s) => s.build)
  const lspDiagnostics = useStore((s) => s.lspDiagnostics)
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection>()
  const suppressChange = useRef(false)

  const active = tabs.find((t) => t.path === activePath)

  // Create editor once.
  useEffect(() => {
    if (!hostRef.current) return
    const editor = monaco.editor.create(hostRef.current, {
      theme: theme === 'dark' ? 'xcode-dark' : 'xcode-light',
      fontFamily: 'SF Mono, Menlo, Cascadia Code, Cascadia Mono, Consolas, monospace',
      fontSize: 12.5,
      lineHeight: 19,
      minimap: { enabled: minimap, renderCharacters: false },
      glyphMargin: true,
      lineNumbersMinChars: 4,
      folding: true,
      renderLineHighlight: 'line',
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      automaticLayout: true,
      tabSize: 4,
      insertSpaces: true,
      bracketPairColorization: { enabled: false },
      padding: { top: 6 },
      quickSuggestions: { other: true, comments: false, strings: false },
      suggestOnTriggerCharacters: true,
      wordBasedSuggestions: 'off',
      fixedOverflowWidgets: true
    })
    editorRef.current = editor
    decorations.current = editor.createDecorationsCollection()

    editor.onDidChangeModelContent(() => {
      if (suppressChange.current) return
      const model = editor.getModel()
      const path = model && modelPath(model)
      if (!model || !path) return
      useStore.getState().updateContent(path, model.getValue())
    })
    editor.onDidChangeCursorPosition((e) => {
      window.dispatchEvent(new CustomEvent('xcode:cursor', { detail: e.position.lineNumber }))
    })
    // Click in the gutter toggles a breakpoint, like Xcode.
    editor.onMouseDown((e) => {
      const t = e.target.type
      if (
        (t === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || t === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) &&
        e.target.position
      ) {
        const model = editor.getModel()
        const path = model && modelPath(model)
        if (path) useStore.getState().toggleBreakpoint(path, e.target.position.lineNumber)
      }
    })
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void useStore.getState().saveTab())
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backslash, () => {
      const pos = editor.getPosition()
      const model = editor.getModel()
      const path = model && modelPath(model)
      if (pos && path) useStore.getState().toggleBreakpoint(path, pos.lineNumber)
    })
    ;(window as unknown as { __editor?: monaco.editor.IStandaloneCodeEditor }).__editor = editor

    return () => {
      editor.dispose()
      editorRef.current = undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    monaco.editor.setTheme(theme === 'dark' ? 'xcode-dark' : 'xcode-light')
  }, [theme])
  useEffect(() => {
    editorRef.current?.updateOptions({ minimap: { enabled: minimap, renderCharacters: false } })
  }, [minimap])

  // Swap model when the active tab changes; dispose models of closed tabs.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !active || active.loading) return
    const uri = monaco.Uri.file(active.path)
    let model = monaco.editor.getModel(uri)
    if (!model) {
      model = monaco.editor.createModel(active.content, languageForPath(active.path), uri)
    } else if (model.getValue() !== active.content) {
      suppressChange.current = true
      model.setValue(active.content)
      suppressChange.current = false
    }
    if (editor.getModel() !== model) {
      editor.setModel(model)
      editor.focus()
    }
    const open = new Set(tabs.map((t) => monaco.Uri.file(t.path).toString()))
    for (const m of monaco.editor.getModels()) if (!open.has(m.uri.toString())) m.dispose()
  }, [active?.path, active?.loading, active?.content, tabs])

  // Reveal line/column requests (issue click, jump to definition, frame select).
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !revealRequest || revealRequest.path !== activePath || active?.loading) return
    const pos = { lineNumber: revealRequest.line, column: revealRequest.column ?? 1 }
    editor.revealLineInCenter(pos.lineNumber)
    editor.setPosition(pos)
    editor.focus()
  }, [revealRequest, activePath, active?.loading])

  // Decorations: breakpoints, execution line, inline issue banners.
  useEffect(() => {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model || !activePath) return
    const decos: monaco.editor.IModelDeltaDecoration[] = []
    for (const bp of breakpoints.filter((b) => b.file === activePath)) {
      decos.push({
        range: new monaco.Range(bp.line, 1, bp.line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: `bp-glyph ${bp.enabled && bpEnabled ? '' : 'disabled'}`,
          glyphMarginHoverMessage: { value: bp.enabled ? 'Breakpoint' : 'Disabled breakpoint' }
        }
      })
    }
    if (debug.state === 'paused') {
      const frame = debug.frames.find((f) => f.id === selectedFrameId) ?? debug.frames[0]
      if (frame?.file && frame.line && frame.file.toLowerCase() === activePath.toLowerCase()) {
        decos.push({
          range: new monaco.Range(frame.line, 1, frame.line, 1),
          options: { isWholeLine: true, className: 'exec-line', glyphMarginClassName: 'exec-glyph' }
        })
      }
    }
    const issues = allIssues({ build, lspDiagnostics }).filter(
      (i) => i.file.toLowerCase() === activePath.toLowerCase() && i.severity !== 'note'
    )
    const perLine = new Map<number, (typeof issues)[number]>()
    for (const i of issues) if (!perLine.has(i.line) || i.severity === 'error') perLine.set(i.line, i)
    for (const i of perLine.values()) {
      const lineLen = model.getLineMaxColumn(Math.min(i.line, model.getLineCount()))
      decos.push({
        range: new monaco.Range(i.line, lineLen, i.line, lineLen),
        options: {
          after: {
            content: ` ${i.severity === 'error' ? '⊗' : '⚠'} ${i.message.slice(0, 110)}`,
            inlineClassName: `inline-issue ${i.severity}`
          }
        }
      })
    }
    decorations.current?.set(decos)
  }, [breakpoints, bpEnabled, debug, selectedFrameId, build, lspDiagnostics, activePath, active?.content])

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
}
