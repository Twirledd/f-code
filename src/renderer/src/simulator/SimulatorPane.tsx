import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DEVICES, type DeviceSpec, type PreviewNode } from '@shared/preview-types'
import { useStore } from '@/state/store'
import { actions } from '@/lib/actions'
import { Node, Presentation, RenderCtx, collectPresentations, findDeep } from './NodeRenderer'
import { Symbol } from './symbols'
import { Play, Refresh, Stop, Close, ChevronDown } from '@/components/Icons'

const TYPE_SIZES: { id: string; label: string; scale: number }[] = [
  { id: 'xSmall', label: 'xSmall', scale: 0.82 },
  { id: 'small', label: 'Small', scale: 0.88 },
  { id: 'medium', label: 'Medium', scale: 0.94 },
  { id: 'large', label: 'Large (Default)', scale: 1 },
  { id: 'xLarge', label: 'xLarge', scale: 1.12 },
  { id: 'xxLarge', label: 'xxLarge', scale: 1.24 },
  { id: 'xxxLarge', label: 'xxxLarge', scale: 1.35 },
  { id: 'accessibility1', label: 'AX1', scale: 1.6 },
  { id: 'accessibility3', label: 'AX3', scale: 2.0 }
]

export function SimulatorPane(): JSX.Element {
  const s = useStore()
  // In Mac mode the frame matches the chosen Simulator (by name, falling back to the local pick).
  const simName = s.destination === 'mac' ? s.simulators.find((d) => d.udid === s.simUdid)?.name : undefined
  const device = (simName ? DEVICES.find((d) => d.name === simName) : undefined) ?? DEVICES.find((d) => d.id === s.device) ?? DEVICES[0]
  const hostRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(1)
  const landscape = s.previewLandscape
  const w = landscape ? device.height : device.width
  const h = landscape ? device.width : device.height
  const bezel = device.kind === 'phone' ? 12 : 18
  const zoom = s.previewZoom || fit
  const typeScale = TYPE_SIZES.find((t) => t.id === s.previewTypeSize)?.scale ?? 1
  const remote = s.destination === 'mac'
  const macBusy = s.macRun.state === 'syncing' || s.macRun.state === 'building' || s.macRun.state === 'installing' || s.macRun.state === 'running'
  const running = remote ? macBusy : s.previewStatus.state === 'running' || s.previewStatus.state === 'launching' || s.previewStatus.state === 'building'
  const sim = s.simulators.find((d) => d.udid === s.simUdid)

  // Fit-to-canvas scale.
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const sx = (r.width - 32) / (w + bezel * 2)
      const sy = (r.height - 32) / (h + bezel * 2)
      setFit(Math.max(0.2, Math.min(1, sx, sy)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [w, h, bezel])

  // Tell the app about environment changes.
  useEffect(() => {
    if (remote) {
      window.xcode.mac.ui('appearance', s.previewScheme)
      window.xcode.mac.ui('contentSize', s.previewTypeSize)
      return
    }
    window.xcode.preview.sendEnvironment({ colorScheme: s.previewScheme, dynamicTypeSize: s.previewTypeSize, width: w, height: h })
  }, [remote, s.previewScheme, s.previewTypeSize, w, h, s.previewStatus.state, s.macRun.state])

  const ctx = useMemo<RenderCtx>(
    () => ({
      send: (id, kind, value) => window.xcode.preview.sendEvent({ id, kind, value }),
      scheme: s.previewScheme,
      openURL: (url) => window.xcode.window.openExternal(url),
      safeTop: device.statusBarHeight,
      safeBottom: device.bottomInset,
      typeScale
    }),
    [s.previewScheme, device, typeScale]
  )

  return (
    <div className="sim-pane">
      <div className="sim-toolbar">
        <button className="tb-btn" title={running ? 'Stop' : remote ? 'Build on Mac & run in Simulator' : 'Resume (build & run preview)'} onClick={() => (running ? void actions.stop() : void actions.resumePreview())}>
          {running ? <Stop /> : <Play />}
        </button>
        <button className="tb-btn" title="Rebuild and relaunch" onClick={() => void actions.resumePreview()} disabled={remote ? s.macRun.state === 'building' || s.macRun.state === 'syncing' : s.previewStatus.state === 'building'}>
          <Refresh />
        </button>
        {remote ? (
          <span className="sim-status" title={s.macRun.message}>
            <span className={`dot ${s.macRun.state === 'running' ? 'running' : macBusy ? 'building' : s.macRun.state === 'failed' ? 'crashed' : ''}`} />
            {s.macRun.state === 'running' ? `Simulator · ${s.mac.hostname ?? 'Mac'}${s.macFps ? ` · ${s.macFps} fps` : ''}${s.macRun.input ? ' · touch' : ''}` : macBusy ? s.macRun.message : s.macRun.state === 'failed' ? 'Failed' : 'Paused'}
          </span>
        ) : (
          <span className="sim-status">
            <span className={`dot ${s.previewStatus.state}`} />
            {s.previewStatus.state === 'running' ? 'Running' : s.previewStatus.state === 'building' ? 'Building…' : s.previewStatus.state === 'launching' ? 'Launching…' : s.previewStatus.state === 'crashed' ? 'Crashed' : 'Paused'}
          </span>
        )}
        <span className="spacer" />
        {remote ? (
          <Picker value={s.simUdid ?? ''} options={s.simulators.map((d) => [d.udid, `${d.name} (${d.runtime})`])} onChange={(v) => s.set({ simUdid: v })} />
        ) : (
          <Picker value={s.device} options={DEVICES.filter((d) => !d.remoteOnly).map((d) => [d.id, d.name])} onChange={(v) => s.set({ device: v })} />
        )}
        {remote && s.macRun.input && (
          <button className="tb-btn" title="Home button" onClick={() => window.xcode.mac.button('home')}>
            <Symbol name="house" style={{ width: 15, height: 15 }} />
          </button>
        )}
        {!remote && (
          <button className={`tb-btn ${landscape ? 'active' : ''}`} title="Rotate" onClick={() => s.set({ previewLandscape: !landscape })}>
            <Symbol name="arrow.clockwise" style={{ width: 15, height: 15 }} />
          </button>
        )}
        <button className={`tb-btn ${s.previewScheme === 'dark' ? 'active' : ''}`} title="Toggle Dark Mode" onClick={() => s.set({ previewScheme: s.previewScheme === 'dark' ? 'light' : 'dark' })}>
          <Symbol name={s.previewScheme === 'dark' ? 'moon' : 'sun.max'} style={{ width: 15, height: 15 }} />
        </button>
        <Picker value={s.previewTypeSize} options={TYPE_SIZES.map((t) => [t.id, t.label])} onChange={(v) => s.set({ previewTypeSize: v })} icon="textformat.size" />
        <Picker
          value={String(s.previewZoom)}
          options={[['0', 'Fit'], ['0.5', '50%'], ['0.75', '75%'], ['1', '100%']]}
          onChange={(v) => s.set({ previewZoom: Number(v) })}
        />
        <button className="tb-btn" title="Hide Canvas" onClick={() => s.set({ canvasVisible: false })}>
          <Close />
        </button>
      </div>
      <div ref={hostRef} className="sim-canvas">
        <div className="sim-device-wrap" style={{ transform: `scale(${zoom})`, width: w + bezel * 2, height: h + bezel * 2 }}>
          <DeviceFrame device={device} landscape={landscape} bezel={bezel}>
            {remote ? (
              <MacScreen frame={s.macFrame} state={s.macRun.state} message={s.macRun.message} width={w} height={h} canTap={!!s.macRun.input} points={s.macRun.points} simName={sim?.name} />
            ) : (
              <DeviceScreen device={device} landscape={landscape} tree={s.previewTree} ctx={ctx} status={s.previewStatus.state} message={s.previewStatus.message} />
            )}
          </DeviceFrame>
        </div>
      </div>
    </div>
  )
}

function Picker({ value, options, onChange, icon }: { value: string; options: [string, string][]; onChange: (v: string) => void; icon?: string }): JSX.Element {
  return (
    <span className="sim-picker">
      {icon && <Symbol name={icon} style={{ width: 13, height: 13 }} />}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <ChevronDown style={{ width: 9, height: 9 }} />
    </span>
  )
}

function DeviceFrame({ device, landscape, bezel, children }: { device: DeviceSpec; landscape: boolean; bezel: number; children: React.ReactNode }): JSX.Element {
  const w = landscape ? device.height : device.width
  const h = landscape ? device.width : device.height
  const outerRadius = device.radius ? device.radius + bezel : 10
  return (
    <div className={`sim-device sim-${device.kind}`} style={{ width: w + bezel * 2, height: h + bezel * 2, borderRadius: outerRadius, padding: bezel }}>
      {device.kind === 'phone' && !landscape && (
        <>
          <span className="sim-btn sim-btn-mute" />
          <span className="sim-btn sim-btn-vol1" />
          <span className="sim-btn sim-btn-vol2" />
          <span className="sim-btn sim-btn-power" />
        </>
      )}
      <div className="sim-screen" style={{ width: w, height: h, borderRadius: device.radius || 0 }}>
        {children}
      </div>
    </div>
  )
}

function DeviceScreen({ device, landscape, tree, ctx, status, message }: { device: DeviceSpec; landscape: boolean; tree?: PreviewNode; ctx: RenderCtx; status: string; message?: string }): JSX.Element {
  const presentations = useMemo(() => collectPresentations(tree), [tree])
  const ignoresTop = !!findDeep(tree, 'ignoresSafeArea')
  const statusHidden = !!findDeep(tree, 'statusBarHidden')?.a.h
  const top = landscape ? 0 : device.statusBarHeight
  const bottom = device.homeIndicator ? device.bottomInset : 0
  const time = useClock()
  return (
    <div className={`sw-root sw-scheme-${ctx.scheme}`} style={{ ['--sw-safe-top' as never]: `${top}px`, ['--sw-safe-bottom' as never]: `${bottom}px` }}>
      {!statusHidden && (
        <div className={`sim-statusbar ${device.notch === 'island' ? 'island' : device.notch === 'notch' ? 'notch' : 'plain'}`} style={{ height: top || 24 }}>
          <span className="sim-time">{time}</span>
          {device.notch === 'island' && <span className="sim-island" />}
          {device.notch === 'notch' && <span className="sim-notch" />}
          <span className="sim-indicators">
            <Symbol name="antenna.radiowaves.left.and.right" style={{ width: 14, height: 14 }} />
            <Symbol name="wifi" style={{ width: 15, height: 15 }} />
            <span className="sim-battery"><span /></span>
          </span>
        </div>
      )}
      <div className={`sw-app ${ignoresTop ? 'sw-ignores-safe' : ''}`}>
        {tree ? (
          <Node node={tree} ctx={ctx} />
        ) : (
          <div className="sim-placeholder">
            {status === 'building' || status === 'launching' ? (
              <>
                <div className="sw-spinner" />
                <div>{message ?? 'Preparing preview…'}</div>
              </>
            ) : status === 'crashed' ? (
              <>
                <Symbol name="exclamationmark.triangle" style={{ width: 36, height: 36, color: '#ff9f0a' }} />
                <div>{message ?? 'The preview crashed.'}</div>
                <div className="muted">See the console for the app's output.</div>
              </>
            ) : (
              <>
                <Symbol name="play.circle" style={{ width: 40, height: 40, opacity: 0.5 }} />
                <div>Preview paused</div>
                <div className="muted">Press Resume to build and run the app in the Simulator canvas.</div>
              </>
            )}
          </div>
        )}
      </div>
      {presentations.map((pres, i) => (
        <Presentation key={pres.id ?? i} node={pres} ctx={ctx} />
      ))}
      {device.homeIndicator && <div className="sim-home" />}
    </div>
  )
}

/**
 * The real iOS Simulator, streamed from the Mac. With a live WebDriverAgent session (`canTap`):
 * click = tap, drag = swipe, mouse wheel = scroll, and keys/paste are typed into the focused field.
 * Coordinates are mapped into the device's point space, which the Simulator reports itself.
 */
function MacScreen({ frame, state, message, width, height, canTap, points, simName }: { frame?: string; state: string; message: string; width: number; height: number; canTap: boolean; points?: { width: number; height: number }; simName?: string }): JSX.Element {
  const ref = useRef<HTMLImageElement>(null)
  const down = useRef<{ x: number; y: number; t: number } | null>(null)
  const wheel = useRef<{ dy: number; timer?: number }>({ dy: 0 })
  const [typing, setTyping] = useState(false)
  const live = state === 'running' && !!frame
  const pw = points?.width ?? width
  const ph = points?.height ?? height

  const toPoint = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = ref.current!.getBoundingClientRect() // already includes the canvas zoom
    return { x: ((e.clientX - r.left) / r.width) * pw, y: ((e.clientY - r.top) / r.height) * ph }
  }
  const onDown = (e: React.MouseEvent<HTMLImageElement>): void => {
    if (!canTap || !ref.current || e.button !== 0) return
    down.current = { ...toPoint(e), t: Date.now() }
    ref.current.focus()
  }
  const onUp = (e: React.MouseEvent<HTMLImageElement>): void => {
    const d = down.current
    down.current = null
    if (!d || !ref.current) return
    const p = toPoint(e)
    if (Math.hypot(p.x - d.x, p.y - d.y) < 8) window.xcode.mac.tap(d.x, d.y)
    else window.xcode.mac.swipe(d.x, d.y, p.x, p.y, Math.min(0.8, Math.max(0.1, (Date.now() - d.t) / 1000)))
  }
  // Wheel = scroll inside the Simulator. Needs a native non-passive listener: React's onWheel is passive,
  // so it can't stop the canvas pane from scrolling underneath at the same time.
  const live0 = state === 'running' && !!frame
  useEffect(() => {
    const el = ref.current
    if (!el || !canTap) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const at = { x: ((e.clientX - r.left) / r.width) * pw, y: ((e.clientY - r.top) / r.height) * ph }
      const w = wheel.current
      w.dy += e.deltaY * (pw / r.width)
      window.clearTimeout(w.timer)
      w.timer = window.setTimeout(() => {
        const d = w.dy // wheel down = content up = finger up
        w.dy = 0
        if (Math.abs(d) < 4) return
        // Keep the whole stroke inside the content area: a fast fling that starts beside the tab bar
        // or home indicator is ignored by iOS (observed), while the same stroke mid-screen scrolls.
        const half = Math.min(ph * 0.3, Math.max(24, Math.abs(d) / 2))
        const cy = Math.max(ph * 0.15 + half, Math.min(ph * 0.8 - half, at.y))
        const dir = d > 0 ? 1 : -1
        window.xcode.mac.swipe(at.x, cy + dir * half, at.x, cy - dir * half, 0.35)
      }, 90)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [canTap, live0, pw, ph])
  const onKey = (e: React.KeyboardEvent): void => {
    if (!canTap || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Tab') {
      e.preventDefault()
      window.xcode.mac.key(e.key === 'Enter' ? 'enter' : e.key === 'Tab' ? 'tab' : 'backspace')
    } else if ([...e.key].length === 1) {
      e.preventDefault()
      window.xcode.mac.text(e.key)
    }
  }
  // Ctrl+V while the screen has focus types the clipboard into the Simulator's focused field.
  useEffect(() => {
    if (!typing || !canTap) return
    const onPaste = (e: ClipboardEvent): void => {
      const t = e.clipboardData?.getData('text')
      if (t) {
        e.preventDefault()
        window.xcode.mac.text(t)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [typing, canTap])

  return (
    <div className="sim-mac" style={{ width, height }}>
      {live ? (
        <img
          ref={ref}
          src={`data:image/jpeg;base64,${frame}`}
          alt=""
          draggable={false}
          tabIndex={0}
          className={canTap ? 'tappable' : ''}
          onMouseDown={onDown}
          onMouseUp={onUp}
          onMouseLeave={() => (down.current = null)}
          onKeyDown={onKey}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
        />
      ) : (
        <div className="sim-placeholder sw-root sw-scheme-light" style={{ height }}>
          {state === 'syncing' || state === 'building' || state === 'installing' || state === 'running' ? (
            <>
              <div className="sw-spinner" />
              <div>{message}</div>
              {state === 'running' && <div className="muted">Waiting for the first frame…</div>}
            </>
          ) : state === 'failed' ? (
            <>
              <Symbol name="exclamationmark.triangle" style={{ width: 36, height: 36, color: '#ff9f0a' }} />
              <div>{message}</div>
              <div className="muted">See the console for xcodebuild output.</div>
            </>
          ) : (
            <>
              <Symbol name="play.circle" style={{ width: 40, height: 40, opacity: 0.5 }} />
              <div>{simName ?? 'iOS Simulator'}</div>
              <div className="muted">Press Run to build on your Mac and stream the Simulator here.</div>
            </>
          )}
        </div>
      )}
      {live && !canTap && <div className="sim-mac-hint">View only — Settings ▸ Mac ▸ Enable touch input</div>}
      {live && canTap && typing && <div className="sim-mac-hint">Keyboard → Simulator</div>}
    </div>
  )
}

function useClock(): string {
  const [t, setT] = useState(() => new Date())
  useEffect(() => {
    const h = setInterval(() => setT(new Date()), 30000)
    return () => clearInterval(h)
  }, [])
  return t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, '')
}
