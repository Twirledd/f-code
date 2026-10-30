import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

/**
 * Locate a built product. Layouts seen on Windows:
 *  - Swift ≥ 6.4 (swift-build system): .build/out/Products/Debug-windows-x86_64/<p>.exe
 *  - older: .build/<triple>/debug/<p>.exe, with .build/debug as a symlink that needs Developer Mode.
 */
function debugExe(cwd: string, product: string): string {
  const candidates = [
    join(cwd, '.build', 'out', 'Products', 'Debug-windows-x86_64', `${product}.exe`),
    join(cwd, '.build', 'out', 'Products', 'Debug-windows-arm64', `${product}.exe`),
    join(cwd, '.build', 'debug', `${product}.exe`),
    join(cwd, '.build', 'x86_64-unknown-windows-msvc', 'debug', `${product}.exe`),
    join(cwd, '.build', 'aarch64-unknown-windows-msvc', 'debug', `${product}.exe`)
  ]
  return candidates.find((c) => existsSync(c)) ?? candidates[0]
}
import { EventEmitter } from 'events'
import type { BuildStatus, ConsoleChunk, Diagnostic, Severity, TestResult } from '@shared/types'
import { toolchainEnv } from './toolchain'

export interface SwiftPMEvents {
  status: (s: BuildStatus) => void
  console: (c: ConsoleChunk) => void
  tests: (r: TestResult[]) => void
}

// swiftc diagnostic:  C:\path\File.swift:12:5: error: message
const DIAG_RE = /^(.+?\.swift):(\d+):(\d+):\s+(error|warning|note):\s+(.*)$/
// XCTest on Windows: "Test Case 'Suite.testName' passed (0.001 seconds)"
const XCTEST_RE = /^Test Case '(?:-\[)?([\w.]+)\.(\w+)\]?' (passed|failed|skipped) \(([\d.]+) seconds\)/
// swift-testing: "✔ Test "name" passed after 0.001 seconds." / "✘ Test "name" failed after ..."
const SWIFT_TESTING_RE = /^[✔✘]\s+Test "?([^"]+?)"?\s+(passed|failed) after ([\d.]+) seconds/

export class SwiftPM extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | undefined
  private status: BuildStatus = { phase: 'idle', message: 'Ready', diagnostics: [] }
  private testResults: TestResult[] = []

  constructor(
    private swiftPath: () => string | undefined,
    private cwd: () => string | undefined
  ) {
    super()
  }

  get current(): BuildStatus {
    return this.status
  }

  get isBusy(): boolean {
    return !!this.proc
  }

  private setStatus(patch: Partial<BuildStatus>): void {
    this.status = { ...this.status, ...patch }
    this.emit('status', this.status)
  }

  private log(stream: ConsoleChunk['stream'], text: string): void {
    this.emit('console', { stream, text })
  }

  stop(): void {
    if (!this.proc) return
    const p = this.proc
    this.proc = undefined
    // On Windows, kill the whole tree so the child swift process goes too.
    spawn('taskkill', ['/pid', String(p.pid), '/t', '/f'], { windowsHide: true })
    this.log('system', '\nProgram ended (stopped by user).\n')
    this.setStatus({ phase: 'stopped', message: 'Stopped', finishedAt: Date.now() })
  }

  writeInput(text: string): void {
    this.proc?.stdin.write(text)
  }

  /** Spawns `swift <args>` and streams output. Resolves with the exit code. */
  private async run(args: string[], phase: BuildStatus['phase'], message: string): Promise<number> {
    const swift = this.swiftPath()
    const cwd = this.cwd()
    if (!swift) {
      this.log('system', 'Swift toolchain not found. Open Settings ▸ Swift Toolchain to install it.\n')
      this.setStatus({ phase: 'failed', message: 'No toolchain', diagnostics: [] })
      return -1
    }
    if (!cwd) {
      this.setStatus({ phase: 'failed', message: 'No project open', diagnostics: [] })
      return -1
    }
    if (this.proc) this.stop()

    this.setStatus({ phase, message, diagnostics: [], startedAt: Date.now(), finishedAt: undefined })
    this.testResults = []
    this.log('system', `$ swift ${args.join(' ')}\n`)
    const env = await toolchainEnv()

    return new Promise((resolve) => {
      const proc = spawn(swift, args, { cwd, windowsHide: true, env })
      this.proc = proc
      const diagnostics: Diagnostic[] = []
      const seen = new Set<string>()
      let stdoutBuf = ''
      let stderrBuf = ''

      const handleLine = (line: string): void => {
        const d = DIAG_RE.exec(line.trim())
        if (d) {
          const key = line.trim()
          if (!seen.has(key)) {
            seen.add(key)
            diagnostics.push({
              file: d[1],
              line: Number(d[2]),
              column: Number(d[3]),
              severity: d[4] as Severity,
              message: d[5]
            })
            this.setStatus({ diagnostics: [...diagnostics] })
          }
        }
        const x = XCTEST_RE.exec(line.trim())
        if (x) {
          this.testResults.push({
            suite: x[1],
            name: x[2],
            status: x[3] as TestResult['status'],
            duration: Number(x[4])
          })
          this.emit('tests', [...this.testResults])
        }
        const st = SWIFT_TESTING_RE.exec(line.trim())
        if (st) {
          this.testResults.push({
            suite: 'Swift Testing',
            name: st[1],
            status: st[2] as TestResult['status'],
            duration: Number(st[3])
          })
          this.emit('tests', [...this.testResults])
        }
      }

      const pump = (chunk: Buffer, which: 'stdout' | 'stderr'): void => {
        const text = chunk.toString('utf8')
        this.log(which, text)
        if (which === 'stdout') {
          stdoutBuf += text
          const parts = stdoutBuf.split(/\r?\n/)
          stdoutBuf = parts.pop() ?? ''
          parts.forEach(handleLine)
        } else {
          stderrBuf += text
          const parts = stderrBuf.split(/\r?\n/)
          stderrBuf = parts.pop() ?? ''
          parts.forEach(handleLine)
        }
      }

      proc.stdout.on('data', (c: Buffer) => pump(c, 'stdout'))
      proc.stderr.on('data', (c: Buffer) => pump(c, 'stderr'))
      proc.on('error', (err) => {
        this.log('system', `Failed to start swift: ${err.message}\n`)
      })
      proc.on('close', (code) => {
        if (stdoutBuf) handleLine(stdoutBuf)
        if (stderrBuf) handleLine(stderrBuf)
        if (this.proc === proc) this.proc = undefined
        else return resolve(code ?? -1) // we were stopped
        resolve(code ?? -1)
      })
    })
  }

  async build(product?: string): Promise<boolean> {
    const args = ['build']
    if (product) args.push('--product', product)
    const code = await this.run(args, 'building', `Building ${product ?? 'all targets'}…`)
    if (this.status.phase === 'stopped') return false
    const errors = this.status.diagnostics.filter((d) => d.severity === 'error').length
    const warnings = this.status.diagnostics.filter((d) => d.severity === 'warning').length
    if (code === 0) {
      this.setStatus({
        phase: 'succeeded',
        message: warnings ? `Build Succeeded — ${warnings} warning${warnings > 1 ? 's' : ''}` : 'Build Succeeded',
        finishedAt: Date.now()
      })
      return true
    }
    this.setStatus({
      phase: 'failed',
      message: errors ? `Build Failed — ${errors} error${errors > 1 ? 's' : ''}` : 'Build Failed',
      finishedAt: Date.now()
    })
    return false
  }

  /** Build, then run the executable directly so stdin/stdout belong to the program. */
  async buildAndRun(product: string): Promise<void> {
    const ok = await this.build(product)
    if (!ok) return
    const cwd = this.cwd()
    if (!cwd) return
    const exe = debugExe(cwd, product)
    this.setStatus({ phase: 'running', message: `Running ${product}…`, startedAt: Date.now() })
    this.log('system', `\n$ ${exe}\n\n`)
    const env = await toolchainEnv() // swift runtime DLLs live in the toolchain bin dir
    await new Promise<void>((resolve) => {
      const proc = spawn(exe, [], { cwd, windowsHide: true, env })
      this.proc = proc
      proc.stdout.on('data', (c: Buffer) => this.log('stdout', c.toString('utf8')))
      proc.stderr.on('data', (c: Buffer) => this.log('stderr', c.toString('utf8')))
      proc.on('error', (err) => this.log('system', `Failed to launch: ${err.message}\n`))
      proc.on('close', (code) => {
        if (this.proc !== proc) return resolve() // stopped by user
        this.proc = undefined
        this.log('system', `\nProgram ended with exit code: ${code}\n`)
        this.setStatus({
          phase: code === 0 ? 'succeeded' : 'failed',
          message: code === 0 ? 'Finished running' : `Exited with code ${code}`,
          finishedAt: Date.now()
        })
        resolve()
      })
    })
  }

  async test(filter?: string): Promise<void> {
    const args = ['test']
    if (filter) args.push('--filter', filter)
    const code = await this.run(args, 'testing', 'Testing…')
    if (this.status.phase === 'stopped') return
    const failed = this.testResults.filter((t) => t.status === 'failed').length
    const passed = this.testResults.filter((t) => t.status === 'passed').length
    this.setStatus({
      phase: code === 0 ? 'succeeded' : 'failed',
      message:
        code === 0
          ? `Test Succeeded — ${passed} passed`
          : failed
            ? `Test Failed — ${failed} failed, ${passed} passed`
            : 'Test Failed',
      finishedAt: Date.now()
    })
  }

  async clean(): Promise<void> {
    const code = await this.run(['package', 'clean'], 'building', 'Cleaning…')
    this.setStatus({
      phase: code === 0 ? 'succeeded' : 'failed',
      message: code === 0 ? 'Clean Succeeded' : 'Clean Failed',
      finishedAt: Date.now()
    })
  }

  /** Build without running, for the debugger. Returns path of the executable. */
  async buildForDebug(product: string): Promise<string | undefined> {
    const ok = await this.build(product)
    const cwd = this.cwd()
    if (!ok || !cwd) return undefined
    return debugExe(cwd, product)
  }
}
