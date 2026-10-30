import React from 'react'

type P = React.SVGProps<SVGSVGElement>
const base = (props: P): P => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  ...props
})

export const Play = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M7 4.5v15a1 1 0 0 0 1.52.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z" />
  </svg>
)
export const Stop = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </svg>
)
export const Hammer = (p: P) => (
  <svg {...base(p)}>
    <path d="m15 12-8.5 8.5a2.12 2.12 0 0 1-3-3L12 9" />
    <path d="M17.64 15 22 10.64" />
    <path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91" />
  </svg>
)
export const Folder = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.9a2 2 0 0 1 1.6.8l1 1.4a1 1 0 0 0 .8.4H18.5A2.5 2.5 0 0 1 21 9.1v8.4a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
  </svg>
)
export const FileSwift = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 15.5c.6-.3 1.3-.3 2 .1 1.3.7 2.6.6 3.6-.2 1.6-1.3 1.9-3.6.8-5.4.4 1.2.3 2.4-.3 3.2C11.9 13.7 10 12.3 8.5 10.3c.8.6 1.7 1.2 2.6 1.6-1.3-1.1-2.3-2.5-3-3.6 1.6 1.4 3.1 2.3 4.6 2.9C11.7 9.8 10.5 8.5 9.4 7.2c2.3 1.9 4.4 3.3 6.3 4.1.3-1 .1-2.1-.4-3 1.7 2 2.3 5 .8 7.3-1.3 1.9-3.6 2.4-5.6 1.4-.9-.4-1.9-.3-2.7.1z" />
  </svg>
)
export const FileGeneric = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
)
export const Package = (p: P) => (
  <svg {...base(p)}>
    <path d="m7.5 4.27 9 5.15" />
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </svg>
)
export const Chevron = (p: P) => (
  <svg {...base(p)} strokeWidth={2.5}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)
export const ChevronDown = (p: P) => (
  <svg {...base(p)} strokeWidth={2.5}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)
export const Close = (p: P) => (
  <svg {...base(p)} strokeWidth={2.5}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)
export const Search = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
)
export const Warning = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M12 2.5 1.5 20.5h21zM11 9h2v6h-2zm0 7h2v2h-2z" />
  </svg>
)
export const ErrorIcon = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M7.6 2h8.8L22 7.6v8.8L16.4 22H7.6L2 16.4V7.6zM11 7v6h2V7zm0 8v2h2v-2z" />
  </svg>
)
export const Info = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 8h2v7h-2zm0-4h2v2h-2z" />
  </svg>
)
/** The GitHub mark (Octicons "mark-github", 16px grid). */
export const GitHub = (p: P) => (
  <svg {...base({ viewBox: '0 0 16 16', ...p })} fill="currentColor" stroke="none">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
)
export const Copy = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)
export const Check = (p: P) => (
  <svg {...base(p)} strokeWidth={3}>
    <path d="m5 12 5 5L20 7" />
  </svg>
)
export const Sidebar = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </svg>
)
export const SidebarRight = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M15 4v16" />
  </svg>
)
export const PanelBottom = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 14h18" />
  </svg>
)
export const Branch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="8" r="2.5" />
    <path d="M6 8.5v7M18 10.5c0 3-3 4-6 4H9" />
  </svg>
)
export const Symbols = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <circle cx="17.5" cy="6.5" r="3.5" />
    <path d="M3 21l3.5-7 3.5 7z" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
)
export const Flask = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3" />
    <path d="M7 15h10" />
  </svg>
)
export const Bug = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 2l1.9 1.9M16 2l-1.9 1.9" />
    <rect x="7" y="6" width="10" height="14" rx="5" />
    <path d="M3 13h4M17 13h4M12 20v-8M5 20l2.5-2M19 20l-2.5-2M5 7l2.5 2M19 7l-2.5 2" />
  </svg>
)
export const Breakpoint = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M4 6h11.5l4.5 6-4.5 6H4z" />
  </svg>
)
export const Report = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
  </svg>
)
export const Doc = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M8 13h8M8 17h5" />
  </svg>
)
export const Help = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1.2-1.5 2.5M12 17h.01" />
  </svg>
)
export const StepOver = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 14a8 8 0 0 1 14-5l2 2" />
    <path d="M20 5v6h-6" />
    <circle cx="12" cy="19" r="1.6" fill="currentColor" />
  </svg>
)
export const StepIn = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3v11M7 9l5 5 5-5" />
    <circle cx="12" cy="20" r="1.6" fill="currentColor" />
  </svg>
)
export const StepOut = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 15V4M7 9l5-5 5 5" />
    <circle cx="12" cy="20" r="1.6" fill="currentColor" />
  </svg>
)
export const Pause = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
)
export const Continue = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M5 4v16l11-8z" />
    <rect x="18" y="4" width="2.5" height="16" rx="1" />
  </svg>
)
export const Trash = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  </svg>
)
export const Plus = (p: P) => (
  <svg {...base(p)} strokeWidth={2.5}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const Terminal = (p: P) => (
  <svg {...base(p)}>
    <path d="m4 17 6-6-6-6M12 19h8" />
  </svg>
)
export const Laptop = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="11" rx="1.5" />
    <path d="M1.5 19h21" />
  </svg>
)
export const Gear = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
)
export const SwiftBird = (p: P) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M18.6 17.1c2.4-3.3 1.7-7.9-1.2-10.8.8 1.6 1 3.4.5 4.9C14.7 9.6 11.6 7.3 8.2 4.5c1.6 2.2 3.8 4.2 5.8 5.8-2.4-1-5-2.6-7.6-4.9 1.1 1.9 2.8 4.1 5 5.9-1.6-.7-3.1-1.6-4.7-2.8 2.4 3.3 5.5 5.7 9 6.6-1.7 1.2-3.8 1.3-6 .2-1.2-.7-2.5-.7-3.6-.2 1.4 1.3 3.2 2.5 5.4 2.8 3.4.6 5.9-.6 7.1-2.3.6-.8 2.1-.1 2.6 1.4.3-1.1 0-2.1-.5-3.1-.6-.6-1.3-.8-2.1-.8z" />
  </svg>
)
export const Library = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
)
export const Refresh = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
    <path d="M21 3v5h-5" />
  </svg>
)
export const ArrowLeft = (p: P) => (
  <svg {...base(p)} strokeWidth={2.5}>
    <path d="m15 6-6 6 6 6" />
  </svg>
)
export const ArrowRight = (p: P) => (
  <svg {...base(p)} strokeWidth={2.5}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)
