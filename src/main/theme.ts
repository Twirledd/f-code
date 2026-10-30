// Window-control (minimise / maximise / close) colours, kept in step with the app's own theme.
// The renderer starts dark and tells the main process when the theme changes; the PC's light or dark
// mode is deliberately not used, because F-Code's theme is independent of it.
export type AppTheme = 'dark' | 'light'

const TITLE_BAR_HEIGHT = 38

export function titleBarOverlay(theme: AppTheme): { color: string; symbolColor: string; height: number } {
  return theme === 'light'
    ? { color: '#E9EFF9', symbolColor: '#142640', height: TITLE_BAR_HEIGHT }
    : { color: '#0C1428', symbolColor: '#E8EEF9', height: TITLE_BAR_HEIGHT }
}

export function windowBackground(theme: AppTheme): string {
  return theme === 'light' ? '#FFFFFF' : '#070B17'
}

export function isAppTheme(v: unknown): v is AppTheme {
  return v === 'dark' || v === 'light'
}
