import type { XCodeApi } from './index'

declare global {
  interface Window {
    xcode: XCodeApi
  }
}
export {}
