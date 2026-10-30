import React from 'react'
import { useStore, allIssues } from '@/state/store'
import { ErrorIcon, Play, Sidebar, SidebarRight, Stop, SwiftBird, Warning, ChevronDown, Terminal, Laptop } from './Icons'
import { actions } from '@/lib/actions'

export function Toolbar(): JSX.Element {
  const s = useStore()
  const busy = s.build.phase === 'building' || s.build.phase === 'running' || s.build.phase === 'testing'
  const debugging = s.debug.state !== 'inactive' && s.debug.state !== 'terminated'
  const macBusy = s.macRun.state === 'syncing' || s.macRun.state === 'building' || s.macRun.state === 'installing' || s.macRun.state === 'running'
  const running = busy || debugging || macBusy
  // Destination menu value: 'pc' or 'mac:<udid>'; 'mac' alone = Mac not set up yet (opens Settings).
  const destValue = s.destination === 'mac' ? (s.simUdid ? `mac:${s.simUdid}` : 'mac') : 'pc'
  const chooseDestination = (v: string): void => {
    const remember = (d: string): void => {
      try {
        localStorage.setItem('tomcode.destination', d)
      } catch {
        /* storage unavailable — destination just won't persist */
      }
    }
    if (v === 'pc') {
      remember('pc')
      return s.set({ destination: 'pc' })
    }
    if (v === 'mac') return s.set({ sheet: 'settings' })
    remember('mac')
    s.set({ destination: 'mac', simUdid: v.slice(4), canvasVisible: true })
  }
  const macName = s.mac.hostname ?? s.macConn?.host?.replace(/\.local$/, '') ?? 'Mac'
  const issues = allIssues(s)
  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.filter((i) => i.severity === 'warning').length
  const products = s.project?.products ?? []

  const message = (): { text: string; secondary: boolean } => {
    if (debugging) {
      if (s.debug.state === 'paused') return { text: `Paused — ${s.debug.reason || 'breakpoint'}`, secondary: false }
      if (s.debug.state === 'launching') return { text: 'Launching debugger…', secondary: false }
      return { text: `Running ${s.scheme} (debug)`, secondary: false }
    }
    if (macBusy) return { text: s.macRun.message, secondary: false }
    if (s.build.phase === 'idle') return { text: s.project ? `${s.project.name}` : 'Ready', secondary: true }
    const when = s.build.finishedAt ? new Date(s.build.finishedAt) : undefined
    const time = when ? ` | ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''
    return { text: `${s.build.message}${busy ? '' : time}`, secondary: false }
  }
  const m = message()

  return (
    <div className="toolbar">
      <div className="left">
        <button
          className={`tb-btn ${s.navigatorVisible ? 'active' : ''}`}
          title="Hide or show the Navigator (Ctrl+0)"
          onClick={() => s.set({ navigatorVisible: !s.navigatorVisible })}
        >
          <Sidebar />
        </button>
        <button
          className={`tb-btn run ${running ? 'running' : ''}`}
          title={running ? 'Stop (Ctrl+.)' : 'Run (Ctrl+R)'}
          disabled={!s.project}
          onClick={() => (running ? actions.stop() : actions.run())}
        >
          {running ? <Stop /> : <Play />}
        </button>
        <div className="scheme" title="Scheme">
          <span className="seg">
            <SwiftBird style={{ color: '#f05138' }} />
            <select value={s.scheme ?? ''} onChange={(e) => s.set({ scheme: e.target.value })} disabled={!products.length}>
              {products.length === 0 && <option value="">No Scheme</option>}
              {products.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown style={{ width: 10, height: 10, color: 'var(--text-secondary)' }} />
          </span>
          <span className={`seg ${s.destination === 'pc' ? 'muted' : ''}`} title="Run destination">
            {s.destination === 'mac' ? <Laptop /> : <Terminal />}
            <select value={destValue} onChange={(e) => chooseDestination(e.target.value)}>
              <option value="pc">My PC</option>
              {s.mac.state === 'ready' && s.simulators.length > 0 ? (
                <optgroup label={`${macName} — iOS Simulators`}>
                  {s.simulators.map((d) => (
                    <option key={d.udid} value={`mac:${d.udid}`}>
                      {d.name} ({d.runtime})
                    </option>
                  ))}
                </optgroup>
              ) : (
                <option value="mac">{s.mac.state === 'connecting' ? `Connecting to ${macName}…` : s.mac.state === 'ready' ? `${macName} (no simulators)` : 'Add a Mac…'}</option>
              )}
            </select>
            <ChevronDown style={{ width: 10, height: 10, color: 'var(--text-secondary)' }} />
          </span>
        </div>
      </div>

      <div className="center">
        <div className="activity-wrap">
          <div className="activity">
            <span className="app-icon">
              <SwiftBird />
            </span>
            <span className={`msg ${m.secondary ? 'secondary' : ''}`}>{m.text}</span>
            <span className="counts">
              {errors > 0 && (
                <span style={{ color: 'var(--issue-error)' }} title={`${errors} errors`}>
                  <ErrorIcon /> {errors}
                </span>
              )}
              {warnings > 0 && (
                <span style={{ color: 'var(--issue-warning)' }} title={`${warnings} warnings`}>
                  <Warning /> {warnings}
                </span>
              )}
            </span>
            {(busy || macBusy) && <span className="progress" />}
          </div>
        </div>
      </div>

      <div className="right">
        {products.some((p) => p.isApp) && (
          <button
            className={`tb-btn ${s.canvasVisible ? 'active' : ''}`}
            title="Hide or show the Simulator canvas (Ctrl+Alt+Return)"
            onClick={() => s.set({ canvasVisible: !s.canvasVisible })}
          >
            <Terminal style={{ transform: 'rotate(90deg)' }} />
          </button>
        )}
        <button
          className={`tb-btn ${s.inspectorVisible ? 'active' : ''}`}
          title="Hide or show the Inspectors (Ctrl+Alt+0)"
          onClick={() => s.set({ inspectorVisible: !s.inspectorVisible })}
        >
          <SidebarRight />
        </button>
      </div>
    </div>
  )
}
