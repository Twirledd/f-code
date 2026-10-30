// Retakes the README screenshots from the built app, using a neutral demo project so no
// local paths, machine names or user names appear. Run `npm run build` first, then
// `node scripts/readme-shots.mjs`. Output: assets/screenshots/*.png
import { _electron as electron } from 'playwright-core'
import { mkdirSync, writeFileSync, rmSync, cpSync } from 'fs'
import { execFileSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'assets', 'screenshots')
mkdirSync(out, { recursive: true })

const demoRoot = process.env.FCODE_DEMO_DIR ?? 'F:\\F-Code-Demo'
rmSync(demoRoot, { recursive: true, force: true })
const hello = join(demoRoot, 'HelloApp')
mkdirSync(join(hello, 'Sources', 'HelloApp'), { recursive: true })
mkdirSync(join(hello, 'Tests', 'HelloAppTests'), { recursive: true })
writeFileSync(
  join(hello, 'Package.swift'),
  `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "HelloApp",
    targets: [
        .executableTarget(name: "HelloApp"),
        .testTarget(name: "HelloAppTests", dependencies: ["HelloApp"]),
    ]
)
`
)
writeFileSync(
  join(hello, 'Sources', 'HelloApp', 'main.swift'),
  `import Foundation

struct Greeter {
    let name: String
    func greet() -> String { "Hello, \\(name)!" }
}

let people = ["Windows", "Swift", "F-Code"]
for person in people {
    let g = Greeter(name: person)
    print(g.greet())
}
`
)
writeFileSync(
  join(hello, 'Tests', 'HelloAppTests', 'HelloAppTests.swift'),
  `import XCTest

final class HelloAppTests: XCTestCase {
    func testExample() { XCTAssertEqual(1 + 1, 2) }
}
`
)
const previewApp = join(demoRoot, 'TaskApp')
cpSync(join(root, 'scripts', 'PreviewApp'), previewApp, {
  recursive: true,
  filter: (src) => !/[\\/]\.build([\\/]|$)/.test(src)
})

const userData = join(demoRoot, '.userdata')
const app = await electron.launch({
  args: [join(root, 'out', 'main', 'index.js'), `--user-data-dir=${userData}`],
  cwd: root,
  env: { ...process.env, NODE_ENV: 'production' }
})
const page = await app.firstWindow()
const shot = (name) => page.screenshot({ path: join(out, name) })
const cmd = (id) => page.evaluate((c) => window.__runCommand(c), id)
const waitIdle = () => page.waitForFunction(() => !document.querySelector('.activity .progress'), null, { timeout: 600000 })

await page.waitForSelector('.welcome', { timeout: 20000 })
await page.waitForTimeout(800)
await shot('welcome.png')
console.log('welcome')

await page.evaluate((p) => window.xcode.project.open(p), hello)
await page.waitForSelector('.toolbar', { timeout: 20000 })
await page.click('.row:has-text("main.swift")')
await page.waitForSelector('.monaco-editor .view-lines', { timeout: 20000 })
await page.waitForTimeout(800)

// Build and run, then take the editor shot with the console showing the greeting.
await cmd('nav.issues')
await cmd('product.build')
await waitIdle()
await cmd('product.run')
await waitIdle()
await page.waitForTimeout(500)
await shot('editor-build-run.png')
console.log('build+run:', await page.textContent('.activity .msg'))

// Test navigator.
await cmd('product.test')
await waitIdle()
await cmd('nav.tests')
await page.waitForTimeout(400)
await shot('tests.png')
console.log('tests:', await page.textContent('.activity .msg'))

// Debugger paused on a breakpoint (best effort: needs lldb-dap).
try {
  await page.click('.tab:has-text("main.swift")')
  await page.evaluate(() => window.__editor.setPosition({ lineNumber: 11, column: 1 }))
  await cmd('debug.toggleBreakpoint')
  await cmd('product.debug')
  await page.waitForFunction(() => document.querySelector('.debug-bar .state')?.textContent?.startsWith('Paused'), null, { timeout: 180000 })
  await page.waitForTimeout(1500)
  await shot('debugger.png')
  console.log('debugger paused')
  await page.click('.debug-bar button[title="Continue"]').catch(() => {})
  await page.waitForTimeout(1500)
  await page.click('.debug-bar button[title="Continue"]').catch(() => {})
  await page.click('.debug-bar button[title="Continue"]').catch(() => {})
  await page.waitForTimeout(1500)
} catch (e) {
  console.log('debugger shot skipped:', e.message.split('\n')[0])
}

// Source control: turn the demo project into a repository with some history and pending changes.
const git = (...args) => execFileSync('git', ['-c', 'user.name=Alex Demo', '-c', 'user.email=alex@example.com', '-c', 'core.autocrlf=false', ...args], { cwd: hello, stdio: 'ignore' })
writeFileSync(join(hello, '.gitignore'), '.build/\n.swiftpm/\n')
git('init', '-b', 'main')
git('add', '-A')
git('commit', '-m', 'Initial commit')
writeFileSync(join(hello, 'README.md'), '# HelloApp\n\nA small Swift package.\n')
git('add', '-A')
git('commit', '-m', 'Add a README')
writeFileSync(
  join(hello, 'Sources', 'HelloApp', 'main.swift'),
  `import Foundation

struct Greeter {
    let name: String
    func greet() -> String { "Hello, \\(name)!" }
}

let people = ["Windows", "Swift", "F-Code", "GitHub"]
for person in people {
    let g = Greeter(name: person)
    print(g.greet())
}
`
)
writeFileSync(join(hello, 'Sources', 'HelloApp', 'Farewell.swift'), 'func farewell() -> String { "Goodbye!" }\n')
writeFileSync(join(hello, 'NOTES.md'), 'Ideas for the next release.\n')
await page.evaluate((p) => window.xcode.project.open(p), hello)
await page.waitForSelector('.toolbar', { timeout: 20000 })
await cmd('nav.scm')
await page.waitForSelector('.scm-row', { timeout: 20000 })
await page.hover('.scm-row:has-text("main.swift")')
await page.click('.scm-row:has-text("main.swift") .scm-icon-btn[title="Stage"]')
await page.waitForSelector('.nav-section:has-text("Staged Changes")', { timeout: 10000 })
await page.fill('.scm-commit textarea', 'Add GitHub to the greeting list')
await page.waitForTimeout(500)
await shot('source-control.png')
console.log('source control shot')
await page.click('.scm-row:has-text("main.swift")')
await page.waitForSelector('.diff-view .diff-line.add', { timeout: 10000 })
await page.waitForTimeout(300)
await shot('git-diff.png')
await page.click('.sheet-footer .btn.primary')
await page.evaluate(() => window.__store.getState().set({ sheet: 'clone' }))
await page.waitForSelector('.sheet input[placeholder^="https"]', { timeout: 5000 })
await page.fill('.sheet input[placeholder^="https"]', 'https://github.com/your-name/your-repo.git')
await page.waitForTimeout(300)
await shot('clone.png')
await page.keyboard.press('Escape')

// Simulator canvas with a synthetic tree (no toolchain link needed).
await page.evaluate((p) => window.xcode.project.open(p), previewApp)
await page.waitForSelector('.sim-pane', { timeout: 20000 })

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
await page.waitForTimeout(700)
await shot('simulator-canvas.png')
await page.evaluate(() => window.__store.getState().set({ previewScheme: 'dark' }))
await page.evaluate((t) => window.__previewTree(t), tree(1, false))
await page.waitForTimeout(600)
await shot('simulator-canvas-dark.png')
await page.evaluate(() => window.__store.getState().set({ previewScheme: 'light' }))
await page.evaluate((t) => window.__previewTree(t), tree(0, true))
await page.waitForTimeout(600)
await shot('simulator-canvas-sheet.png')
console.log('canvas done')

await app.close()
rmSync(demoRoot, { recursive: true, force: true })
console.log('shots written to', out)
