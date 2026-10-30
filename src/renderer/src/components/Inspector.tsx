import React, { useEffect, useState } from 'react'
import { useStore } from '@/state/store'
import { ChevronDown, Doc, Help } from './Icons'
import type { LspHover } from '@shared/types'

export function Inspector(): JSX.Element {
  const kind = useStore((s) => s.inspector)
  const set = useStore((s) => s.set)
  return (
    <div className="inspector">
      <div className="inspector-bar">
        <button className={kind === 'file' ? 'active' : ''} title="File inspector (Ctrl+Alt+1)" onClick={() => set({ inspector: 'file' })}>
          <Doc />
        </button>
        <button className={kind === 'help' ? 'active' : ''} title="Quick Help inspector (Ctrl+Alt+2)" onClick={() => set({ inspector: 'help' })}>
          <Help />
        </button>
      </div>
      <div className="inspector-body">{kind === 'file' ? <FileInspector /> : <QuickHelp />}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <div className="insp-section">
      <h4 onClick={() => setOpen(!open)}>
        <ChevronDown style={{ transform: open ? undefined : 'rotate(-90deg)' }} />
        {title}
      </h4>
      {open && children}
    </div>
  )
}

function FileInspector(): JSX.Element {
  const project = useStore((s) => s.project)
  const activePath = useStore((s) => s.activePath)
  const selectedPath = useStore((s) => s.selectedPath)
  const tabs = useStore((s) => s.tabs)
  const path = activePath ?? selectedPath
  const tab = tabs.find((t) => t.path === path)

  if (!path) return <div className="nav-empty">No Selection</div>
  const name = path.split(/[\\/]/).pop() ?? path
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  const type =
    ext === 'swift' ? 'Swift Source' : name === 'Package.swift' ? 'Swift Package Manifest' : ext === 'md' ? 'Markdown' : ext === 'json' ? 'JSON' : 'Plain Text'
  const rel = project && path.startsWith(project.root) ? path.slice(project.root.length + 1) : path
  const lines = tab ? tab.content.split(/\r?\n/).length : undefined
  const lineEnding = tab ? (tab.content.includes('\r\n') ? 'Windows (CRLF)' : 'Unix (LF)') : '—'

  return (
    <>
      <Section title="Identity and Type">
        <div className="insp-row">
          <span className="k">Name</span>
          <span className="v">{name}</span>
        </div>
        <div className="insp-row">
          <span className="k">Type</span>
          <span className="v">{type}</span>
        </div>
        <div className="insp-row">
          <span className="k">Location</span>
          <span className="v">Relative to Group</span>
        </div>
        <div className="insp-row">
          <span className="k"></span>
          <span className="v mono">{rel}</span>
        </div>
        <div className="insp-row">
          <span className="k">Full Path</span>
          <span className="v mono" style={{ fontSize: 10.5 }}>
            {path}
          </span>
        </div>
      </Section>
      <Section title="Text Settings">
        <div className="insp-row">
          <span className="k">Encoding</span>
          <span className="v">Unicode (UTF-8)</span>
        </div>
        <div className="insp-row">
          <span className="k">Line Endings</span>
          <span className="v">{lineEnding}</span>
        </div>
        <div className="insp-row">
          <span className="k">Indent Using</span>
          <span className="v">Spaces</span>
        </div>
        <div className="insp-row">
          <span className="k">Widths</span>
          <span className="v">4 tab · 4 indent</span>
        </div>
        {lines !== undefined && (
          <div className="insp-row">
            <span className="k">Lines</span>
            <span className="v">{lines}</span>
          </div>
        )}
      </Section>
      <Section title="Target Membership">
        {(project?.products ?? []).map((p) => {
          const inTarget = rel.replace(/\\/g, '/').startsWith(`${p.type === 'test' ? 'Tests' : 'Sources'}/${p.name}/`)
          return (
            <div key={p.name} className="insp-row" style={{ gridTemplateColumns: '18px 1fr' }}>
              <input type="checkbox" readOnly checked={inTarget} style={{ margin: 0 }} />
              <span className="v">{p.name}</span>
            </div>
          )
        })}
        {!project?.products.length && <div className="muted">No targets</div>}
      </Section>
    </>
  )
}

function QuickHelp(): JSX.Element {
  const activePath = useStore((s) => s.activePath)
  const lspState = useStore((s) => s.lspState)
  const [hover, setHover] = useState<LspHover | null>(null)
  const [line, setLine] = useState(1)

  useEffect(() => {
    const onCursor = (e: Event): void => setLine((e as CustomEvent<number>).detail)
    window.addEventListener('xcode:cursor', onCursor)
    return () => window.removeEventListener('xcode:cursor', onCursor)
  }, [])

  useEffect(() => {
    if (!activePath?.endsWith('.swift') || lspState !== 'running') return
    const editor = (window as unknown as { __editor?: import('monaco-editor').editor.IStandaloneCodeEditor }).__editor
    const pos = editor?.getPosition()
    if (!pos) return
    const h = setTimeout(
      () =>
        void window.xcode.lsp
          .hover(activePath, { line: pos.lineNumber - 1, character: pos.column - 1 })
          .then(setHover),
      350
    )
    return () => clearTimeout(h)
  }, [activePath, line, lspState])

  if (lspState !== 'running')
    return <div className="nav-empty">Quick Help needs sourcekit-lsp from the Swift toolchain.</div>
  if (!hover)
    return (
      <div className="nav-empty">
        <Help style={{ width: 26, height: 26, opacity: 0.5, marginBottom: 6 }} />
        <div>No Quick Help</div>
        <div style={{ marginTop: 4, fontSize: 11.5 }}>Place the cursor on a symbol to see its documentation.</div>
      </div>
    )
  const parts = (Array.isArray(hover.contents) ? hover.contents : [hover.contents]).map((c) => (typeof c === 'string' ? c : c.value))
  return (
    <div className="quick-help">
      {parts.map((p, i) => (
        <Markdownish key={i} text={p} />
      ))}
    </div>
  )
}

/** Tiny markdown renderer good enough for sourcekit-lsp hovers (code fences + paragraphs). */
function Markdownish({ text }: { text: string }): JSX.Element {
  const blocks = text.split(/```[a-z]*\n?/)
  return (
    <>
      {blocks.map((b, i) =>
        i % 2 === 1 ? (
          <pre key={i}>{b.trim()}</pre>
        ) : (
          b
            .split(/\n{2,}/)
            .filter((x) => x.trim())
            .map((para, j) => (
              <p key={`${i}-${j}`} style={{ margin: '6px 0' }}>
                {para.split(/(`[^`]+`)/).map((seg, k) =>
                  seg.startsWith('`') ? <code key={k}>{seg.slice(1, -1)}</code> : <span key={k}>{seg}</span>
                )}
              </p>
            ))
        )
      )}
    </>
  )
}
