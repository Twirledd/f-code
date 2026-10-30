import React, { useEffect, useRef, useState } from 'react'
import type { PreviewModifier, PreviewNode } from '@shared/preview-types'
import { Symbol } from './symbols'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RenderCtx {
  send: (id: string, kind: string, value?: unknown) => void
  scheme: 'light' | 'dark'
  openURL: (url: string) => void
  safeTop: number
  safeBottom: number
  typeScale: number
}

type Props = { node: PreviewNode; ctx: RenderCtx }

// ---------------------------------------------------------------------------
// Helpers for props/modifiers
// ---------------------------------------------------------------------------

const p = (node: PreviewNode, key: string): any => node.p?.[key]
export const mods = (node: PreviewNode): PreviewModifier[] => node.m ?? []
export const findMod = (node: PreviewNode, kind: string): PreviewModifier | undefined => mods(node).find((m) => m.k === kind)

/** Modifiers consumed by ancestors rather than applied as wrappers. */
const CONSUMED = new Set(['navTitle', 'navTitleMode', 'navBarHidden', 'navBackHidden', 'tabItem', 'tag', 'toolbar', 'toolbarVisibility', 'searchable', 'present', 'listRowBackground', 'listRowInsets', 'listRowSeparator', 'listStyle', 'ignoresSafeArea', 'badge', 'detents', 'statusBarHidden', 'noop', 'animation', 'gesture', 'contextMenu'])

/** Walk down through containers to find a modifier declared on the page's content (nav titles, toolbars…). */
export function findDeep(node: PreviewNode | undefined, kind: string, depth = 0): PreviewModifier | undefined {
  if (!node || depth > 12) return undefined
  const m = findMod(node, kind)
  if (m) return m
  if (node.t === 'navstack' || node.t === 'tabview' || node.t === 'page') return undefined
  for (const c of node.c ?? []) {
    const f = findDeep(c, kind, depth + 1)
    if (f) return f
  }
  return undefined
}
export function findDeepAll(node: PreviewNode | undefined, kind: string, out: PreviewModifier[] = [], depth = 0): PreviewModifier[] {
  if (!node || depth > 12) return out
  for (const m of mods(node)) if (m.k === kind) out.push(m)
  if (node.t === 'navstack' || node.t === 'tabview' || node.t === 'page') return out
  for (const c of node.c ?? []) findDeepAll(c, kind, out, depth + 1)
  return out
}

/** Collect every presentation (sheet/alert/…) anywhere in the tree, in document order. */
export function collectPresentations(node: PreviewNode | undefined, out: PreviewNode[] = []): PreviewNode[] {
  if (!node) return out
  for (const m of mods(node)) {
    if (m.k === 'present' && m.a.node) {
      const overlay = m.a.node as PreviewNode
      out.push(overlay)
      for (const c of overlay.c ?? []) collectPresentations(c, out)
    }
    if ((m.k === 'overlay' || m.k === 'backgroundView' || m.k === 'tabItem' || m.k === 'toolbar') && m.a.node) collectPresentations(m.a.node as PreviewNode, out)
  }
  for (const c of node.c ?? []) collectPresentations(c, out)
  return out
}

// ---------------------------------------------------------------------------
// Colors, fonts, styles
// ---------------------------------------------------------------------------

const SYSTEM_COLORS: Record<string, [string, string]> = {
  red: ['#ff3b30', '#ff453a'], orange: ['#ff9500', '#ff9f0a'], yellow: ['#ffcc00', '#ffd60a'], green: ['#34c759', '#30d158'],
  mint: ['#00c7be', '#63e6e2'], teal: ['#30b0c7', '#40c8e0'], cyan: ['#32ade6', '#64d2ff'], blue: ['#007aff', '#0a84ff'],
  indigo: ['#5856d6', '#5e5ce6'], purple: ['#af52de', '#bf5af2'], pink: ['#ff2d55', '#ff375f'], brown: ['#a2845e', '#ac8e68'],
  gray: ['#8e8e93', '#8e8e93'], black: ['#000000', '#000000'], white: ['#ffffff', '#ffffff'], clear: ['transparent', 'transparent'],
  primary: ['#000000', '#ffffff'], secondary: ['rgba(60,60,67,0.6)', 'rgba(235,235,245,0.6)'], accent: ['var(--sw-tint)', 'var(--sw-tint)']
}

export function colorCSS(c: any, scheme: 'light' | 'dark'): string {
  if (!c) return 'inherit'
  const a = typeof c.a === 'number' ? c.a : 1
  if (c.sys) {
    const base = SYSTEM_COLORS[c.sys]?.[scheme === 'dark' ? 1 : 0] ?? '#888'
    if (a >= 1 || base.startsWith('var') || base.startsWith('rgba') || base === 'transparent') return a < 1 && base.startsWith('#') ? hexA(base, a) : base
    return hexA(base, a)
  }
  if (typeof c.r === 'number') return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`
  if (c.asset) return 'var(--sw-tint)'
  return 'inherit'
}
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export function styleCSS(s: any, scheme: 'light' | 'dark'): string {
  if (!s) return 'transparent'
  if (s.color) return colorCSS(s.color, scheme)
  if (s.linear) {
    const stops = (s.linear.stops as any[]).map((st) => `${colorCSS(st.c, scheme)} ${st.at * 100}%`).join(', ')
    const dx = s.linear.to.x - s.linear.from.x
    const dy = s.linear.to.y - s.linear.from.y
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI
    return `linear-gradient(${angle}deg, ${stops})`
  }
  if (s.radial) {
    const stops = (s.radial.stops as any[]).map((st) => `${colorCSS(st.c, scheme)} ${st.at * 100}%`).join(', ')
    return `radial-gradient(circle at ${s.radial.center.x * 100}% ${s.radial.center.y * 100}%, ${stops})`
  }
  if (s.material) return scheme === 'dark' ? 'rgba(40,40,44,0.72)' : 'rgba(250,250,250,0.72)'
  if (s.hier) {
    const levels = scheme === 'dark'
      ? ['#ffffff', 'rgba(235,235,245,0.6)', 'rgba(235,235,245,0.3)', 'rgba(235,235,245,0.18)']
      : ['#000000', 'rgba(60,60,67,0.6)', 'rgba(60,60,67,0.3)', 'rgba(60,60,67,0.18)']
    return s.hier === 1 ? 'currentColor' : levels[Math.min(s.hier, 4) - 1]
  }
  if (s.background) return 'var(--sw-bg)'
  return 'transparent'
}

const TEXT_STYLES: Record<string, { size: number; weight: number; lh: number }> = {
  largeTitle: { size: 34, weight: 400, lh: 41 }, title: { size: 28, weight: 400, lh: 34 }, title2: { size: 22, weight: 400, lh: 28 },
  title3: { size: 20, weight: 400, lh: 25 }, headline: { size: 17, weight: 600, lh: 22 }, body: { size: 17, weight: 400, lh: 22 },
  callout: { size: 16, weight: 400, lh: 21 }, subheadline: { size: 15, weight: 400, lh: 20 }, footnote: { size: 13, weight: 400, lh: 18 },
  caption: { size: 12, weight: 400, lh: 16 }, caption2: { size: 11, weight: 400, lh: 13 }
}
const WEIGHTS: Record<string, number> = { ultraLight: 100, thin: 200, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, heavy: 800, black: 900 }

export function fontCSS(f: any, ctx: RenderCtx): React.CSSProperties {
  if (!f) return {}
  const css: React.CSSProperties = {}
  if (f.style && TEXT_STYLES[f.style]) {
    const t = TEXT_STYLES[f.style]
    css.fontSize = t.size * ctx.typeScale
    css.fontWeight = t.weight
    css.lineHeight = `${t.lh * ctx.typeScale}px`
  }
  if (typeof f.size === 'number') {
    css.fontSize = f.size * ctx.typeScale
    css.lineHeight = `${Math.round(f.size * 1.25 * ctx.typeScale)}px`
  }
  if (f.weight) css.fontWeight = WEIGHTS[f.weight] ?? 400
  if (f.italic) css.fontStyle = 'italic'
  if (f.design === 'monospaced') css.fontFamily = 'var(--sw-font-mono)'
  if (f.design === 'rounded') css.fontFamily = 'var(--sw-font-rounded)'
  if (f.design === 'serif') css.fontFamily = 'var(--sw-font-serif)'
  if (f.custom) css.fontFamily = `"${f.custom}", var(--sw-font)`
  return css
}

function shapeCSS(shape: any): React.CSSProperties {
  if (!shape) return {}
  switch (shape.kind) {
    case 'circle':
    case 'ellipse':
      return { borderRadius: '50%' }
    case 'capsule':
      return { borderRadius: 9999 }
    case 'rounded':
      return { borderRadius: shape.r }
    case 'uneven':
      return { borderRadius: `${shape.tl}px ${shape.tr}px ${shape.br}px ${shape.bl}px` }
    default:
      return {}
  }
}

const alignH: Record<string, string> = { leading: 'flex-start', center: 'center', trailing: 'flex-end' }
const alignV: Record<string, string> = { top: 'flex-start', center: 'center', bottom: 'flex-end', firstTextBaseline: 'baseline', lastTextBaseline: 'baseline' }

// ---------------------------------------------------------------------------
// Modifier wrapping
// ---------------------------------------------------------------------------

function applyModifiers(el: React.ReactNode, node: PreviewNode, ctx: RenderCtx): React.ReactNode {
  let out = el
  for (const m of mods(node)) {
    if (CONSUMED.has(m.k)) continue
    out = wrap(out, m, node, ctx)
  }
  // Gesture handlers: attach a click to the outermost element.
  const gestures = mods(node).filter((m) => m.k === 'gesture')
  if (gestures.length && node.id) {
    const id = node.id
    out = (
      <div
        className="sw-gesture"
        onClick={(e) => {
          e.stopPropagation()
          if (gestures.some((g) => g.a.kind === 'tap')) ctx.send(id, 'tap')
        }}
        onContextMenu={(e) => {
          if (gestures.some((g) => g.a.kind === 'longpress')) {
            e.preventDefault()
            ctx.send(id, 'longpress')
          }
        }}
      >
        {out}
      </div>
    )
  }
  return out
}

function wrap(el: React.ReactNode, m: PreviewModifier, node: PreviewNode, ctx: RenderCtx): React.ReactNode {
  const a = m.a
  switch (m.k) {
    case 'padding': {
      const len = typeof a.length === 'number' ? a.length : 16
      const ins = a.insets as any
      const e = (a.edges as any) ?? { t: true, l: true, b: true, r: true }
      const style: React.CSSProperties = ins
        ? { padding: `${ins.t}px ${ins.r}px ${ins.b}px ${ins.l}px` }
        : { paddingTop: e.t ? len : 0, paddingLeft: e.l ? len : 0, paddingBottom: e.b ? len : 0, paddingRight: e.r ? len : 0 }
      return <div className="sw-pad sw-box" style={style}>{el}</div>
    }
    case 'frame': {
      const style: React.CSSProperties = { display: 'flex', justifyContent: alignH[(a.align as any)?.h ?? 'center'], alignItems: alignV[(a.align as any)?.v ?? 'center'] }
      if (typeof a.w === 'number') { style.width = a.w; style.flexShrink = 0 }
      if (typeof a.h === 'number') { style.height = a.h; style.flexShrink = 0 }
      return <div className="sw-frame sw-box" style={style}>{el}</div>
    }
    case 'flexframe': {
      const style: React.CSSProperties = { display: 'flex', justifyContent: alignH[(a.align as any)?.h ?? 'center'], alignItems: alignV[(a.align as any)?.v ?? 'center'] }
      let cls = 'sw-flexframe sw-box'
      if (a.maxW === 'inf') { style.width = '100%'; cls += ' sw-fill-w' }
      else if (typeof a.maxW === 'number') style.maxWidth = a.maxW
      if (a.maxH === 'inf') { style.height = '100%'; cls += ' sw-fill-h' }
      else if (typeof a.maxH === 'number') style.maxHeight = a.maxH
      if (typeof a.minW === 'number') style.minWidth = a.minW
      if (typeof a.minH === 'number') style.minHeight = a.minH
      if (typeof a.idealW === 'number') style.width = a.idealW
      if (typeof a.idealH === 'number') style.height = a.idealH
      return <div className={cls} style={style}>{el}</div>
    }
    case 'offset':
      return <div className="sw-box" style={{ transform: `translate(${a.x}px, ${a.y}px)` }}>{el}</div>
    case 'position':
      return <div className="sw-box" style={{ position: 'absolute', left: a.x as number, top: a.y as number, transform: 'translate(-50%,-50%)' }}>{el}</div>
    case 'aspect': {
      const style: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center' }
      if (typeof a.ratio === 'number') style.aspectRatio = String(a.ratio)
      return <div className={`sw-aspect sw-box sw-aspect-${a.mode}`} style={style}>{el}</div>
    }
    case 'zIndex':
      return <div className="sw-box" style={{ position: 'relative', zIndex: a.z as number }}>{el}</div>
    case 'background': {
      const style: React.CSSProperties = { background: styleCSS(a.style, ctx.scheme), ...shapeCSS(a.shape) }
      if ((a.style as any)?.material) style.backdropFilter = 'blur(20px)'
      return <div className="sw-bg sw-box" style={style}>{el}</div>
    }
    case 'backgroundView':
      return (
        <div className="sw-overlay-host sw-box">
          <div className="sw-overlay-layer" style={overlayAlign(a.align)}>
            <Node node={a.node as PreviewNode} ctx={ctx} />
          </div>
          <div className="sw-overlay-content">{el}</div>
        </div>
      )
    case 'overlay':
      return (
        <div className="sw-overlay-host sw-box">
          <div className="sw-overlay-content">{el}</div>
          <div className="sw-overlay-layer sw-overlay-top" style={overlayAlign(a.align)}>
            <Node node={a.node as PreviewNode} ctx={ctx} />
          </div>
        </div>
      )
    case 'overlayFill':
      return (
        <div className="sw-overlay-host sw-box">
          <div className="sw-overlay-content">{el}</div>
          <div className="sw-overlay-layer" style={{ background: styleCSS(a.style, ctx.scheme), ...shapeCSS(a.shape) }} />
        </div>
      )
    case 'border':
      return <div className="sw-box" style={{ outline: `${a.width}px solid ${styleCSS(a.style, ctx.scheme)}`, outlineOffset: -(a.width as number) }}>{el}</div>
    case 'clip':
      return <div className="sw-clip sw-box" style={{ overflow: 'hidden', ...shapeCSS(a.shape) }}>{el}</div>
    case 'mask':
      return <div className="sw-box">{el}</div>
    case 'shadow':
      return <div className="sw-box" style={{ filter: `drop-shadow(${a.x}px ${a.y}px ${a.radius}px ${colorCSS(a.color, ctx.scheme)})` }}>{el}</div>
    case 'opacity':
      return <div className="sw-box" style={{ opacity: a.o as number }}>{el}</div>
    case 'hidden':
      return <div className="sw-box" style={{ visibility: 'hidden' }}>{el}</div>
    case 'disabled':
      return a.d ? <div className="sw-box sw-disabled">{el}</div> : el
    case 'blur':
      return <div className="sw-box" style={{ filter: `blur(${a.r}px)` }}>{el}</div>
    case 'brightness':
      return <div className="sw-box" style={{ filter: `brightness(${1 + (a.b as number)})` }}>{el}</div>
    case 'contrast':
      return <div className="sw-box" style={{ filter: `contrast(${a.c})` }}>{el}</div>
    case 'saturation':
      return <div className="sw-box" style={{ filter: `saturate(${a.s})` }}>{el}</div>
    case 'grayscale':
      return <div className="sw-box" style={{ filter: `grayscale(${a.g})` }}>{el}</div>
    case 'invert':
      return <div className="sw-box" style={{ filter: 'invert(1)' }}>{el}</div>
    case 'hueRotate':
      return <div className="sw-box" style={{ filter: `hue-rotate(${a.deg}deg)` }}>{el}</div>
    case 'rotate':
      return <div className="sw-box" style={{ transform: `rotate(${a.deg}deg)`, transformOrigin: `${(a.anchor as any).x * 100}% ${(a.anchor as any).y * 100}%` }}>{el}</div>
    case 'rotate3d':
      return <div className="sw-box" style={{ transform: `rotate3d(${a.x},${a.y},${a.z},${a.deg}deg)` }}>{el}</div>
    case 'scale':
      return <div className="sw-box" style={{ transform: `scale(${a.x},${a.y})`, transformOrigin: `${(a.anchor as any).x * 100}% ${(a.anchor as any).y * 100}%` }}>{el}</div>
    case 'font':
      return <div className="sw-box sw-font" style={fontCSS(a.font, ctx)}>{el}</div>
    case 'fontWeight':
      return <div className="sw-box" style={{ fontWeight: a.weight ? WEIGHTS[a.weight as string] : undefined }}>{el}</div>
    case 'fontDesign':
      return <div className="sw-box" style={{ fontFamily: a.design === 'monospaced' ? 'var(--sw-font-mono)' : a.design === 'rounded' ? 'var(--sw-font-rounded)' : a.design === 'serif' ? 'var(--sw-font-serif)' : undefined }}>{el}</div>
    case 'italic':
      return <div className="sw-box" style={{ fontStyle: a.on ? 'italic' : 'normal' }}>{el}</div>
    case 'underline':
      return <div className="sw-box" style={{ textDecoration: a.on ? 'underline' : 'none' }}>{el}</div>
    case 'strike':
      return <div className="sw-box" style={{ textDecoration: a.on ? 'line-through' : 'none' }}>{el}</div>
    case 'foreground': {
      const css = styleCSS(a.style, ctx.scheme)
      const isGradient = css.includes('gradient')
      return (
        <div className={`sw-box sw-fg ${isGradient ? 'sw-fg-gradient' : ''}`} style={isGradient ? { backgroundImage: css } : { color: css === 'currentColor' ? undefined : css }}>
          {el}
        </div>
      )
    }
    case 'tint':
      return <div className="sw-box" style={{ ['--sw-tint' as any]: a.style ? styleCSS(a.style, ctx.scheme) : undefined }}>{el}</div>
    case 'textAlign':
      return <div className="sw-box sw-textalign" style={{ textAlign: a.align === 'leading' ? 'left' : a.align === 'trailing' ? 'right' : 'center' }}>{el}</div>
    case 'lineLimit':
      return a.n ? <div className="sw-box sw-clamp" style={{ ['--sw-lines' as any]: a.n }}>{el}</div> : el
    case 'lineSpacing':
      return <div className="sw-box" style={{ ['--sw-line-spacing' as any]: `${a.s}px` }}>{el}</div>
    case 'textCase':
      return <div className="sw-box" style={{ textTransform: a.case === 'upper' ? 'uppercase' : a.case === 'lower' ? 'lowercase' : 'none' }}>{el}</div>
    case 'kerning':
      return <div className="sw-box" style={{ letterSpacing: a.k as number }}>{el}</div>
    case 'colorScheme':
      return a.s ? <div className={`sw-box sw-scheme-${a.s}`}>{el}</div> : el
    case 'redacted':
      return <div className="sw-box sw-redacted">{el}</div>
    case 'hitTesting':
      return <div className="sw-box" style={{ pointerEvents: a.on ? undefined : 'none' }}>{el}</div>
    case 'buttonStyle':
      return <div className="sw-box" data-bs={a.name as string}>{el}</div>
    case 'buttonBorderShape':
      return <div className="sw-box" data-bshape={a.shape as string}>{el}</div>
    case 'controlSize':
      return <div className="sw-box" data-csize={a.size as string}>{el}</div>
    case 'pickerStyle':
      return <div className="sw-box" data-ps={a.name as string}>{el}</div>
    case 'textFieldStyle':
      return <div className="sw-box" data-tfs={a.name as string}>{el}</div>
    case 'toggleStyle':
      return <div className="sw-box" data-ts={a.name as string}>{el}</div>
    case 'labelStyle':
      return <div className="sw-box" data-ls={a.name as string}>{el}</div>
    case 'progressStyle':
      return <div className="sw-box" data-pvs={a.name as string}>{el}</div>
    case 'tabViewStyle':
      return <div className="sw-box" data-tvs={a.name as string}>{el}</div>
    case 'labelsHidden':
      return <div className="sw-box sw-labels-hidden">{el}</div>
    case 'scrollContentBackground':
      return <div className="sw-box" data-scb={a.v as string}>{el}</div>
    case 'scrollIndicators':
      return <div className="sw-box" data-si={a.v as string}>{el}</div>
    case 'scrollDisabled':
      return a.d ? <div className="sw-box sw-scroll-disabled">{el}</div> : el
    case 'listRowSpacing':
      return <div className="sw-box" style={{ ['--sw-row-spacing' as any]: `${a.s ?? 0}px` }}>{el}</div>
    case 'fixedSize':
      return <div className="sw-box sw-fixed">{el}</div>
    case 'help':
      return <div className="sw-box" title={a.text as string}>{el}</div>
    case 'a11yLabel':
      return <div className="sw-box" aria-label={a.text as string}>{el}</div>
    case 'testID':
      return <div className="sw-box" data-testid={a.id as string}>{el}</div>
    case 'safeAreaInset':
      return (
        <div className="sw-box sw-safearea-inset" data-edge={a.edge as string}>
          <div className="sw-overlay-content">{el}</div>
          <div className="sw-inset-bar">
            <Node node={a.node as PreviewNode} ctx={ctx} />
          </div>
        </div>
      )
    default:
      return el
  }
}

function overlayAlign(align: any): React.CSSProperties {
  return { display: 'flex', justifyContent: alignH[align?.h ?? 'center'], alignItems: alignV[align?.v ?? 'center'] }
}

// ---------------------------------------------------------------------------
// Node renderer
// ---------------------------------------------------------------------------

export function Node({ node, ctx }: Props): JSX.Element | null {
  const el = renderType(node, ctx)
  if (el === null) return null
  return <>{applyModifiers(el, node, ctx)}</>
}

function children(node: PreviewNode, ctx: RenderCtx): JSX.Element[] {
  return (node.c ?? []).map((c, i) => <Node key={keyFor(c, i)} node={c} ctx={ctx} />)
}
function keyFor(c: PreviewNode, i: number): string {
  return (c.p?.rowID as string) ?? c.id ?? String(i)
}

function textRuns(node: PreviewNode, ctx: RenderCtx): JSX.Element[] {
  const runs = (p(node, 'runs') as any[]) ?? []
  return runs.map((r, i) => {
    const style: React.CSSProperties = { ...fontCSS(r.font, ctx) }
    if (r.color) style.color = colorCSS(r.color, ctx.scheme)
    if (r.bold) style.fontWeight = 700
    if (r.italic) style.fontStyle = 'italic'
    const deco = [r.underline ? 'underline' : '', r.strike ? 'line-through' : ''].filter(Boolean).join(' ')
    if (deco) style.textDecoration = deco
    if (r.mono) style.fontFamily = 'var(--sw-font-mono)'
    if (typeof r.kerning === 'number') style.letterSpacing = r.kerning
    return (
      <span key={i} style={style}>
        {r.s}
      </span>
    )
  })
}

export function plainText(node: PreviewNode | undefined): string {
  if (!node) return ''
  if (node.t === 'text') return ((p(node, 'runs') as any[]) ?? []).map((r) => r.s).join('')
  return (node.c ?? []).map(plainText).join(' ').trim()
}

function renderType(node: PreviewNode, ctx: RenderCtx): React.ReactNode {
  switch (node.t) {
    case 'empty':
      return null
    case 'group':
      return <>{children(node, ctx)}</>
    case 'text':
      return <span className="sw-text">{textRuns(node, ctx)}</span>
    case 'image': {
      const sym = p(node, 'symbol') as string | undefined
      if (sym) return <Symbol name={sym} className={`sw-symbol ${p(node, 'resizable') ? 'sw-resizable' : ''}`} />
      const asset = p(node, 'asset') as string | undefined
      return (
        <div className={`sw-asset ${p(node, 'resizable') ? 'sw-resizable' : ''}`} title={asset}>
          <Symbol name="photo" />
          <span>{asset}</span>
        </div>
      )
    }
    case 'vstack':
      return (
        <div className="sw-vstack" style={{ alignItems: alignH[p(node, 'align') ?? 'center'], gap: p(node, 'spacing') ?? 8 }}>
          {children(node, ctx)}
        </div>
      )
    case 'hstack':
      return (
        <div className="sw-hstack" style={{ alignItems: alignV[p(node, 'align') ?? 'center'], gap: p(node, 'spacing') ?? 8 }}>
          {children(node, ctx)}
        </div>
      )
    case 'zstack': {
      const al = p(node, 'align') ?? {}
      return (
        <div className="sw-zstack" style={{ justifyItems: alignH[al.h ?? 'center'], alignItems: alignV[al.v ?? 'center'] }}>
          {children(node, ctx).map((c, i) => (
            <div key={i} className="sw-zlayer">
              {c}
            </div>
          ))}
        </div>
      )
    }
    case 'vgrid': {
      const cols = (p(node, 'columns') as any[]) ?? []
      const template = cols
        .map((c) => (c.kind === 'fixed' ? `${c.w}px` : c.kind === 'adaptive' ? `repeat(auto-fill, minmax(${c.min}px, 1fr))` : `minmax(${c.min ?? 10}px, 1fr)`))
        .join(' ')
      return (
        <div className="sw-grid" style={{ gridTemplateColumns: template || '1fr', gap: p(node, 'spacing') ?? 8 }}>
          {children(node, ctx)}
        </div>
      )
    }
    case 'hgrid': {
      const rows = (p(node, 'rows') as any[]) ?? []
      return (
        <div className="sw-grid sw-hgrid" style={{ gridTemplateRows: rows.map(() => 'auto').join(' ') || 'auto', gap: p(node, 'spacing') ?? 8 }}>
          {children(node, ctx)}
        </div>
      )
    }
    case 'grid':
      return (
        <div className="sw-table" style={{ rowGap: p(node, 'vspacing') ?? 8, columnGap: p(node, 'hspacing') ?? 8 }}>
          {(node.c ?? []).map((row, i) => (
            <div key={i} className="sw-table-row">
              {row.t === 'gridrow' ? children(row, ctx) : <Node node={row} ctx={ctx} />}
            </div>
          ))}
        </div>
      )
    case 'gridrow':
      return <div className="sw-table-row">{children(node, ctx)}</div>
    case 'spacer':
      return <div className="sw-spacer" style={{ minWidth: p(node, 'min') ?? 0, minHeight: p(node, 'min') ?? 0 }} />
    case 'divider':
      return <div className="sw-divider" />
    case 'color':
      return <div className="sw-color" style={{ background: colorCSS(p(node, 'color'), ctx.scheme) }} />
    case 'fill':
      return <div className="sw-color" style={{ background: styleCSS(p(node, 'style'), ctx.scheme) }} />
    case 'shape': {
      const shape = p(node, 'shape')
      const fill = p(node, 'fill')
      const stroke = p(node, 'stroke')
      const style: React.CSSProperties = { ...shapeCSS(shape) }
      if (fill) style.background = styleCSS(fill, ctx.scheme)
      if (stroke) style.boxShadow = `inset 0 0 0 ${p(node, 'lineWidth') ?? 1}px ${styleCSS(stroke, ctx.scheme)}`
      return <div className={`sw-shape sw-shape-${shape?.kind ?? 'rect'}`} style={style} />
    }
    case 'scroll':
      return (
        <div className={`sw-scroll ${p(node, 'h') ? 'sw-scroll-h' : ''} ${p(node, 'v') ? 'sw-scroll-v' : ''}`}>
          <div className={p(node, 'h') && !p(node, 'v') ? 'sw-hstack' : 'sw-vstack'} style={{ alignItems: 'stretch', gap: 0 }}>
            {children(node, ctx)}
          </div>
        </div>
      )
    case 'geometry':
      return <GeometryNode node={node} ctx={ctx} />
    case 'list':
      return <ListNode node={node} ctx={ctx} />
    case 'section':
      return <SectionNode node={node} ctx={ctx} standalone />
    case 'button': {
      const id = node.id!
      const role = p(node, 'role') as string | undefined
      return (
        <button
          className={`sw-button ${role ? `sw-role-${role}` : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            ctx.send(id, 'tap')
          }}
        >
          {children(node, ctx)}
        </button>
      )
    }
    case 'label':
      return (
        <span className="sw-label">
          <span className="sw-label-icon">{node.c?.[0] && <Node node={node.c[0]} ctx={ctx} />}</span>
          <span className="sw-label-title">{node.c?.[1] && <Node node={node.c[1]} ctx={ctx} />}</span>
        </span>
      )
    case 'labeled':
      return (
        <div className="sw-labeled">
          <span className="sw-labeled-label">{node.c?.[0] && <Node node={node.c[0]} ctx={ctx} />}</span>
          <span className="sw-labeled-content">{node.c?.[1] && <Node node={node.c[1]} ctx={ctx} />}</span>
        </div>
      )
    case 'toggle': {
      const id = node.id!
      const on = !!p(node, 'on')
      return (
        <div className="sw-toggle-row">
          <span className="sw-toggle-label">{children(node, ctx)}</span>
          <button className={`sw-switch ${on ? 'on' : ''}`} onClick={() => ctx.send(id, 'toggle', !on)} aria-checked={on} role="switch">
            <span className="sw-knob" />
          </button>
        </div>
      )
    }
    case 'textfield':
      return <TextFieldNode node={node} ctx={ctx} />
    case 'texteditor':
      return <TextFieldNode node={node} ctx={ctx} editor />
    case 'slider': {
      const id = node.id!
      return (
        <input
          type="range"
          className="sw-slider"
          min={p(node, 'min')}
          max={p(node, 'max')}
          step={p(node, 'step') ?? 'any'}
          value={p(node, 'value')}
          onChange={(e) => ctx.send(id, 'value', Number(e.target.value))}
        />
      )
    }
    case 'stepper': {
      const id = node.id!
      return (
        <div className="sw-stepper-row">
          <span className="sw-stepper-label">{children(node, ctx)}</span>
          <span className="sw-stepper">
            <button onClick={() => ctx.send(id, 'dec')}>−</button>
            <button onClick={() => ctx.send(id, 'inc')}>+</button>
          </span>
        </div>
      )
    }
    case 'progress': {
      const v = p(node, 'value')
      const total = p(node, 'total') ?? 1
      return (
        <div className="sw-progress">
          {node.c?.length ? <div className="sw-progress-label">{children(node, ctx)}</div> : null}
          {typeof v === 'number' ? (
            <div className="sw-progress-bar">
              <div style={{ width: `${Math.max(0, Math.min(100, (v / total) * 100))}%` }} />
            </div>
          ) : (
            <div className="sw-spinner" />
          )}
        </div>
      )
    }
    case 'picker':
      return <PickerNode node={node} ctx={ctx} />
    case 'datepicker': {
      const id = node.id!
      const iso = p(node, 'iso') as string
      const d = new Date(iso)
      const showDate = p(node, 'date')
      const showTime = p(node, 'time')
      const type = showDate && showTime ? 'datetime-local' : showDate ? 'date' : 'time'
      const pad = (n: number): string => String(n).padStart(2, '0')
      const value = type === 'date' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : type === 'time' ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      return (
        <div className="sw-labeled">
          <span className="sw-labeled-label">{children(node, ctx)}</span>
          <input
            type={type}
            className="sw-datepicker"
            value={value}
            onChange={(e) => {
              const nd = type === 'time' ? new Date(`${d.toDateString()} ${e.target.value}`) : new Date(e.target.value)
              if (!isNaN(nd.getTime())) ctx.send(id, 'date', nd.toISOString().replace(/\.\d{3}Z$/, 'Z'))
            }}
          />
        </div>
      )
    }
    case 'colorpicker': {
      const id = node.id!
      const c = p(node, 'color')
      const hex = c && typeof c.r === 'number' ? '#' + [c.r, c.g, c.b].map((x: number) => Math.round(x * 255).toString(16).padStart(2, '0')).join('') : '#007aff'
      return (
        <div className="sw-labeled">
          <span className="sw-labeled-label">{children(node, ctx)}</span>
          <input
            type="color"
            className="sw-colorpicker"
            value={hex}
            onChange={(e) => {
              const n = parseInt(e.target.value.slice(1), 16)
              ctx.send(id, 'color', { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 })
            }}
          />
        </div>
      )
    }
    case 'link':
      return (
        <a className="sw-link" onClick={() => ctx.openURL(p(node, 'url'))}>
          {children(node, ctx)}
        </a>
      )
    case 'menu':
      return <MenuNode node={node} ctx={ctx} />
    case 'navstack':
      return <NavStackNode node={node} ctx={ctx} />
    case 'page':
      return <>{children(node, ctx)}</>
    case 'navlink': {
      const id = node.id!
      return (
        <div className="sw-navlink" onClick={(e) => { e.stopPropagation(); ctx.send(id, 'tap') }}>
          <span className="sw-navlink-label">{children(node, ctx)}</span>
          <Symbol name="chevron.right" className="sw-chevron" />
        </div>
      )
    }
    case 'tabview':
      return <TabViewNode node={node} ctx={ctx} />
    case 'groupbox':
      return (
        <div className="sw-groupbox">
          {node.c?.[0] && node.c[0].t !== 'empty' && <div className="sw-groupbox-label"><Node node={node.c[0]} ctx={ctx} /></div>}
          <div className="sw-vstack" style={{ alignItems: 'stretch', gap: 8 }}>{(node.c ?? []).slice(1).map((c, i) => <Node key={i} node={c} ctx={ctx} />)}</div>
        </div>
      )
    case 'disclosure': {
      const id = node.id!
      const open = !!p(node, 'expanded')
      return (
        <div className="sw-disclosure">
          <div className="sw-disclosure-head" onClick={() => ctx.send(id, 'toggle')}>
            <span className="sw-disclosure-label">{node.c?.[0] && <Node node={node.c[0]} ctx={ctx} />}</span>
            <Symbol name="chevron.right" className="sw-chevron" style={{ transform: open ? 'rotate(90deg)' : undefined }} />
          </div>
          {open && <div className="sw-disclosure-body">{(node.c ?? []).slice(1).map((c, i) => <Node key={i} node={c} ctx={ctx} />)}</div>}
        </div>
      )
    }
    case 'toolbarItem':
      return <>{children(node, ctx)}</>
    case 'sheet':
    case 'cover':
    case 'alert':
    case 'dialog':
    case 'popover':
      return null // rendered by DeviceScreen from collectPresentations()
    default:
      return (
        <div className="sw-unknown" title={node.t}>
          {node.t}
          {children(node, ctx)}
        </div>
      )
  }
}

// ---------------------------------------------------------------------------
// Composite node components
// ---------------------------------------------------------------------------

function GeometryNode({ node, ctx }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !node.id) return
    const id = node.id
    let last = ''
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const key = `${Math.round(r.width)}x${Math.round(r.height)}`
      if (key !== last) {
        last = key
        ctx.send(id, 'size', { w: Math.round(r.width), h: Math.round(r.height) })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [node.id, ctx])
  return (
    <div ref={ref} className="sw-geometry">
      {children(node, ctx)}
    </div>
  )
}

function TextFieldNode({ node, ctx, editor }: Props & { editor?: boolean }): JSX.Element {
  const id = node.id!
  const [value, setValue] = useState<string>(p(node, 'text') ?? '')
  const remote = p(node, 'text') ?? ''
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setValue(remote)
  }, [remote])
  const common = {
    value,
    placeholder: p(node, 'prompt') ?? '',
    onFocus: () => (focused.current = true),
    onBlur: () => (focused.current = false),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValue(e.target.value)
      ctx.send(id, 'text', e.target.value)
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !editor) ctx.send(id, 'submit')
    }
  }
  if (editor || p(node, 'multiline')) return <textarea className={`sw-textfield ${editor ? 'sw-texteditor' : ''}`} rows={editor ? 6 : 2} {...common} />
  return <input className="sw-textfield" type={p(node, 'secure') ? 'password' : 'text'} spellCheck={false} {...common} />
}

function PickerNode({ node, ctx }: Props): JSX.Element {
  const id = node.id!
  const labelIndex = p(node, 'labelIndex') as number
  const options = (node.c ?? []).slice(0, labelIndex)
  const label = node.c?.[labelIndex]
  const selected = p(node, 'selected') as number
  const [open, setOpen] = useState(false)
  return (
    <div className="sw-picker" data-count={options.length}>
      {label && label.t !== 'empty' && <span className="sw-picker-label"><Node node={label} ctx={ctx} /></span>}
      <div className="sw-segmented">
        {options.map((o, i) => (
          <button key={i} className={i === selected ? 'sel' : ''} onClick={() => ctx.send(id, 'select', i)}>
            <Node node={o} ctx={ctx} />
          </button>
        ))}
      </div>
      <div className="sw-picker-menu">
        <button className="sw-picker-current" onClick={() => setOpen(!open)}>
          {options[selected] ? <Node node={options[selected]} ctx={ctx} /> : <span className="sw-secondary">Select</span>}
          <Symbol name="chevron.up.chevron.down" className="sw-chevron" />
        </button>
        {open && (
          <div className="sw-menu-popup" onMouseLeave={() => setOpen(false)}>
            {options.map((o, i) => (
              <div key={i} className={`sw-menu-item ${i === selected ? 'sel' : ''}`} onClick={() => { setOpen(false); ctx.send(id, 'select', i) }}>
                {i === selected && <Symbol name="checkmark" className="sw-check" />}
                <Node node={o} ctx={ctx} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MenuNode({ node, ctx }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const label = node.c?.[0]
  const items = (node.c ?? []).slice(1)
  return (
    <div className="sw-menu">
      <button className="sw-button" onClick={() => setOpen(!open)}>{label && <Node node={label} ctx={ctx} />}</button>
      {open && (
        <div className="sw-menu-popup" onClick={() => setOpen(false)}>
          {items.map((it, i) => (
            <div key={i} className="sw-menu-item">
              <Node node={it} ctx={ctx} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SectionNode({ node, ctx, standalone }: Props & { standalone?: boolean }): JSX.Element {
  const header = p(node, 'hasHeader') ? node.c?.[0] : undefined
  const footer = p(node, 'hasFooter') ? node.c?.[1] : undefined
  const rows = (node.c ?? []).slice(2)
  return (
    <div className={`sw-section ${standalone ? 'sw-section-standalone' : ''}`}>
      {header && <div className="sw-section-header"><Node node={header} ctx={ctx} /></div>}
      <div className="sw-card">
        {rows.map((r, i) => (
          <Row key={keyFor(r, i)} node={r} ctx={ctx} last={i === rows.length - 1} />
        ))}
      </div>
      {footer && <div className="sw-section-footer"><Node node={footer} ctx={ctx} /></div>}
    </div>
  )
}

function Row({ node, ctx, last }: Props & { last: boolean }): JSX.Element {
  const bg = findMod(node, 'listRowBackground')
  const insets = findMod(node, 'listRowInsets')?.a.insets as any
  const sep = findMod(node, 'listRowSeparator')?.a.v
  const style: React.CSSProperties = {}
  if (insets) style.padding = `${insets.t}px ${insets.r}px ${insets.b}px ${insets.l}px`
  return (
    <div className={`sw-row ${last ? 'last' : ''} ${sep === 'hidden' ? 'nosep' : ''} sw-row-${node.t}`} style={style}>
      {bg && (
        <div className="sw-row-bg">
          <Node node={bg.a.node as PreviewNode} ctx={ctx} />
        </div>
      )}
      <div className="sw-row-content">
        <Node node={node} ctx={ctx} />
      </div>
    </div>
  )
}

function ListNode({ node, ctx }: Props): JSX.Element {
  const style = (findMod(node, 'listStyle')?.a.name as string) ?? (p(node, 'form') ? 'insetGrouped' : 'insetGrouped')
  // Group loose rows between sections into implicit sections.
  const groups: { section?: PreviewNode; rows: PreviewNode[] }[] = []
  for (const c of node.c ?? []) {
    if (c.t === 'section') groups.push({ section: c, rows: [] })
    else {
      const g = groups[groups.length - 1]
      if (g && !g.section) g.rows.push(c)
      else groups.push({ rows: [c] })
    }
  }
  const scb = findMod(node, 'scrollContentBackground')?.a.v
  return (
    <div className={`sw-list sw-list-${style} ${scb === 'hidden' ? 'sw-list-transparent' : ''}`}>
      <div className="sw-list-inner">
        {groups.map((g, i) =>
          g.section ? (
            <SectionNode key={i} node={g.section} ctx={ctx} />
          ) : (
            <div key={i} className="sw-section">
              <div className="sw-card">
                {g.rows.map((r, j) => (
                  <Row key={keyFor(r, j)} node={r} ctx={ctx} last={j === g.rows.length - 1} />
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}

function NavStackNode({ node, ctx }: Props): JSX.Element {
  const pages = node.c ?? []
  const page = pages[pages.length - 1]
  const prev = pages[pages.length - 2]
  const content = page?.c?.[0]
  const title = (findDeep(content, 'navTitle')?.a.title as string) ?? ''
  const mode = (findDeep(content, 'navTitleMode')?.a.mode as string) ?? (pages.length > 1 ? 'inline' : 'large')
  const hidden = !!findDeep(content, 'navBarHidden')?.a.h
  const backHidden = !!findDeep(content, 'navBackHidden')?.a.h
  const search = findDeep(content, 'searchable')
  const toolbars = findDeepAll(content, 'toolbar')
  const items: { placement: string; node: PreviewNode }[] = []
  for (const t of toolbars) {
    const tnode = t.a.node as PreviewNode
    const walk = (n: PreviewNode): void => {
      if (n.t === 'toolbarItem') items.push({ placement: (n.p?.placement as string) ?? 'automatic', node: n })
      else (n.c ?? []).forEach(walk)
    }
    walk(tnode)
  }
  const leading = items.filter((i) => /leading|navigation|cancellation/.test(i.placement))
  const trailing = items.filter((i) => !/leading|navigation|cancellation|bottomBar|principal/.test(i.placement))
  const principal = items.filter((i) => i.placement === 'principal')
  const bottom = items.filter((i) => i.placement === 'bottomBar')
  const prevTitle = (findDeep(prev?.c?.[0], 'navTitle')?.a.title as string) || 'Back'
  const searchId = search ? findSearchId(content) : undefined

  return (
    <div className={`sw-navstack sw-nav-${mode}`}>
      {!hidden && (
        <div className="sw-navbar">
          <div className="sw-navbar-row">
            <div className="sw-navbar-leading">
              {pages.length > 1 && !backHidden && (
                <button className="sw-back" onClick={() => ctx.send(node.id!, 'pop')}>
                  <Symbol name="chevron.left" className="sw-chevron" />
                  <span>{prevTitle}</span>
                </button>
              )}
              {leading.map((i, k) => <span key={k} className="sw-navitem"><Node node={i.node} ctx={ctx} /></span>)}
            </div>
            <div className="sw-navbar-title">
              {principal.length ? principal.map((i, k) => <Node key={k} node={i.node} ctx={ctx} />) : mode === 'inline' ? title : ''}
            </div>
            <div className="sw-navbar-trailing">
              {trailing.map((i, k) => <span key={k} className="sw-navitem"><Node node={i.node} ctx={ctx} /></span>)}
            </div>
          </div>
          {mode !== 'inline' && title && <div className="sw-large-title">{title}</div>}
          {search && (
            <div className="sw-searchbar">
              <Symbol name="magnifyingglass" className="sw-search-icon" />
              <input
                placeholder={(search.a.prompt as string) ?? 'Search'}
                defaultValue={(search.a.text as string) ?? ''}
                onChange={(e) => searchId && ctx.send(searchId, 'search', e.target.value)}
              />
            </div>
          )}
        </div>
      )}
      <div className="sw-page" key={page?.id ?? pages.length}>
        {content && <Node node={content} ctx={ctx} />}
      </div>
      {bottom.length > 0 && (
        <div className="sw-bottombar">
          {bottom.map((i, k) => <Node key={k} node={i.node} ctx={ctx} />)}
        </div>
      )}
    </div>
  )
}

function findSearchId(node: PreviewNode | undefined, depth = 0): string | undefined {
  if (!node || depth > 12) return undefined
  if (findMod(node, 'searchable')) return node.id
  for (const c of node.c ?? []) {
    const f = findSearchId(c, depth + 1)
    if (f) return f
  }
  return undefined
}

function TabViewNode({ node, ctx }: Props): JSX.Element {
  const tabs = node.c ?? []
  const selected = (p(node, 'selected') as number) ?? 0
  const style = findMod(node, 'tabViewStyle')?.a.name
  if (style === 'page') {
    return (
      <div className="sw-pagetabs">
        <div className="sw-pagetabs-content">{tabs[selected] && <Node node={tabs[selected]} ctx={ctx} />}</div>
        <div className="sw-pagedots">
          {tabs.map((_, i) => <span key={i} className={i === selected ? 'sel' : ''} onClick={() => ctx.send(node.id!, 'select', i)} />)}
        </div>
      </div>
    )
  }
  return (
    <div className="sw-tabview">
      <div className="sw-tab-content">{tabs[selected] && <Node key={selected} node={tabs[selected]} ctx={ctx} />}</div>
      <div className="sw-tabbar">
        {tabs.map((t, i) => {
          const item = findMod(t, 'tabItem')?.a.node as PreviewNode | undefined
          const badge = findMod(t, 'badge')?.a.text as string | undefined
          return (
            <button key={i} className={`sw-tab ${i === selected ? 'sel' : ''}`} onClick={() => ctx.send(node.id!, 'select', i)}>
              <span className="sw-tab-item">{item ? <Node node={item} ctx={ctx} /> : <span>Tab {i + 1}</span>}</span>
              {badge && <span className="sw-badge">{badge}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Presentations (sheets, alerts, dialogs)
// ---------------------------------------------------------------------------

export function Presentation({ node, ctx }: Props): JSX.Element {
  const id = node.id!
  const dismiss = (): void => ctx.send(id, 'dismiss')
  const title = p(node, 'title') as string | undefined
  if (node.t === 'alert' || node.t === 'dialog') {
    const kids = node.c ?? []
    const flat: PreviewNode[] = []
    const walk = (n: PreviewNode): void => {
      if (n.t === 'vstack' || n.t === 'group') (n.c ?? []).forEach(walk)
      else flat.push(n)
    }
    kids.forEach(walk)
    const messages = flat.filter((n) => n.t === 'text')
    const buttons = flat.filter((n) => n.t === 'button')
    const cancel = buttons.find((b) => b.p?.role === 'cancel')
    const others = buttons.filter((b) => b !== cancel)
    const list = others.length ? others : [{ t: 'button', id: '__ok', c: [{ t: 'text', p: { runs: [{ s: 'OK' }] } }] } as PreviewNode]
    const press = (b: PreviewNode): void => {
      if (b.id && b.id !== '__ok') ctx.send(b.id, 'tap')
      dismiss()
    }
    if (node.t === 'dialog') {
      return (
        <div className="sw-dim" onClick={dismiss}>
          <div className="sw-actionsheet" onClick={(e) => e.stopPropagation()}>
            <div className="sw-actionsheet-group">
              {title && <div className="sw-actionsheet-title">{title}</div>}
              {messages.map((m, i) => <div key={i} className="sw-actionsheet-msg"><Node node={m} ctx={ctx} /></div>)}
              {list.map((b, i) => (
                <button key={i} className={`sw-actionsheet-btn ${b.p?.role === 'destructive' ? 'destructive' : ''}`} onClick={() => press(b)}>
                  <Node node={b.c![0]} ctx={ctx} />
                </button>
              ))}
            </div>
            <div className="sw-actionsheet-group">
              <button className="sw-actionsheet-btn bold" onClick={() => (cancel ? press(cancel) : dismiss())}>
                {cancel ? <Node node={cancel.c![0]} ctx={ctx} /> : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )
    }
    const all = cancel ? [cancel, ...list] : list
    return (
      <div className="sw-dim sw-dim-center">
        <div className="sw-alert">
          <div className="sw-alert-body">
            {title && <div className="sw-alert-title">{title}</div>}
            {messages.map((m, i) => <div key={i} className="sw-alert-msg"><Node node={m} ctx={ctx} /></div>)}
          </div>
          <div className={`sw-alert-buttons ${all.length > 2 ? 'stacked' : ''}`}>
            {all.map((b, i) => (
              <button key={i} className={`${b.p?.role === 'destructive' ? 'destructive' : ''} ${b === cancel ? 'bold' : ''}`} onClick={() => press(b)}>
                <Node node={b.c![0]} ctx={ctx} />
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }
  if (node.t === 'cover') {
    return (
      <div className="sw-cover">
        {children(node, ctx)}
      </div>
    )
  }
  if (node.t === 'popover') {
    return (
      <div className="sw-dim" onClick={dismiss}>
        <div className="sw-popover" onClick={(e) => e.stopPropagation()}>{children(node, ctx)}</div>
      </div>
    )
  }
  const medium = findDeep(node.c?.[0], 'detents')?.a.medium
  return (
    <div className="sw-dim sw-dim-sheet" onClick={dismiss}>
      <div className={`sw-sheet ${medium ? 'medium' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="sw-grabber" />
        <div className="sw-sheet-content">{children(node, ctx)}</div>
      </div>
    </div>
  )
}
