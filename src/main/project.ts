import { promises as fs, existsSync, readFileSync, readdirSync } from 'fs'
import { join, basename, extname, relative, sep } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import type { FileKind, FileNode, NewProjectOptions, ProductInfo, ProjectInfo } from '@shared/types'
import { toolchainEnv } from './toolchain'

const execFileAsync = promisify(execFile)

const IGNORED = new Set(['.build', '.git', '.swiftpm', 'node_modules', '.index-build', 'DerivedData'])

function kindFor(name: string, isDir: boolean): FileKind {
  if (isDir) return 'folder'
  if (name === 'Package.swift') return 'package'
  const ext = extname(name).toLowerCase()
  switch (ext) {
    case '.swift':
      return 'swift'
    case '.json':
    case '.plist':
    case '.yml':
    case '.yaml':
      return 'json'
    case '.md':
      return 'markdown'
    case '.txt':
    case '.resolved':
    case '.gitignore':
    case '.c':
    case '.h':
    case '.cpp':
    case '.modulemap':
      return 'text'
    default:
      return 'resource'
  }
}

async function buildTree(dir: string, depth = 0): Promise<FileNode> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const children: FileNode[] = []
  for (const e of entries) {
    if (IGNORED.has(e.name)) continue
    if (e.name.startsWith('.') && e.isDirectory()) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (depth < 12) children.push(await buildTree(full, depth + 1))
    } else {
      children.push({ name: e.name, path: full, kind: kindFor(e.name, false) })
    }
  }
  // Xcode orders: Package.swift first, then folders, then files, alphabetical.
  children.sort((a, b) => {
    const rank = (n: FileNode): number => (n.kind === 'package' ? 0 : n.kind === 'folder' ? 1 : 2)
    const r = rank(a) - rank(b)
    return r !== 0 ? r : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  return { name: basename(dir), path: dir, kind: 'folder', children }
}

/** Parse product names/types from `swift package describe --type json`, falling back to regex on Package.swift. */
async function readProducts(root: string, swiftPath?: string): Promise<ProductInfo[]> {
  if (swiftPath) {
    try {
      const { stdout } = await execFileAsync(swiftPath, ['package', 'describe', '--type', 'json'], {
        cwd: root,
        timeout: 60000,
        maxBuffer: 16 * 1024 * 1024,
        env: await toolchainEnv()
      })
      const json = JSON.parse(stdout)
      const products: ProductInfo[] = []
      for (const t of json.targets ?? []) {
        const type = String(t.type ?? '')
        if (type === 'executable') products.push({ name: t.name, type: 'executable' })
        else if (type === 'test') products.push({ name: t.name, type: 'test' })
        else if (type === 'library' || type === 'regular') products.push({ name: t.name, type: 'library' })
      }
      if (products.length) return products
    } catch {
      /* fall through to regex */
    }
  }
  const manifestPath = join(root, 'Package.swift')
  if (!existsSync(manifestPath)) return []
  const src = await fs.readFile(manifestPath, 'utf8')
  const products: ProductInfo[] = []
  const re = /\.(executableTarget|target|testTarget)\s*\(\s*name:\s*"([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const type = m[1] === 'executableTarget' ? 'executable' : m[1] === 'testTarget' ? 'test' : 'library'
    products.push({ name: m[2], type })
  }
  return products
}

/** Location of F-Code's bundled SwiftUI shim package (dev checkout or packaged resources). */
export function shimPath(): string {
  const candidates = [join(app.getAppPath(), 'swiftui-shim'), join(process.resourcesPath ?? '', 'swiftui-shim')]
  return candidates.find((p) => existsSync(join(p, 'Package.swift'))) ?? candidates[0]
}

/** Heuristic: an executable target whose sources declare a SwiftUI `App` is previewable in the Simulator canvas. */
function detectApp(root: string, target: string): boolean {
  const dirs = [join(root, 'Sources', target), join(root, 'Sources')]
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    const stack = [dir]
    while (stack.length) {
      const d = stack.pop()!
      let entries: string[]
      try {
        entries = readdirSync(d)
      } catch {
        continue
      }
      for (const e of entries) {
        const p = join(d, e)
        if (e.endsWith('.swift')) {
          try {
            const src = readFileSync(p, 'utf8')
            if (/@main\s+struct\s+\w+\s*:\s*App\b/.test(src) && /import\s+SwiftUI/.test(src)) return true
          } catch {
            /* ignore */
          }
        } else if (!e.startsWith('.') && e !== 'Tests') {
          try {
            if (readdirSync(p).length) stack.push(p)
          } catch {
            /* not a dir */
          }
        }
      }
    }
    if (dir.endsWith(target)) break
  }
  return false
}

export async function openProject(root: string, swiftPath?: string): Promise<ProjectInfo> {
  const tree = await buildTree(root)
  const manifestPath = join(root, 'Package.swift')
  const products = await readProducts(root, swiftPath)
  for (const p of products) if (p.type === 'executable') p.isApp = detectApp(root, p.name)
  return {
    root,
    name: basename(root),
    packageManifest: existsSync(manifestPath) ? manifestPath : undefined,
    products,
    tree
  }
}

export async function readFile(path: string): Promise<string> {
  return fs.readFile(path, 'utf8')
}

export async function writeFile(path: string, contents: string): Promise<void> {
  await fs.writeFile(path, contents, 'utf8')
}

export async function createFile(path: string, contents = ''): Promise<void> {
  await fs.mkdir(join(path, '..'), { recursive: true })
  if (existsSync(path)) throw new Error(`${basename(path)} already exists`)
  await fs.writeFile(path, contents, 'utf8')
}

export async function createFolder(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true })
}

export async function deletePath(path: string): Promise<void> {
  await fs.rm(path, { recursive: true, force: true })
}

export async function renamePath(from: string, to: string): Promise<void> {
  await fs.rename(from, to)
}

export function isInside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return !!rel && !rel.startsWith('..') && !rel.includes(`..${sep}`)
}

// ---------------------------------------------------------------------------
// New project templates (mirrors `swift package init` output so SwiftPM is happy)
// ---------------------------------------------------------------------------

const swiftToolsVersion = '// swift-tools-version: 5.9'

function manifest(name: string, template: NewProjectOptions['template']): string {
  if (template === 'app') {
    const shim = shimPath().replace(/\\/g, '/')
    return `${swiftToolsVersion}
import PackageDescription

// On Windows, F-Code supplies a SwiftUI-compatible module for the Simulator canvas.
// On macOS this dependency is skipped and Apple's SwiftUI is used.
var dependencies: [Package.Dependency] = []
var appDependencies: [Target.Dependency] = []
#if os(Windows)
dependencies.append(.package(path: "${shim}"))
appDependencies.append(.product(name: "SwiftUI", package: "swiftui-shim"))
#endif

let package = Package(
    name: "${name}",
    platforms: [.iOS(.v17), .macOS(.v14)],
    dependencies: dependencies,
    targets: [
        .executableTarget(name: "${name}", dependencies: appDependencies),
        .testTarget(name: "${name}Tests", dependencies: ["${name}"]),
    ]
)
`
  }
  if (template === 'library') {
    return `${swiftToolsVersion}
import PackageDescription

let package = Package(
    name: "${name}",
    products: [
        .library(name: "${name}", targets: ["${name}"]),
    ],
    targets: [
        .target(name: "${name}"),
        .testTarget(name: "${name}Tests", dependencies: ["${name}"]),
    ]
)
`
  }
  if (template === 'tool') {
    return `${swiftToolsVersion}
import PackageDescription

let package = Package(
    name: "${name}",
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser.git", from: "1.3.0"),
    ],
    targets: [
        .executableTarget(
            name: "${name}",
            dependencies: [.product(name: "ArgumentParser", package: "swift-argument-parser")]
        ),
    ]
)
`
  }
  return `${swiftToolsVersion}
import PackageDescription

let package = Package(
    name: "${name}",
    targets: [
        .executableTarget(name: "${name}"),
        .testTarget(name: "${name}Tests", dependencies: ["${name}"]),
    ]
)
`
}

function appSources(name: string): Record<string, string> {
  return {
    [`${name}App.swift`]: `//
//  ${name}App.swift
//  ${name}
//
//  Created with F-Code.
//

import SwiftUI

@main
struct ${name}App: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
`,
    'ContentView.swift': `//
//  ContentView.swift
//  ${name}
//
//  Created with F-Code.
//

import SwiftUI

struct ContentView: View {
    @State private var count = 0

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Image(systemName: "globe")
                    .imageScale(.large)
                    .foregroundStyle(.tint)
                Text("Hello, world!")
                    .font(.title)
                Text("You tapped \\(count) times")
                    .foregroundStyle(.secondary)
                Button("Tap me") {
                    count += 1
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
            .navigationTitle("${name}")
        }
    }
}

#if !os(Windows)
#Preview {
    ContentView()
}
#endif
`
  }
}

function mainSource(name: string, template: NewProjectOptions['template']): string {
  if (template === 'library') {
    return `// ${name}.swift
// ${name}
//
// Created with F-Code.

public struct ${name} {
    public private(set) var text = "Hello, World!"

    public init() {}
}
`
  }
  if (template === 'tool') {
    return `// main.swift
// ${name}
//
// Created with F-Code.

import ArgumentParser

@main
struct ${name}: ParsableCommand {
    @Argument(help: "Who to greet.")
    var name: String = "World"

    mutating func run() throws {
        print("Hello, \\(name)!")
    }
}
`
  }
  return `// main.swift
// ${name}
//
// Created with F-Code.

import Foundation

print("Hello, World!")
`
}

function testSource(name: string, template: NewProjectOptions['template']): string {
  const importLine = template === 'library' ? `@testable import ${name}` : `// @testable import ${name}`
  const body =
    template === 'library'
      ? `        XCTAssertEqual(${name}().text, "Hello, World!")`
      : `        XCTAssertTrue(true)`
  return `import XCTest
${importLine}

final class ${name}Tests: XCTestCase {
    func testExample() throws {
${body}
    }
}
`
}

export async function createProject(opts: NewProjectOptions): Promise<string> {
  const safeName = opts.name.replace(/[^A-Za-z0-9_]/g, '')
  if (!safeName) throw new Error('Project name must contain letters or numbers')
  const root = join(opts.location, safeName)
  if (existsSync(root)) throw new Error(`A folder named "${safeName}" already exists at that location`)

  await fs.mkdir(join(root, 'Sources', safeName), { recursive: true })
  await fs.writeFile(join(root, 'Package.swift'), manifest(safeName, opts.template), 'utf8')
  if (opts.template === 'app') {
    for (const [file, src] of Object.entries(appSources(safeName))) {
      await fs.writeFile(join(root, 'Sources', safeName, file), src, 'utf8')
    }
  } else {
    const mainName = opts.template === 'library' ? `${safeName}.swift` : 'main.swift'
    await fs.writeFile(join(root, 'Sources', safeName, mainName), mainSource(safeName, opts.template), 'utf8')
  }
  if (opts.template !== 'tool') {
    await fs.mkdir(join(root, 'Tests', `${safeName}Tests`), { recursive: true })
    await fs.writeFile(
      join(root, 'Tests', `${safeName}Tests`, `${safeName}Tests.swift`),
      testSource(safeName, opts.template),
      'utf8'
    )
  }
  await fs.writeFile(join(root, '.gitignore'), '.build/\n.swiftpm/\n*.xcodeproj\nDerivedData/\n', 'utf8')
  await fs.writeFile(join(root, 'README.md'), `# ${safeName}\n\nA Swift package created with F-Code.\n`, 'utf8')

  if (opts.createGit) {
    try {
      await execFileAsync('git', ['init'], { cwd: root })
      await execFileAsync('git', ['add', '-A'], { cwd: root })
      await execFileAsync('git', ['commit', '-q', '-m', 'Initial Commit'], { cwd: root })
    } catch {
      /* git is optional */
    }
  }
  return root
}
