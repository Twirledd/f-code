// Launches the built app with Playwright's Electron driver, exercises the main
// screens, and writes screenshots to scripts/shots/. Run `npm run build` first.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = join(root, 'scripts', 'shots')
mkdirSync(shots, { recursive: true })

// Sample Swift package so the IDE has something to open.
const sample = join(root, 'scripts', 'SampleApp')
if (!existsSync(sample)) {
  mkdirSync(join(sample, 'Sources', 'SampleApp'), { recursive: true })
  mkdirSync(join(sample, 'Tests', 'SampleAppTests'), { recursive: true })
  writeFileSync(
    join(sample, 'Package.swift'),
    `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SampleApp",
    targets: [
        .executableTarget(name: "SampleApp"),
        .testTarget(name: "SampleAppTests", dependencies: ["SampleApp"]),
    ]
)
`
  )
  writeFileSync(
    join(sample, 'Sources', 'SampleApp', 'main.swift'),
    `import Foundation

struct Greeter {
    let name: String
    func greet() -> String { "Hello, \\(name)!" }
}

let g = Greeter(name: "Windows")
print(g.greet())
`
  )
  writeFileSync(
    join(sample, 'Tests', 'SampleAppTests', 'SampleAppTests.swift'),
    `import XCTest

final class SampleAppTests: XCTestCase {
    func testExample() { XCTAssertEqual(1 + 1, 2) }
}
`
  )
}

const userData = join(root, 'scripts', '.smoke-userdata')
rmSync(userData, { recursive: true, force: true })

const app = await electron.launch({
  args: [join(root, 'out', 'main', 'index.js'), `--user-data-dir=${userData}`],
  cwd: root,
  env: { ...process.env, NODE_ENV: 'production' }
})
app.on('console', (m) => console.log('[main]', m.text()))
const page = await app.firstWindow()
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[renderer:${m.type()}]`, m.text())
})
page.on('pageerror', (e) => console.log('[renderer:pageerror]', e.message))

await page.waitForSelector('.welcome', { timeout: 20000 })
await page.waitForTimeout(600)
await page.screenshot({ path: join(shots, '1-welcome.png') })
console.log('welcome ok')

// Open the sample project through the IPC bridge (bypasses the native folder dialog).
await page.evaluate((p) => window.xcode.project.open(p), sample)
await page.waitForSelector('.toolbar', { timeout: 20000 })
await page.waitForTimeout(500)
await page.screenshot({ path: join(shots, '2-ide-empty.png') })
console.log('project opened')

// Open main.swift via the project navigator.
await page.click('.row:has-text("main.swift")')
await page.waitForSelector('.monaco-editor .view-lines', { timeout: 20000 })
await page.waitForTimeout(800)
await page.screenshot({ path: join(shots, '3-editor.png') })
console.log('editor ok')

// Native menu accelerators don't fire under automation; drive commands through the app's dispatcher.
const cmd = (id) => page.evaluate((c) => window.__runCommand(c), id)

// Breakpoint on line 8 via the gutter click, then via the command on line 9.
const lineNumbers = await page.$$('.monaco-editor .line-numbers')
if (lineNumbers[7]) await lineNumbers[7].click()
await page.waitForTimeout(200)
await page.evaluate(() => window.__editor.setPosition({ lineNumber: 9, column: 1 }))
await cmd('debug.toggleBreakpoint')
await page.waitForTimeout(200)
await cmd('nav.breakpoints')
await page.waitForTimeout(300)
await page.screenshot({ path: join(shots, '4-breakpoints.png') })
const bpCount = await page.$$eval('.bp-row', (r) => r.length)
console.log('breakpoints:', bpCount)
const glyphInfo = await page.evaluate(() =>
  [...document.querySelectorAll('.bp-glyph')].map((el) => {
    const b = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return { cls: el.className, x: b.x, y: b.y, w: b.width, h: b.height, bg: cs.backgroundColor, display: cs.display, parent: el.parentElement?.className }
  })
)
console.log('glyphs:', JSON.stringify(glyphInfo))
if (glyphInfo.length !== 2) throw new Error(`expected 2 breakpoint glyphs, got ${glyphInfo.length}`)
const bpGroups = await page.$$eval('.nav-body .row', (r) => r.length)
if (bpGroups !== 1) throw new Error(`expected breakpoints grouped under 1 file, got ${bpGroups}`)
if (bpCount !== 2) throw new Error(`expected 2 breakpoints, got ${bpCount}`)

// Settings sheet.
await cmd('app.settings')
await page.waitForSelector('.sheet', { timeout: 5000 })
await page.waitForTimeout(400)
await page.screenshot({ path: join(shots, '5-settings.png') })
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// New Project sheet.
await cmd('project.new')
await page.waitForSelector('.templates', { timeout: 5000 })
await page.waitForTimeout(300)
await page.screenshot({ path: join(shots, '6-new-project.png') })
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// Open Quickly.
await cmd('nav.openQuickly')
await page.waitForSelector('.quick-open', { timeout: 5000 })
await page.keyboard.type('tests')
await page.waitForTimeout(300)
await page.screenshot({ path: join(shots, '6b-open-quickly.png') })
await page.keyboard.press('Enter')
await page.waitForSelector('.tab:has-text("SampleAppTests.swift")', { timeout: 5000 })
console.log('open quickly ok')

// Trigger a build so the console/activity viewer exercise the SwiftPM path.
await cmd('nav.issues')
await cmd('product.build')
await page.waitForFunction(() => !document.querySelector('.activity .progress'), null, { timeout: 180000 })
await page.waitForTimeout(400)
await page.screenshot({ path: join(shots, '7-build.png') })
const activity = await page.textContent('.activity .msg')
const consoleText = await page.textContent('.console-out')
console.log('activity:', activity)
console.log('console:', (consoleText ?? '').slice(0, 400).replace(/\n/g, ' | '))
if (!consoleText?.trim()) throw new Error('build produced no console output')

// ---------------------------------------------------------------------------
// Toolchain phase: only runs when swift.exe was detected.
// ---------------------------------------------------------------------------
const toolchain = await page.evaluate(() => window.xcode.toolchain.detect(true))
console.log('toolchain:', JSON.stringify({ found: toolchain.found, version: toolchain.swiftVersion, lsp: !!toolchain.lspPath, dap: !!toolchain.lldbDapPath }))
const hasMsvc = toolchain.found && !toolchain.problems.some((p) => /Build Tools/.test(p))
console.log('msvc:', hasMsvc)
const waitIdle = () => page.waitForFunction(() => !document.querySelector('.activity .progress'), null, { timeout: 600000 })
const consoleNow = async () => (await page.textContent('.console-out')) ?? ''

// LSP-only check when the toolchain is present but MSVC is not (nothing can link, but sourcekit-lsp may still work).
if (toolchain.found && !hasMsvc) {
  await page.click('.tab:has-text("main.swift")')
  const lspReady = await page
    .waitForFunction(() => document.body.dataset.lsp === 'running', null, { timeout: 60000 })
    .then(() => true)
    .catch(() => false)
  console.log('lsp running (no msvc):', lspReady)
  if (lspReady) {
    const main = join(sample, 'Sources', 'SampleApp', 'main.swift')
    await page.waitForTimeout(4000) // give sourcekit-lsp time to index the package
    const items = await page.evaluate(async (p) => (await window.xcode.lsp.completion(p, { line: 8, character: 8 })).map((i) => i.label).slice(0, 50), main)
    console.log('completion (no msvc):', items.slice(0, 8), 'total', items.length)
    const hover = await page.evaluate((p) => window.xcode.lsp.hover(p, { line: 2, character: 8 }), main)
    console.log('hover (no msvc):', JSON.stringify(hover).slice(0, 200))
    const syms = await page.evaluate((p) => window.xcode.lsp.documentSymbols(p), main)
    console.log('symbols (no msvc):', syms.map((s) => s.name))
    await cmd('nav.symbols')
    await page.waitForTimeout(800)
    await page.screenshot({ path: join(shots, '8-lsp-symbols.png') })
  }
}

if (toolchain.found && hasMsvc) {
  // Build must succeed.
  if (activity?.startsWith('Build Failed')) {
    await cmd('product.build')
    await waitIdle()
  }
  let msg = await page.textContent('.activity .msg')
  console.log('build:', msg)
  if (!msg?.startsWith('Build Succeeded')) {
    console.log((await consoleNow()).slice(-1500))
    throw new Error(`expected Build Succeeded, got "${msg}"`)
  }
  await page.screenshot({ path: join(shots, '8-build-succeeded.png') })

  // Run must print the greeting.
  await cmd('product.run')
  await waitIdle()
  const runOut = await consoleNow()
  console.log('run output tail:', runOut.slice(-200).replace(/\n/g, ' | '))
  if (!runOut.includes('Hello, Windows!')) throw new Error('program output missing')
  await page.screenshot({ path: join(shots, '9-run.png') })

  // Tests must pass and show in the Test navigator.
  await cmd('product.test')
  await waitIdle()
  await cmd('nav.tests')
  await page.waitForTimeout(300)
  msg = await page.textContent('.activity .msg')
  console.log('test:', msg)
  const passed = await page.$$eval('.test-status.passed', (r) => r.length)
  console.log('passed test rows:', passed)
  if (!msg?.startsWith('Test Succeeded') || passed < 1) throw new Error(`tests did not pass: ${msg}`)
  await page.screenshot({ path: join(shots, '10-tests.png') })

  // LSP: completion after "g." in main.swift should offer greet().
  await page.click('.tab:has-text("main.swift")')
  await page.waitForFunction(() => document.querySelector('.activity')?.textContent !== undefined)
  const lspReady = await page
    .waitForFunction(() => document.body.dataset.lsp === 'running', null, { timeout: 60000 })
    .then(() => true)
    .catch(() => false)
  console.log('lsp running:', lspReady)
  if (lspReady) {
    // sourcekit-lsp prepares the package in the background; poll until completions arrive.
    let items = []
    const deadline = Date.now() + 120000
    while (Date.now() < deadline) {
      items = await page.evaluate(async (p) => {
        // line 9 (0-based 8): "print(g.greet())" — position after "g."
        const r = await window.xcode.lsp.completion(p, { line: 8, character: 8 })
        return r.map((i) => i.label).slice(0, 50)
      }, join(sample, 'Sources', 'SampleApp', 'main.swift'))
      if (items.length) break
      await page.waitForTimeout(2000)
    }
    console.log('completion sample:', items.slice(0, 8))
    if (!items.some((l) => l.startsWith('greet'))) throw new Error('LSP completion did not offer greet()')
    const hover = await page.evaluate(
      (p) => window.xcode.lsp.hover(p, { line: 2, character: 8 }),
      join(sample, 'Sources', 'SampleApp', 'main.swift')
    )
    console.log('hover:', JSON.stringify(hover).slice(0, 160))
  }

  // Debugger: breakpoint on line 9 should pause with variables.
  if (toolchain.lldbDapPath) {
    await cmd('product.debug')
    const paused = await page
      .waitForFunction(() => document.querySelector('.debug-bar .state')?.textContent?.startsWith('Paused'), null, { timeout: 180000 })
      .then(() => true)
      .catch(() => false)
    console.log('debugger paused:', paused)
    if (!paused) {
      console.log((await consoleNow()).slice(-1500))
      throw new Error('debugger did not pause at breakpoint')
    }
    await page.waitForTimeout(1200)
    await page.screenshot({ path: join(shots, '11-debug-paused.png') })
    const vars = await page.$$eval('.var-row .name', (r) => r.map((x) => x.textContent))
    const frames = await page.$$eval('.nav-body .row .label', (r) => r.map((x) => x.textContent))
    console.log('variables:', vars.slice(0, 10))
    console.log('frames:', frames.slice(0, 6))
    await page.click('.debug-bar button[title^="Step Over"]')
    await page.waitForTimeout(1500)
    await page.click('.debug-bar button[title="Continue"]')
    await page.waitForFunction(() => !document.querySelector('.debug-bar .state')?.textContent?.startsWith('Paused'), null, { timeout: 60000 })
    await page.waitForTimeout(800)
    const dbgOut = await consoleNow()
    console.log('debug output has greeting:', dbgOut.includes('Hello, Windows!'))
    await page.screenshot({ path: join(shots, '12-debug-done.png') })
  }
}

// ---------------------------------------------------------------------------
// Simulator canvas phase: open the SwiftUI sample and inject the tree the Swift
// host would emit for it, so the renderer is verified even before the toolchain can link.
// ---------------------------------------------------------------------------
const previewApp = join(root, 'scripts', 'PreviewApp')
await page.evaluate((p) => window.xcode.project.open(p), previewApp)
await page.waitForSelector('.sim-pane', { timeout: 20000 })
console.log('canvas shown for App target')

const text = (s, extra = {}) => ({ t: 'text', p: { runs: [{ s, ...extra }] } })
const symbol = (name) => ({ t: 'image', p: { symbol: name } })
const label = (title, icon) => ({ t: 'label', c: [symbol(icon), text(title)] })
const taskRow = (title, done, id) => ({
  t: 'navlink', id: `row:${id}`, p: { rowID: id },
  c: [{ t: 'hstack', p: { align: 'center' }, c: [
    { t: 'button', id: `tgl:${id}`, m: [{ k: 'buttonStyle', a: { name: 'plain' } }], c: [
      { t: 'image', p: { symbol: done ? 'checkmark.circle.fill' : 'circle' }, m: [
        { k: 'foreground', a: { style: { color: { sys: done ? 'green' : 'secondary', a: 1 } } } },
        { k: 'font', a: { font: { style: 'title3' } } }
      ] }
    ] },
    { ...text(title), m: [{ k: 'strike', a: { on: done } }, { k: 'foreground', a: { style: { color: { sys: done ? 'secondary' : 'primary', a: 1 } } } }] },
    { t: 'spacer', p: {} }
  ] }]
})
const settingsSheet = {
  t: 'sheet', id: 'sheet1', c: [{ t: 'navstack', id: 'nav2', c: [{ t: 'page', c: [{
    t: 'list', p: { form: true },
    m: [{ k: 'navTitle', a: { title: 'Settings' } }, { k: 'toolbar', a: { node: { t: 'toolbarItem', p: { placement: 'confirmationAction' }, c: [{ t: 'button', id: 'done', c: [text('Done')] }] } } }],
    c: [
      { t: 'toggle', id: 'notif', p: { on: true }, c: [text('Notifications')] },
      { t: 'picker', id: 'theme', p: { selected: 0, labelIndex: 3 }, m: [{ k: 'pickerStyle', a: { name: 'segmented' } }], c: [text('System'), text('Light'), text('Dark'), text('Theme')] },
      { t: 'section', p: { hasHeader: true }, c: [text('About'), { t: 'empty' }, { t: 'labeled', c: [text('Version'), text('0.1')] }] }
    ]
  }] }] }]
}
const tasksTab = (withSheet) => ({
  t: 'navstack', id: 'nav1',
  m: [{ k: 'tabItem', a: { node: label('Tasks', 'checklist') } }, { k: 'tag', a: {} }],
  c: [{ t: 'page', c: [{
    t: 'list',
    m: [
      { k: 'navTitle', a: { title: 'Tasks' } },
      { k: 'toolbar', a: { node: { t: 'toolbarItem', p: { placement: 'topBarTrailing' }, c: [{ t: 'button', id: 'gear', c: [symbol('gearshape')] }] } } },
      ...(withSheet ? [{ k: 'present', a: { node: settingsSheet } }] : [])
    ],
    c: [
      { t: 'section', p: { hasHeader: true }, c: [text('Add'), { t: 'empty' }, { t: 'hstack', p: {}, c: [
        { t: 'textfield', id: 'tf', p: { text: '', prompt: 'New task' } },
        { t: 'button', id: 'add', m: [{ k: 'buttonStyle', a: { name: 'borderedProminent' } }], c: [text('Add')] }
      ] }] },
      { t: 'section', p: { hasHeader: true }, c: [text('2 remaining'), { t: 'empty' },
        taskRow('Build F-Code', true, 'a'), taskRow('Write the SwiftUI shim', false, 'b'), taskRow('Render it in the Simulator canvas', false, 'c')
      ] }
    ]
  }] }]
})
const counterTab = {
  t: 'vstack', p: { spacing: 24 },
  m: [{ k: 'padding', a: { edges: { t: true, l: true, b: true, r: true } } }, { k: 'tabItem', a: { node: label('Counter', 'number') } }],
  c: [
    { ...text('7'), m: [{ k: 'font', a: { font: { size: 64, weight: 'bold', design: 'rounded' } } }, { k: 'foreground', a: { style: { color: { sys: 'blue', a: 1 } } } }] },
    { t: 'hstack', p: { spacing: 12 }, m: [{ k: 'buttonStyle', a: { name: 'borderedProminent' } }, { k: 'font', a: { font: { style: 'title' } } }], c: [
      { t: 'button', id: 'dec', c: [text('−')] }, { t: 'button', id: 'inc', c: [text('+')] }
    ] },
    { t: 'vstack', p: { align: 'leading' }, m: [{ k: 'flexframe', a: { maxW: 'inf', align: { h: 'leading', v: 'center' } } }], c: [text('Step: 1'), { t: 'slider', id: 'sl', p: { value: 1, min: 1, max: 10, step: 1 } }] },
    { t: 'toggle', id: 'big', p: { on: false }, c: [text('Large digits')] },
    { t: 'spacer', p: {} }
  ]
}
const tree = (selected, withSheet) => ({ t: 'tabview', id: 'tabs', p: { selected }, c: [tasksTab(withSheet), counterTab] })

await page.evaluate((t) => window.__previewTree(t), tree(0, false))
await page.waitForTimeout(600)
await page.screenshot({ path: join(shots, '13-canvas-tasks.png') })
let unknown = await page.$$eval('.sw-unknown', (r) => r.map((x) => x.title))
if (unknown.length) throw new Error(`unknown nodes rendered: ${unknown.join(', ')}`)
const navTitle = await page.textContent('.sw-large-title')
const rows = await page.$$eval('.sw-row', (r) => r.length)
const tabs = await page.$$eval('.sw-tab', (r) => r.map((x) => x.textContent))
console.log('canvas:', { navTitle, rows, tabs })
if (navTitle !== 'Tasks' || rows < 4 || tabs.length !== 2) throw new Error('canvas tree did not render as expected')

await page.evaluate(() => window.__store.getState().set({ previewScheme: 'dark' }))
await page.evaluate((t) => window.__previewTree(t), tree(1, false))
await page.waitForTimeout(500)
await page.screenshot({ path: join(shots, '14-canvas-counter-dark.png') })

await page.evaluate(() => window.__store.getState().set({ previewScheme: 'light', device: 'iphonese' }))
await page.evaluate((t) => window.__previewTree(t), tree(0, true))
await page.waitForTimeout(500)
await page.screenshot({ path: join(shots, '15-canvas-sheet-se.png') })
const sheetTitle = await page.textContent('.sw-sheet .sw-large-title').catch(() => null)
console.log('sheet title:', sheetTitle)
if (sheetTitle !== 'Settings') throw new Error('sheet did not render')
unknown = await page.$$eval('.sw-unknown', (r) => r.map((x) => x.title))
if (unknown.length) throw new Error(`unknown nodes rendered: ${unknown.join(', ')}`)
console.log('canvas ok')

// ---------------------------------------------------------------------------
// Live canvas phase: build PreviewApp against the shim and drive the real app.
// ---------------------------------------------------------------------------
if (toolchain.found && hasMsvc) {
  await page.evaluate(() => window.__store.getState().set({ previewScheme: 'light', device: 'iphone16pro', previewTree: undefined }))
  await cmd('preview.resume')
  await page.waitForFunction(() => document.querySelector('.sim-status .dot.running') && document.querySelector('.sw-large-title')?.textContent === 'Tasks', null, { timeout: 600000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(shots, '16-live-tasks.png') })
  const liveRows = await page.$$eval('.sw-row', (r) => r.length)
  console.log('live rows:', liveRows)
  if (liveRows < 4) throw new Error('live tree has too few rows')

  // Type a task and add it.
  await page.click('.sw-textfield')
  await page.keyboard.type('Ship it')
  await page.waitForTimeout(300)
  await page.click('.sw-button:has-text("Add")')
  await page.waitForFunction(() => [...document.querySelectorAll('.sw-row')].some((r) => r.textContent?.includes('Ship it')), null, { timeout: 15000 })
  console.log('live add row ok')

  // Toggle the second task done via its row button (plain style).
  const headerBefore = await page.textContent('.sw-section-header:nth-of-type(1)').catch(() => '')
  await page.click('.sw-row:has-text("Write the SwiftUI shim") .sw-button')
  await page.waitForTimeout(600)
  const remaining = await page.$$eval('.sw-section-header', (r) => r.map((x) => x.textContent))
  console.log('section headers:', remaining, 'before:', headerBefore)
  if (!remaining.some((h) => /2 remaining/i.test(h ?? ''))) throw new Error('toggle did not update remaining count')
  await page.screenshot({ path: join(shots, '17-live-toggled.png') })

  // Push a detail page and come back.
  await page.click('.sw-navlink:has-text("Build F-Code")')
  await page.waitForFunction(() => document.querySelector('.sw-navbar-title')?.textContent === 'Detail', null, { timeout: 15000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(shots, '18-live-detail.png') })
  await page.click('.sw-back')
  await page.waitForFunction(() => document.querySelector('.sw-large-title')?.textContent === 'Tasks', null, { timeout: 15000 })
  console.log('live navigation ok')

  // Open the settings sheet from the toolbar, flip the segmented picker, dismiss.
  await page.click('.sw-navbar-trailing .sw-button')
  await page.waitForSelector('.sw-sheet', { timeout: 15000 })
  await page.click('.sw-segmented button:has-text("Dark")')
  await page.waitForFunction(() => document.querySelector('.sw-segmented button.sel')?.textContent === 'Dark', null, { timeout: 15000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(shots, '19-live-sheet.png') })
  await page.click('.sw-sheet .sw-button:has-text("Done")')
  await page.waitForFunction(() => !document.querySelector('.sw-sheet'), null, { timeout: 15000 })
  console.log('live sheet ok')

  // Counter tab: tap + three times, slider to 5, toggle large digits.
  await page.click('.sw-tab:nth-child(2)')
  await page.waitForFunction(() => document.querySelector('.sw-tab:nth-child(2)')?.classList.contains('sel'), null, { timeout: 15000 })
  for (let i = 0; i < 3; i++) {
    await page.click('.sw-button:has-text("+")')
    await page.waitForTimeout(250)
  }
  await page.waitForFunction(() => [...document.querySelectorAll('.sw-text')].some((t) => t.textContent === '3'), null, { timeout: 15000 })
  await page.click('.sw-switch')
  await page.waitForFunction(() => document.querySelector('.sw-switch')?.classList.contains('on'), null, { timeout: 15000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(shots, '20-live-counter.png') })
  console.log('live counter ok')

  await page.evaluate(() => window.__store.getState().set({ previewScheme: 'dark' }))
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(shots, '21-live-dark.png') })
  unknown = await page.$$eval('.sw-unknown', (r) => r.map((x) => x.title))
  if (unknown.length) throw new Error(`unknown nodes rendered live: ${unknown.join(', ')}`)
  await page.evaluate(() => window.xcode.preview.stop())
  console.log('live canvas ok')
}

// ---------------------------------------------------------------------------
// Remote Mac phase (opt-in): XC_MAC=user@host builds PreviewApp with Xcode on the
// Mac, runs it in the iOS Simulator and streams the screen into the canvas.
// ---------------------------------------------------------------------------
if (process.env.XC_MAC) {
  const [user, host] = process.env.XC_MAC.split('@')
  const status = await page.evaluate((c) => window.xcode.mac.configure(c), { host, user, port: 22 })
  console.log('mac status:', status)
  if (status.state !== 'ready') throw new Error(`Mac not ready: ${status.detail}`)
  await page.evaluate(() => window.__store.getState().set({ mac: window.__store.getState().mac }))
  const sims = await page.evaluate(() => window.xcode.mac.simulators())
  console.log('simulators:', sims.map((d) => `${d.name} (${d.runtime})`).join(', '))
  const sim = sims.find((d) => /iPhone 15 Pro$/.test(d.name)) ?? sims[0]
  if (!sim) throw new Error('no simulators')
  await page.evaluate(({ sims, udid }) => window.__store.getState().set({ simulators: sims, simUdid: udid, destination: 'mac', scheme: 'PreviewApp', canvasVisible: true }), { sims, udid: sim.udid })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(shots, '22-mac-destination.png') })
  await cmd('product.run')
  await page.waitForFunction(() => window.__store.getState().macRun.state === 'running', null, { timeout: 900000 })
  console.log('mac run: launched')
  await page.waitForSelector('.sim-mac img', { timeout: 120000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(shots, '23-mac-simulator.png') })
  const frames = await page.evaluate(() => (window.__store.getState().macFrame ?? '').length)
  console.log('mac frame bytes (b64):', frames)
  const build = await page.evaluate(() => window.__store.getState().build)
  console.log('build status:', build.phase, build.message)
  await page.evaluate(() => window.__store.getState().set({ previewScheme: 'dark' }))
  await page.waitForTimeout(4000)
  await page.screenshot({ path: join(shots, '24-mac-dark.png') })
  await cmd('product.stop')
  await page.waitForFunction(() => window.__store.getState().macRun.state !== 'running', null, { timeout: 30000 })
  console.log('mac simulator ok')
}

await app.close()
console.log('SMOKE OK')
