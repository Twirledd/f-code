import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '@/state/store'
import type { Variable } from '@shared/types'
import { Chevron, Continue, Pause, StepIn, StepOut, StepOver, Trash, Breakpoint as BpIcon, PanelBottom } from './Icons'

export function DebugArea(): JSX.Element {
  const debug = useStore((s) => s.debug)
  const bpEnabled = useStore((s) => s.breakpointsEnabled)
  const set = useStore((s) => s.set)
  const clearConsole = useStore((s) => s.clearConsole)
  const [showVars, setShowVars] = useState(true)
  const paused = debug.state === 'paused'
  const live = debug.state === 'running' || paused

  const toggleAllBps = (): void => {
    const next = !bpEnabled
    set({ breakpointsEnabled: next })
    const bps = useStore.getState().breakpoints
    void window.xcode.debug.setBreakpoints(next ? bps : bps.map((b) => ({ ...b, enabled: false })))
  }

  return (
    <div className="debug-area">
      <div className="debug-bar">
        <button title="Hide Debug Area (Ctrl+Shift+Y)" onClick={() => set({ debugAreaVisible: false })}>
          <PanelBottom />
        </button>
        <span className="sep" />
        <button title={bpEnabled ? 'Deactivate Breakpoints (Ctrl+Y)' : 'Activate Breakpoints (Ctrl+Y)'} className={bpEnabled ? 'active' : ''} onClick={toggleAllBps}>
          <BpIcon />
        </button>
        <button title={paused ? 'Continue' : 'Pause'} disabled={!live} onClick={() => (paused ? void window.xcode.debug.continue() : void window.xcode.debug.pause())}>
          {paused ? <Continue /> : <Pause />}
        </button>
        <button title="Step Over (F6)" disabled={!paused} onClick={() => void window.xcode.debug.stepOver()}>
          <StepOver />
        </button>
        <button title="Step Into (F7)" disabled={!paused} onClick={() => void window.xcode.debug.stepIn()}>
          <StepIn />
        </button>
        <button title="Step Out (F8)" disabled={!paused} onClick={() => void window.xcode.debug.stepOut()}>
          <StepOut />
        </button>
        <span className="state">
          {debug.state === 'inactive' ? '' : debug.state === 'paused' ? `Paused${debug.reason ? ` (${debug.reason})` : ''}` : debug.state}
        </span>
        <span className="spacer" />
        <button title={showVars ? 'Hide Variables View' : 'Show Variables View'} className={showVars ? 'active' : ''} onClick={() => setShowVars(!showVars)}>
          <PanelBottom style={{ transform: 'rotate(90deg)' }} />
        </button>
        <button title="Clear Console" onClick={clearConsole}>
          <Trash />
        </button>
      </div>
      <div className={`debug-split ${showVars ? '' : 'console-only'}`}>
        {showVars && <VariablesView />}
        <Console />
      </div>
    </div>
  )
}

interface VarNode extends Variable {
  depth: number
  expanded?: boolean
  children?: VarNode[]
}

function VariablesView(): JSX.Element {
  const debug = useStore((s) => s.debug)
  const selectedFrameId = useStore((s) => s.selectedFrameId)
  const [roots, setRoots] = useState<VarNode[]>([])

  useEffect(() => {
    if (debug.state !== 'paused' || !debug.frames.length) return setRoots([])
    const frame = debug.frames.find((f) => f.id === selectedFrameId) ?? debug.frames[0]
    let cancelled = false
    void (async () => {
      try {
        const scopes = await window.xcode.debug.scopes(frame.id)
        const out: VarNode[] = []
        for (const sc of scopes) {
          if (/registers/i.test(sc.name)) continue
          const vars = await window.xcode.debug.variables(sc.variablesReference)
          out.push(...vars.map((v) => ({ ...v, depth: 0 })))
        }
        if (!cancelled) setRoots(out)
      } catch {
        if (!cancelled) setRoots([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [debug, selectedFrameId])

  const toggle = async (node: VarNode): Promise<void> => {
    const update = (list: VarNode[]): VarNode[] =>
      list.map((n) => (n === node ? { ...n, expanded: !n.expanded } : n.children ? { ...n, children: update(n.children) } : n))
    if (!node.expanded && !node.children && node.variablesReference > 0) {
      const kids = await window.xcode.debug.variables(node.variablesReference)
      node.children = kids.map((k) => ({ ...k, depth: node.depth + 1 }))
    }
    setRoots((r) => update(r))
  }

  const render = (list: VarNode[]): JSX.Element[] =>
    list.flatMap((n) => [
      <div key={`${n.depth}:${n.name}:${n.variablesReference}`} className="var-row" style={{ paddingLeft: 6 + n.depth * 14 }} onClick={() => n.variablesReference > 0 && void toggle(n)}>
        <span className={`disclosure ${n.expanded ? 'open' : ''}`}>{n.variablesReference > 0 ? <Chevron /> : null}</span>
        <span className="name">{n.name}</span>
        {n.type && <span className="type">({n.type})</span>}
        <span className="eq">=</span>
        <span className="val" title={n.value}>
          {n.value}
        </span>
      </div>,
      ...(n.expanded && n.children ? render(n.children) : [])
    ])

  if (debug.state !== 'paused') return <div className="vars"><div className="var-empty">{debug.state === 'running' ? 'Running…' : 'No variables'}</div></div>
  return <div className="vars">{roots.length ? render(roots) : <div className="var-empty">No variables in this frame</div>}</div>
}

function Console(): JSX.Element {
  const lines = useStore((s) => s.console)
  const debug = useStore((s) => s.debug)
  const build = useStore((s) => s.build)
  const outRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')
  const [stick, setStick] = useState(true)

  useEffect(() => {
    if (stick && outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight
  }, [lines, stick])

  const onScroll = (): void => {
    const el = outRef.current
    if (!el) return
    setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 24)
  }

  const submit = async (): Promise<void> => {
    const text = input
    setInput('')
    if (debug.state === 'paused') {
      useStore.getState().appendConsole({ stream: 'system', text: `(lldb) ${text}\n` })
      try {
        const frame = useStore.getState().selectedFrameId ?? debug.frames[0]?.id
        const r = await window.xcode.debug.evaluate(text, frame)
        useStore.getState().appendConsole({ stream: 'stdout', text: r + '\n' })
      } catch (e) {
        useStore.getState().appendConsole({ stream: 'stderr', text: (e as Error).message + '\n' })
      }
    } else if (build.phase === 'running') {
      window.xcode.build.sendInput(text + '\n')
      useStore.getState().appendConsole({ stream: 'system', text: text + '\n' })
    }
  }

  const prompt = debug.state === 'paused' ? '(lldb)' : build.phase === 'running' ? '>' : ''
  return (
    <div className="console">
      <div ref={outRef} className="console-out" onScroll={onScroll}>
        {lines.map((l) => (
          <span key={l.id} className={l.stream}>
            {l.text}
          </span>
        ))}
      </div>
      <div className="console-in">
        <span className="prompt">{prompt || '○'}</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder={debug.state === 'paused' ? 'LLDB expression…' : build.phase === 'running' ? 'Program input…' : ''}
          disabled={!prompt}
          spellCheck={false}
        />
      </div>
    </div>
  )
}
