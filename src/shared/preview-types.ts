// Wire format emitted by the SwiftUI shim's PreviewHost (see swiftui-shim/Sources/SwiftUI/Core/Host.swift).

export interface PreviewModifier {
  k: string
  a: Record<string, unknown>
}

export interface PreviewNode {
  t: string
  p?: Record<string, unknown>
  id?: string
  m?: PreviewModifier[]
  c?: PreviewNode[]
}

export type PreviewMessage =
  | { type: 'ready'; protocol: number }
  | { type: 'tree'; root: PreviewNode }
  | { type: 'log'; text: string }

export interface PreviewEvent {
  id: string
  kind: string
  value?: unknown
}

export interface PreviewEnvironment {
  colorScheme: 'light' | 'dark'
  dynamicTypeSize: string
  width: number
  height: number
}

export type PreviewState = 'stopped' | 'building' | 'launching' | 'running' | 'crashed'

export interface PreviewStatus {
  state: PreviewState
  message?: string
}

export interface DeviceSpec {
  id: string
  name: string
  width: number
  height: number
  radius: number
  notch: 'island' | 'notch' | 'none'
  homeIndicator: boolean
  statusBarHeight: number
  bottomInset: number
  kind: 'phone' | 'tablet'
  /** Only used to size the frame for a Mac's Simulator of that name; not offered in the local canvas picker. */
  remoteOnly?: boolean
}

export const DEVICES: DeviceSpec[] = [
  { id: 'iphone16pro', name: 'iPhone 16 Pro', width: 402, height: 874, radius: 55, notch: 'island', homeIndicator: true, statusBarHeight: 59, bottomInset: 34, kind: 'phone' },
  { id: 'iphone16', name: 'iPhone 16', width: 393, height: 852, radius: 55, notch: 'island', homeIndicator: true, statusBarHeight: 59, bottomInset: 34, kind: 'phone' },
  { id: 'iphone16promax', name: 'iPhone 16 Pro Max', width: 440, height: 956, radius: 55, notch: 'island', homeIndicator: true, statusBarHeight: 59, bottomInset: 34, kind: 'phone' },
  { id: 'iphone13mini', name: 'iPhone 13 mini', width: 375, height: 812, radius: 44, notch: 'notch', homeIndicator: true, statusBarHeight: 50, bottomInset: 34, kind: 'phone' },
  { id: 'iphonese', name: 'iPhone SE (3rd generation)', width: 375, height: 667, radius: 0, notch: 'none', homeIndicator: false, statusBarHeight: 20, bottomInset: 0, kind: 'phone' },
  { id: 'ipadpro11', name: 'iPad Pro (11-inch) (4th generation)', width: 834, height: 1194, radius: 18, notch: 'none', homeIndicator: true, statusBarHeight: 24, bottomInset: 20, kind: 'tablet' },
  // Names below match `simctl` so a Mac's Simulator picks the right frame; they're hidden from the local picker.
  { id: 'iphone15pro', name: 'iPhone 15 Pro', width: 393, height: 852, radius: 55, notch: 'island', homeIndicator: true, statusBarHeight: 59, bottomInset: 34, kind: 'phone', remoteOnly: true },
  { id: 'iphone15', name: 'iPhone 15', width: 393, height: 852, radius: 55, notch: 'island', homeIndicator: true, statusBarHeight: 59, bottomInset: 34, kind: 'phone', remoteOnly: true },
  { id: 'iphone15promax', name: 'iPhone 15 Pro Max', width: 430, height: 932, radius: 55, notch: 'island', homeIndicator: true, statusBarHeight: 59, bottomInset: 34, kind: 'phone', remoteOnly: true },
  { id: 'iphone15plus', name: 'iPhone 15 Plus', width: 430, height: 932, radius: 55, notch: 'island', homeIndicator: true, statusBarHeight: 59, bottomInset: 34, kind: 'phone', remoteOnly: true },
  { id: 'ipad10', name: 'iPad (10th generation)', width: 820, height: 1180, radius: 18, notch: 'none', homeIndicator: true, statusBarHeight: 24, bottomInset: 20, kind: 'tablet', remoteOnly: true },
  { id: 'ipadair5', name: 'iPad Air (5th generation)', width: 820, height: 1180, radius: 18, notch: 'none', homeIndicator: true, statusBarHeight: 24, bottomInset: 20, kind: 'tablet', remoteOnly: true },
  { id: 'ipadmini6', name: 'iPad mini (6th generation)', width: 744, height: 1133, radius: 18, notch: 'none', homeIndicator: true, statusBarHeight: 24, bottomInset: 20, kind: 'tablet', remoteOnly: true },
  { id: 'ipadpro129', name: 'iPad Pro (12.9-inch) (6th generation)', width: 1024, height: 1366, radius: 18, notch: 'none', homeIndicator: true, statusBarHeight: 24, bottomInset: 20, kind: 'tablet', remoteOnly: true }
]
