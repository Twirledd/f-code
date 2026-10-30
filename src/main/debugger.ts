import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { EventEmitter } from 'events'
import type { Breakpoint, DebugStatus, Scope, StackFrame, Variable } from '@shared/types'
import { toolchainEnv } from './toolchain'

/**
 * Debug Adapter Protocol client for lldb-dap (shipped with the Swift toolchain).
 * Implements the DAP wire format (Content-Length framed JSON) directly; the
 * protocol is small enough that pulling in a full client library isn't worth it.
 */
export class LLDBDebugger extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | undefined
  private seq = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private buffer = Buffer.alloc(0)
  private status: DebugStatus = { state: 'inactive', frames: [] }
  private breakpoints: Breakpoint[] = []

  constructor(private dapPath: () => string | undefined) {
    super()
  }

  get current(): DebugStatus {
    return this.status
  }

  private setStatus(patch: Partial<DebugStatus>): void {
    this.status = { ...this.status, ...patch }
    this.emit('status', this.status)
  }

  private send(type: 'request', command: string, args?: unknown): Promise<unknown> {
    const proc = this.proc
    if (!proc) return Promise.reject(new Error('debugger not running'))
    const seq = this.seq++
    const msg = JSON.stringify({ seq, type, command, arguments: args ?? {} })
    const payload = `Content-Length: ${Buffer.byteLength(msg, 'utf8')}\r\n\r\n${msg}`
    return new Promise((resolve, reject) => {
      this.pending.set(seq, { resolve, reject })
      proc.stdin.write(payload)
    })
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd < 0) return
      const header = this.buffer.subarray(0, headerEnd).toString('utf8')
      const m = /Content-Length:\s*(\d+)/i.exec(header)
      if (!m) {
        this.buffer = this.buffer.subarray(headerEnd + 4)
        continue
      }
      const len = Number(m[1])
      const start = headerEnd + 4
      if (this.buffer.length < start + len) return
      const body = this.buffer.subarray(start, start + len).toString('utf8')
      this.buffer = this.buffer.subarray(start + len)
      try {
        this.onMessage(JSON.parse(body))
      } catch (e) {
        this.emit('console', { stream: 'system', text: `DAP parse error: ${(e as Error).message}\n` })
      }
    }
  }

  private onMessage(msg: {
    type: string
    request_seq?: number
    success?: boolean
    message?: string
    body?: Record<string, unknown>
    event?: string
  }): void {
    if (msg.type === 'response' && msg.request_seq !== undefined) {
      const p = this.pending.get(msg.request_seq)
      if (!p) return
      this.pending.delete(msg.request_seq)
      if (msg.success) p.resolve(msg.body)
      else p.reject(new Error(msg.message ?? 'DAP request failed'))
      return
    }
    if (msg.type !== 'event') return
    const body = (msg.body ?? {}) as Record<string, unknown>
    switch (msg.event) {
      case 'output': {
        const cat = String(body.category ?? 'console')
        const stream = cat === 'stderr' ? 'stderr' : cat === 'stdout' ? 'stdout' : 'system'
        this.emit('console', { stream, text: String(body.output ?? '') })
        break
      }
      case 'initialized':
        this.emit('initialized')
        break
      case 'stopped': {
        const threadId = Number(body.threadId ?? 1)
        this.setStatus({ state: 'paused', threadId, reason: String(body.reason ?? '') })
        void this.refreshFrames(threadId)
        break
      }
      case 'continued':
        this.setStatus({ state: 'running', frames: [] })
        break
      case 'terminated':
      case 'exited':
        this.setStatus({ state: 'terminated', frames: [] })
        this.emit('console', { stream: 'system', text: '\nDebug session ended.\n' })
        break
      case 'breakpoint': {
        const bp = body.breakpoint as { id?: number; verified?: boolean; line?: number } | undefined
        if (bp?.id !== undefined) this.emit('breakpointVerified', bp)
        break
      }
    }
  }

  private async refreshFrames(threadId: number): Promise<void> {
    try {
      const r = (await this.send('request', 'stackTrace', { threadId, startFrame: 0, levels: 40 })) as {
        stackFrames: Array<{ id: number; name: string; line?: number; column?: number; source?: { path?: string } }>
      }
      const frames: StackFrame[] = r.stackFrames.map((f) => ({
        id: f.id,
        name: f.name,
        file: f.source?.path,
        line: f.line,
        column: f.column
      }))
      this.setStatus({ frames })
    } catch {
      /* ignore */
    }
  }

  async launch(program: string, cwd: string, breakpoints: Breakpoint[]): Promise<void> {
    const exe = this.dapPath()
    if (!exe) throw new Error('lldb-dap.exe not found in the Swift toolchain')
    await this.stop()
    this.breakpoints = breakpoints
    this.setStatus({ state: 'launching', frames: [], reason: undefined })

    const env = await toolchainEnv()
    const proc = spawn(exe, [], { windowsHide: true, env })
    this.proc = proc
    proc.stdout.on('data', (c: Buffer) => this.onData(c))
    proc.stderr.on('data', (c: Buffer) => this.emit('console', { stream: 'stderr', text: c.toString('utf8') }))
    proc.on('exit', () => {
      if (this.proc === proc) {
        this.proc = undefined
        this.setStatus({ state: 'inactive', frames: [] })
      }
    })

    const initialized = new Promise<void>((r) => this.once('initialized', () => r()))
    await this.send('request', 'initialize', {
      clientID: 'f-code',
      clientName: 'F-Code',
      adapterID: 'lldb-dap',
      pathFormat: 'path',
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsVariableType: true,
      supportsRunInTerminalRequest: false
    })
    const launchP = this.send('request', 'launch', {
      program,
      cwd,
      stopOnEntry: false,
      initCommands: [],
      env: Object.entries(env).map(([k, v]) => `${k}=${v}`)
    })
    await initialized
    await this.syncBreakpoints()
    await this.send('request', 'configurationDone')
    await launchP
    this.setStatus({ state: 'running' })
  }

  async setBreakpoints(bps: Breakpoint[]): Promise<void> {
    this.breakpoints = bps
    if (this.proc && this.status.state !== 'inactive') await this.syncBreakpoints()
  }

  private async syncBreakpoints(): Promise<void> {
    const byFile = new Map<string, Breakpoint[]>()
    for (const bp of this.breakpoints) {
      if (!bp.enabled) continue
      const list = byFile.get(bp.file) ?? []
      list.push(bp)
      byFile.set(bp.file, list)
    }
    for (const [file, list] of byFile) {
      try {
        await this.send('request', 'setBreakpoints', {
          source: { path: file },
          breakpoints: list.map((b) => ({ line: b.line }))
        })
      } catch {
        /* ignore per-file failures */
      }
    }
  }

  async continue(): Promise<void> {
    await this.send('request', 'continue', { threadId: this.status.threadId ?? 1 })
    this.setStatus({ state: 'running', frames: [] })
  }
  async pause(): Promise<void> {
    await this.send('request', 'pause', { threadId: this.status.threadId ?? 1 })
  }
  async stepOver(): Promise<void> {
    await this.send('request', 'next', { threadId: this.status.threadId ?? 1 })
  }
  async stepIn(): Promise<void> {
    await this.send('request', 'stepIn', { threadId: this.status.threadId ?? 1 })
  }
  async stepOut(): Promise<void> {
    await this.send('request', 'stepOut', { threadId: this.status.threadId ?? 1 })
  }

  async scopes(frameId: number): Promise<Scope[]> {
    const r = (await this.send('request', 'scopes', { frameId })) as { scopes: Scope[] }
    return r.scopes
  }

  async variables(variablesReference: number): Promise<Variable[]> {
    const r = (await this.send('request', 'variables', { variablesReference })) as { variables: Variable[] }
    return r.variables.map((v) => ({
      name: v.name,
      value: v.value,
      type: v.type,
      variablesReference: v.variablesReference
    }))
  }

  async evaluate(expression: string, frameId?: number): Promise<string> {
    const r = (await this.send('request', 'evaluate', { expression, frameId, context: 'repl' })) as {
      result: string
    }
    return r.result
  }

  async stop(): Promise<void> {
    const proc = this.proc
    if (!proc) return
    try {
      await Promise.race([this.send('request', 'disconnect', { terminateDebuggee: true }), delay(1500)])
    } catch {
      /* ignore */
    }
    this.proc = undefined
    if (!proc.killed) proc.kill()
    for (const p of this.pending.values()) p.reject(new Error('debugger stopped'))
    this.pending.clear()
    this.setStatus({ state: 'inactive', frames: [], threadId: undefined })
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
