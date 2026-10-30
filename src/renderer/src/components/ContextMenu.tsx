import React, { useEffect, useRef } from 'react'

export type MenuItem =
  | { separator: true }
  | { separator?: false; label: string; onClick: () => void | Promise<void>; disabled?: boolean }

export function ContextMenu({
  x,
  y,
  items,
  onClose
}: {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  const maxX = window.innerWidth - 200
  const maxY = window.innerHeight - items.length * 24 - 16
  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: Math.min(x, maxX),
        top: Math.min(y, maxY),
        minWidth: 180,
        background: 'var(--bg-toolbar)',
        border: '1px solid var(--border-strong)',
        borderRadius: 7,
        boxShadow: 'var(--shadow)',
        padding: 4,
        zIndex: 300,
        fontSize: 12.5
      }}
    >
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
        ) : (
          <div
            key={i}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              opacity: it.disabled ? 0.4 : 1,
              cursor: 'default'
            }}
            onMouseEnter={(e) => !it.disabled && (e.currentTarget.style.background = 'var(--bg-selected)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => {
              if (it.disabled) return
              onClose()
              void it.onClick()
            }}
          >
            {it.label}
          </div>
        )
      )}
    </div>
  )
}
