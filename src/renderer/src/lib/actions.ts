import { useStore, effectiveBreakpoints } from '@/state/store'

/** Product-menu style actions that need both store state and the main process. */
export const actions = {
  async run(): Promise<void> {
    const s = useStore.getState()
    if (!s.project || !s.scheme) return s.showToast('No scheme selected')
    await s.saveAll()
    s.clearConsole()
    s.set({ debugAreaVisible: true })
    const product = s.project.products.find((p) => p.name === s.scheme)
    if (product?.type === 'test') return actions.test()
    if (product?.type === 'library') return void window.xcode.build.build(product.name)
    if (s.destination === 'mac') {
      if (s.mac.state !== 'ready') return s.set({ sheet: 'settings' })
      if (!s.simUdid) return s.showToast('Choose a Simulator in the destination menu')
      s.set({ canvasVisible: true, macFrame: undefined })
      try {
        await window.xcode.mac.run(product?.name ?? s.scheme, s.simUdid)
      } catch (e) {
        s.showToast((e as Error).message)
      }
      return
    }
    if (product?.isApp) {
      s.set({ canvasVisible: true })
      await window.xcode.preview.start(product.name)
      return
    }
    await window.xcode.build.run(s.scheme)
  },
  async debug(): Promise<void> {
    const s = useStore.getState()
    if (!s.project || !s.scheme) return s.showToast('No scheme selected')
    const product = s.project.products.find((p) => p.name === s.scheme)
    if (product?.type !== 'executable') return s.showToast('Only executable targets can be debugged')
    await s.saveAll()
    s.clearConsole()
    s.set({ debugAreaVisible: true, navigator: 'debug' })
    try {
      await window.xcode.debug.start(s.scheme, effectiveBreakpoints(s.breakpoints, s.breakpointsEnabled))
    } catch (e) {
      s.showToast((e as Error).message)
    }
  },
  async build(): Promise<void> {
    const s = useStore.getState()
    if (!s.project) return
    await s.saveAll()
    s.set({ debugAreaVisible: true })
    if (s.destination === 'mac') {
      if (s.mac.state !== 'ready') return s.set({ sheet: 'settings' })
      if (!s.simUdid || !s.scheme) return s.showToast('Choose a scheme and a Simulator first')
      s.clearConsole()
      try {
        await window.xcode.mac.build(s.scheme, s.simUdid)
      } catch (e) {
        s.showToast((e as Error).message)
      }
      return
    }
    await window.xcode.build.build(s.scheme)
  },
  async test(): Promise<void> {
    const s = useStore.getState()
    if (!s.project) return
    await s.saveAll()
    s.clearConsole()
    s.set({ debugAreaVisible: true, tests: [] })
    // With a Mac destination tests run on the Mac under Xcode, never on the local Windows toolchain
    // (Apple-only modules such as CoreFoundation do not exist there).
    if (s.destination === 'mac') {
      if (s.mac.state !== 'ready') return s.set({ sheet: 'settings' })
      if (!s.simUdid) return s.showToast('Choose a Simulator in the destination menu')
      const scheme = s.project.products.find((p) => p.type !== 'test')?.name ?? s.scheme
      if (!scheme) return s.showToast('No scheme to test')
      try {
        await window.xcode.mac.test(scheme, s.simUdid)
      } catch (e) {
        s.showToast((e as Error).message)
      }
      return
    }
    await window.xcode.build.test()
  },
  async clean(): Promise<void> {
    const s = useStore.getState()
    if (!s.project) return
    s.set({ debugAreaVisible: true })
    await window.xcode.build.clean()
  },
  async stop(): Promise<void> {
    await window.xcode.build.stop()
  },
  /** Load saved Mac connection, connect, and fetch simulators. Called once at startup and after Settings changes. */
  async refreshMac(): Promise<void> {
    const s = useStore.getState()
    const cfg = await window.xcode.mac.config()
    s.set({ macConn: cfg.connection, macPublicKey: cfg.publicKey, mac: cfg.status, simUdid: cfg.simulatorUdid ?? s.simUdid })
    if (!cfg.connection) return
    const status = await window.xcode.mac.connect()
    useStore.getState().set({ mac: status })
    if (status.state === 'ready') {
      const sims = await window.xcode.mac.simulators()
      const st = useStore.getState()
      // Prefer the Mac's always-on simulator when it is running: attaching to it is the whole point.
      const always = status.persistent?.running ? status.persistent.udid : undefined
      const udid = always && sims.some((d) => d.udid === always) ? always : sims.some((d) => d.udid === st.simUdid) ? st.simUdid : sims[0]?.udid
      st.set({ simulators: sims, simUdid: udid })
    }
  },
  /** Rebuild + relaunch the preview for the current App scheme (Xcode's "Resume"). */
  async resumePreview(): Promise<void> {
    const s = useStore.getState()
    if (s.destination === 'mac') return actions.run()
    const product = s.project?.products.find((p) => p.name === s.scheme && p.isApp) ?? s.project?.products.find((p) => p.isApp)
    if (!product) return s.showToast('No SwiftUI App target in this package')
    await s.saveAll()
    s.set({ canvasVisible: true, scheme: product.name })
    await window.xcode.preview.start(product.name)
  }
}
