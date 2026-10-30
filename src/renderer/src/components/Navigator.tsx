import React, { useEffect, useMemo, useState } from 'react'
import type { FileNode, LspDocumentSymbol } from '@shared/types'
import { NavigatorKind, allIssues, useStore } from '@/state/store'
import { FileTree, FileIcon } from './FileTree'
import {
  Branch,
  Breakpoint as BpIcon,
  Bug,
  Check,
  Chevron,
  Close,
  ErrorIcon,
  Flask,
  Folder,
  Info,
  Report,
  Search,
  Symbols,
  Warning
} from './Icons'
import { ContextMenu, MenuItem } from './ContextMenu'
import { actions } from '@/lib/actions'
import { SourceControlNavigator } from './SourceControl'

const NAVS: { kind: NavigatorKind; title: string; icon: JSX.Element; key: string }[] = [
  { kind: 'project', title: 'Project navigator', icon: <Folder />, key: '1' },
  { kind: 'scm', title: 'Source Control navigator', icon: <Branch />, key: '2' },
  { kind: 'symbols', title: 'Symbol navigator', icon: <Symbols />, key: '3' },
  { kind: 'find', title: 'Find navigator', icon: <Search />, key: '4' },
  { kind: 'issues', title: 'Issue navigator', icon: <Warning />, key: '5' },
  { kind: 'tests', title: 'Test navigator', icon: <Flask />, key: '6' },
  { kind: 'debug', title: 'Debug navigator', icon: <Bug />, key: '7' },
  { kind: 'breakpoints', title: 'Breakpoint navigator', icon: <BpIcon />, key: '8' },
  { kind: 'reports', title: 'Report navigator', icon: <Report />, key: '9' }
]

export function Navigator(): JSX.Element {
  const nav = useStore((s) => s.navigator)
  const set = useStore((s) => s.set)
  return (
    <div className="sidebar">
      <div className="navbar">
        {NAVS.map((n) => (
          <button
            key={n.kind}
            className={nav === n.kind ? 'active' : ''}
            title={`${n.title} (Ctrl+${n.key})`}
            onClick={() => set({ navigator: n.kind })}
          >
            {n.icon}
          </button>
        ))}
      </div>
      {nav === 'project' && <ProjectNavigator />}
      {nav === 'scm' && <SourceControlNavigator />}
      {nav === 'symbols' && <SymbolNavigator />}
      {nav === 'find' && <FindNavigator />}
      {nav === 'issues' && <IssueNavigator />}
      {nav === 'tests' && <TestNavigator />}
      {nav === 'debug' && <DebugNavigator />}
      {nav === 'breakpoints' && <BreakpointNavigator />}
      {nav === 'reports' && <ReportNavigator />}
    </div>
  )
}

function Filter({ value, onChange, placeholder = 'Filter' }: { value: string; onChange: (v: string) => void; placeholder?: string }): JSX.Element {
  return (
    <div className="nav-filter">
      <div className="nav-filter-wrap">
        <Search className="icon" />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function ProjectNavigator(): JSX.Element {
  const project = useStore((s) => s.project)
  const set = useStore((s) => s.set)
  const [filter, setFilter] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null)
  const [renaming, setRenaming] = useState<string | undefined>()

  if (!project) return <div className="nav-empty">No project open</div>

  const dirOf = (n: FileNode): string => (n.kind === 'folder' ? n.path : n.path.replace(/[\\/][^\\/]+$/, ''))

  const items = (node: FileNode): MenuItem[] => [
    { label: 'Show in Explorer', onClick: () => void window.xcode.file.reveal(node.path) },
    { separator: true },
    {
      label: 'New File…',
      onClick: () => set({ sheet: 'newFile', selectedPath: dirOf(node) })
    },
    {
      label: 'New Folder',
      onClick: async () => {
        const base = dirOf(node)
        let name = 'New Folder'
        let i = 2
        const existing = new Set((findNode(project.tree, base)?.children ?? []).map((c) => c.name))
        while (existing.has(name)) name = `New Folder ${i++}`
        await window.xcode.file.create(await window.xcode.file.join(base, name), '', true)
        set({ expanded: { ...useStore.getState().expanded, [base]: true } })
      }
    },
    { separator: true },
    { label: 'Rename', onClick: () => setRenaming(node.path), disabled: node.path === project.root },
    {
      label: 'Delete',
      onClick: async () => {
        const ok = await window.xcode.file.delete(node.path)
        if (ok) useStore.getState().closeTab(node.path)
      },
      disabled: node.path === project.root
    }
  ]

  const onRename = async (node: FileNode, newName: string): Promise<void> => {
    setRenaming(undefined)
    const trimmed = newName.trim()
    if (!trimmed || trimmed === node.name) return
    const to = await window.xcode.file.join(dirOf({ ...node, kind: 'text' }), trimmed)
    try {
      await window.xcode.file.rename(node.path, to)
      const st = useStore.getState()
      if (st.tabs.some((t) => t.path === node.path)) {
        st.closeTab(node.path)
        void st.openFile(to)
      }
    } catch (e) {
      useStore.getState().showToast((e as Error).message)
    }
  }

  return (
    <>
      <div className="nav-body">
        <FileTree
          node={project.tree}
          filter={filter}
          onContextMenu={(node, e) => setMenu({ x: e.clientX, y: e.clientY, node })}
          renaming={renaming}
          onRename={onRename}
        />
      </div>
      <Filter value={filter} onChange={setFilter} />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items(menu.node)} onClose={() => setMenu(null)} />}
    </>
  )
}

export function findNode(root: FileNode, path: string): FileNode | undefined {
  if (root.path === path) return root
  for (const c of root.children ?? []) {
    const f = findNode(c, path)
    if (f) return f
  }
  return undefined
}

export function flatten(root: FileNode, out: FileNode[] = []): FileNode[] {
  if (root.kind !== 'folder') out.push(root)
  root.children?.forEach((c) => flatten(c, out))
  return out
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

const SYMBOL_KIND: Record<number, { label: string; color: string }> = {
  5: { label: 'C', color: '#bf5af2' },
  6: { label: 'M', color: '#64d2ff' },
  7: { label: 'P', color: '#64d2ff' },
  8: { label: 'F', color: '#64d2ff' },
  9: { label: 'C', color: '#64d2ff' },
  10: { label: 'E', color: '#ff9f0a' },
  11: { label: 'Pr', color: '#bf5af2' },
  12: { label: 'f', color: '#30d158' },
  13: { label: 'V', color: '#64d2ff' },
  14: { label: 'K', color: '#64d2ff' },
  22: { label: 'E', color: '#ff9f0a' },
  23: { label: 'S', color: '#bf5af2' },
  26: { label: 'T', color: '#bf5af2' }
}

function SymbolNavigator(): JSX.Element {
  const activePath = useStore((s) => s.activePath)
  const openFile = useStore((s) => s.openFile)
  const tabs = useStore((s) => s.tabs)
  const lspState = useStore((s) => s.lspState)
  const [symbols, setSymbols] = useState<LspDocumentSymbol[]>([])
  const [filter, setFilter] = useState('')
  const content = tabs.find((t) => t.path === activePath)?.content

  useEffect(() => {
    if (!activePath?.toLowerCase().endsWith('.swift') || lspState !== 'running') return setSymbols([])
    const h = setTimeout(() => void window.xcode.lsp.documentSymbols(activePath).then(setSymbols), 400)
    return () => clearTimeout(h)
  }, [activePath, content, lspState])

  if (!activePath) return <div className="nav-empty">Open a Swift file to see its symbols</div>
  if (lspState !== 'running')
    return <div className="nav-empty">Symbol information requires sourcekit-lsp from the Swift toolchain.</div>

  const render = (list: LspDocumentSymbol[], depth: number): JSX.Element[] =>
    list
      .filter((sym) => !filter || sym.name.toLowerCase().includes(filter.toLowerCase()) || sym.children?.length)
      .flatMap((sym) => {
        const k = SYMBOL_KIND[sym.kind] ?? { label: '•', color: 'var(--text-secondary)' }
        return [
          <div
            key={`${sym.name}:${sym.range.start.line}`}
            className="row"
            style={{ paddingLeft: 10 + depth * 14 }}
            onClick={() => void openFile(activePath, sym.selectionRange.start.line + 1, sym.selectionRange.start.character + 1)}
          >
            <span
              className="row-icon"
              style={{
                background: k.color,
                color: '#fff',
                borderRadius: 4,
                fontSize: 9,
                fontWeight: 700,
                width: 15,
                height: 15
              }}
            >
              {k.label}
            </span>
            <span className="label">{sym.name}</span>
          </div>,
          ...(sym.children ? render(sym.children, depth + 1) : [])
        ]
      })

  return (
    <>
      <div className="nav-body">{symbols.length ? render(symbols, 0) : <div className="nav-empty">No symbols</div>}</div>
      <Filter value={filter} onChange={setFilter} />
    </>
  )
}

// ---------------------------------------------------------------------------

interface FindHit {
  path: string
  name: string
  line: number
  text: string
  col: number
}

function FindNavigator(): JSX.Element {
  const project = useStore((s) => s.project)
  const openFile = useStore((s) => s.openFile)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<FindHit[]>([])
  const [searching, setSearching] = useState(false)

  const search = async (): Promise<void> => {
    if (!project || query.trim().length < 2) return setHits([])
    setSearching(true)
    const files = flatten(project.tree).filter((f) => ['swift', 'package', 'json', 'markdown', 'text'].includes(f.kind))
    const out: FindHit[] = []
    const q = query.toLowerCase()
    for (const f of files) {
      let text: string
      try {
        text = await window.xcode.file.read(f.path)
      } catch {
        continue
      }
      const lines = text.split(/\r?\n/)
      lines.forEach((l, i) => {
        const col = l.toLowerCase().indexOf(q)
        if (col >= 0) out.push({ path: f.path, name: f.name, line: i + 1, text: l.trim(), col: col + 1 })
      })
      if (out.length > 500) break
    }
    setHits(out)
    setSearching(false)
  }

  const grouped = useMemo(() => {
    const m = new Map<string, FindHit[]>()
    for (const h of hits) m.set(h.path, [...(m.get(h.path) ?? []), h])
    return [...m.entries()]
  }, [hits])

  return (
    <>
      <div className="nav-filter" style={{ borderTop: 'none', borderBottom: '1px solid var(--divider)' }}>
        <div className="nav-filter-wrap">
          <Search className="icon" />
          <input
            autoFocus
            value={query}
            placeholder="Text ▸ Containing"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void search()}
            spellCheck={false}
          />
        </div>
      </div>
      <div className="nav-body">
        {searching && <div className="nav-empty">Searching…</div>}
        {!searching && hits.length === 0 && (
          <div className="nav-empty">{query ? 'No results — press Return to search' : 'Find in project'}</div>
        )}
        {grouped.map(([path, list]) => (
          <div key={path}>
            <div className="row" style={{ paddingLeft: 8, fontWeight: 600 }}>
              <span className="row-icon">
                <FileIcon kind={path.endsWith('.swift') ? 'swift' : 'text'} />
              </span>
              <span className="label">{list[0].name}</span>
              <span className="badge">{list.length}</span>
            </div>
            {list.map((h) => (
              <div
                key={`${h.path}:${h.line}:${h.col}`}
                className="issue-row"
                style={{ paddingLeft: 30 }}
                onClick={() => void openFile(h.path, h.line, h.col)}
              >
                <span className="text">
                  {h.text.slice(0, 120)}
                  <span className="loc">line {h.line}</span>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

function IssueNavigator(): JSX.Element {
  const build = useStore((s) => s.build)
  const lspDiagnostics = useStore((s) => s.lspDiagnostics)
  const openFile = useStore((s) => s.openFile)
  const issues = useMemo(() => allIssues({ build, lspDiagnostics }), [build, lspDiagnostics])
  const [filter, setFilter] = useState('')
  const filtered = issues.filter((i) => !filter || i.message.toLowerCase().includes(filter.toLowerCase()))

  const grouped = useMemo(() => {
    const m = new Map<string, typeof filtered>()
    for (const i of filtered) m.set(i.file, [...(m.get(i.file) ?? []), i])
    return [...m.entries()]
  }, [filtered])

  return (
    <>
      <div className="nav-body">
        {filtered.length === 0 && (
          <div className="nav-empty">
            <Check style={{ width: 26, height: 26, color: 'var(--green)', marginBottom: 6 }} />
            <div>No issues</div>
          </div>
        )}
        {grouped.map(([file, list]) => (
          <div key={file}>
            <div className="row" style={{ paddingLeft: 8, fontWeight: 600 }} title={file}>
              <span className="row-icon">
                <FileIcon kind={file.endsWith('.swift') ? 'swift' : 'text'} />
              </span>
              <span className="label">{file.split(/[\\/]/).pop()}</span>
            </div>
            {list.map((i, idx) => (
              <div
                key={idx}
                className="issue-row"
                style={{ paddingLeft: 24 }}
                onClick={() => void openFile(i.file, i.line, i.column)}
                title={i.message}
              >
                {i.severity === 'error' ? (
                  <ErrorIcon className="sev error" />
                ) : i.severity === 'warning' ? (
                  <Warning className="sev warning" />
                ) : (
                  <Info className="sev note" />
                )}
                <span className="text">
                  {i.message}
                  <span className="loc">line {i.line}</span>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <Filter value={filter} onChange={setFilter} />
    </>
  )
}

// ---------------------------------------------------------------------------

function TestNavigator(): JSX.Element {
  const project = useStore((s) => s.project)
  const tests = useStore((s) => s.tests)
  const build = useStore((s) => s.build)
  const testTargets = project?.products.filter((p) => p.type === 'test') ?? []
  const suites = useMemo(() => {
    const m = new Map<string, typeof tests>()
    for (const t of tests) m.set(t.suite, [...(m.get(t.suite) ?? []), t])
    return [...m.entries()]
  }, [tests])

  if (!project) return <div className="nav-empty">No project open</div>
  return (
    <>
      <div className="nav-body">
        {testTargets.length === 0 && <div className="nav-empty">This package has no test targets.</div>}
        {testTargets.map((t) => (
          <div key={t.name} className="row" style={{ paddingLeft: 8, fontWeight: 600 }}>
            <span className="row-icon">
              <Flask style={{ color: 'var(--text-secondary)' }} />
            </span>
            <span className="label">{t.name}</span>
            <button
              className="btn small"
              onClick={() => void window.xcode.build.test(t.name)}
              disabled={build.phase === 'testing'}
              title="Run tests in this target"
            >
              ▶
            </button>
          </div>
        ))}
        {suites.map(([suite, list]) => (
          <div key={suite}>
            <div className="row" style={{ paddingLeft: 20 }}>
              <span className={`test-status ${list.some((x) => x.status === 'failed') ? 'failed' : 'passed'}`}>
                {list.some((x) => x.status === 'failed') ? <Close /> : <Check />}
              </span>
              <span className="label">{suite}</span>
            </div>
            {list.map((t) => (
              <div key={t.name} className="row" style={{ paddingLeft: 40 }}>
                <span className={`test-status ${t.status}`}>{t.status === 'failed' ? <Close /> : <Check />}</span>
                <span className="label">{t.name}</span>
                <span className="sub">{t.duration !== undefined ? `${t.duration.toFixed(3)}s` : ''}</span>
              </div>
            ))}
          </div>
        ))}
        {tests.length === 0 && testTargets.length > 0 && (
          <div className="nav-empty">
            Press Ctrl+U to run the tests.
            <div style={{ marginTop: 10 }}>
              <button className="btn small" onClick={() => void actions.test()}>
                Run All Tests
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

function DebugNavigator(): JSX.Element {
  const debug = useStore((s) => s.debug)
  const scheme = useStore((s) => s.scheme)
  const selectedFrameId = useStore((s) => s.selectedFrameId)
  const set = useStore((s) => s.set)
  const openFile = useStore((s) => s.openFile)

  if (debug.state === 'inactive' || debug.state === 'terminated')
    return (
      <div className="nav-empty">
        <Bug style={{ width: 28, height: 28, opacity: 0.5, marginBottom: 8 }} />
        <div>No debug session.</div>
        <div style={{ marginTop: 8 }}>
          <button className="btn small" onClick={() => void actions.debug()}>
            Debug {scheme ?? ''}
          </button>
        </div>
      </div>
    )

  return (
    <div className="nav-body">
      <div className="row" style={{ paddingLeft: 8, fontWeight: 600 }}>
        <span className="row-icon">
          <Bug style={{ color: 'var(--text-secondary)' }} />
        </span>
        <span className="label">{scheme}</span>
        <span className="sub">{debug.state}</span>
      </div>
      {debug.state === 'paused' && (
        <div className="row" style={{ paddingLeft: 22 }}>
          <span className="disclosure open">
            <Chevron />
          </span>
          <span className="label">Thread {debug.threadId ?? 1}</span>
        </div>
      )}
      {debug.frames.map((f, i) => (
        <div
          key={f.id}
          className={`row ${selectedFrameId === f.id ? 'selected' : ''}`}
          style={{ paddingLeft: 40 }}
          onClick={() => {
            set({ selectedFrameId: f.id })
            if (f.file && f.line) void openFile(f.file, f.line, f.column)
          }}
          title={f.file ? `${f.file}:${f.line}` : undefined}
        >
          <span className="sub" style={{ width: 16, textAlign: 'right' }}>
            {i}
          </span>
          <span className="label" style={{ color: f.file ? undefined : 'var(--text-secondary)' }}>
            {f.name}
          </span>
        </div>
      ))}
      {debug.state === 'running' && <div className="nav-empty">Running… pause to inspect threads.</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------

function BreakpointNavigator(): JSX.Element {
  const bps = useStore((s) => s.breakpoints)
  const setEnabled = useStore((s) => s.setBreakpointEnabled)
  const remove = useStore((s) => s.removeBreakpoint)
  const openFile = useStore((s) => s.openFile)
  const grouped = useMemo(() => {
    const m = new Map<string, typeof bps>()
    for (const b of bps) m.set(b.file, [...(m.get(b.file) ?? []), b])
    return [...m.entries()].map(([f, l]) => [f, l.sort((a, b) => a.line - b.line)] as const)
  }, [bps])

  if (!bps.length) return <div className="nav-empty">No breakpoints. Click a line number in the editor to add one.</div>
  return (
    <div className="nav-body">
      {grouped.map(([file, list]) => (
        <div key={file}>
          <div className="row" style={{ paddingLeft: 8, fontWeight: 600 }}>
            <span className="row-icon">
              <FileIcon kind="swift" />
            </span>
            <span className="label">{file.split(/[\\/]/).pop()}</span>
          </div>
          {list.map((b) => (
            <div key={b.id} className="bp-row" style={{ paddingLeft: 28 }}>
              <span
                className={`bp-marker ${b.enabled ? '' : 'disabled'}`}
                onClick={() => setEnabled(b.id, !b.enabled)}
                title={b.enabled ? 'Disable' : 'Enable'}
              />
              <span style={{ flex: 1 }} onClick={() => void openFile(b.file, b.line)}>
                line {b.line}
              </span>
              <button className="tb-btn" style={{ width: 20, height: 18 }} onClick={() => remove(b.id)} title="Delete">
                <Close style={{ width: 10, height: 10 }} />
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

function ReportNavigator(): JSX.Element {
  const build = useStore((s) => s.build)
  const set = useStore((s) => s.set)
  if (build.phase === 'idle') return <div className="nav-empty">Build, run or test to see reports here.</div>
  const ok = build.phase === 'succeeded'
  const dur = build.startedAt && build.finishedAt ? ((build.finishedAt - build.startedAt) / 1000).toFixed(1) + 's' : ''
  return (
    <div className="nav-body">
      <div className="nav-section">Today</div>
      <div className="row" style={{ paddingLeft: 10 }} onClick={() => set({ debugAreaVisible: true })}>
        <span className={`test-status ${ok ? 'passed' : build.phase === 'failed' ? 'failed' : 'none'}`}>
          {ok ? <Check /> : build.phase === 'failed' ? <Close /> : null}
        </span>
        <span className="label">{build.message}</span>
        <span className="sub">{dur}</span>
      </div>
    </div>
  )
}
