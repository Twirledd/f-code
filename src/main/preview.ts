import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { EventEmitter } from 'events'
import type { PreviewEnvironment, PreviewEvent, PreviewMessage, PreviewStatus } from '@shared/preview-types'
import { toolchainEnv } from './toolchain'

const PREFIX = '\u0001XC'

/**
 * Runs a SwiftUI app built against the shim and speaks the preview protocol with it.
 * Non-protocol stdout lines (the app's own `print`s) are forwarded to the console.
 */
export class PreviewHost extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | undefined
  private buffer = ''
  private status: PreviewStatus = { state: 'stopped' }
  private env: PreviewEnvironment = { colorScheme: 'light', dynamicTypeSize: 'large', width: 402, height: 874 }

  get current(): PreviewStatus {
    return this.status
  }

  private setStatus(s: PreviewStatus): void {
    this.status = s
    this.emit('status', s)
  }

  async launch(exe: string, cwd: string): Promise<void> {
    await this.stop()
    this.setStatus({ state: 'launching', message: 'Launching preview…' })
    const env = await toolchainEnv()
    const proc = spawn(exe, [], { cwd, windowsHide: true, env: { ...env, XCODE_PREVIEW: '1' } })
    this.proc = proc
    this.buffer = ''
    proc.stdout.on('data', (c: Buffer) => this.onData(c))
    proc.stderr.on('data', (c: Buffer) => this.emit('console', { stream: 'stderr', text: c.toString('utf8') }))
    proc.on('error', (e) => {
      this.setStatus({ state: 'crashed', message: e.message })
    })
    proc.on('close', (code) => {
      if (this.proc !== proc) return
      this.proc = undefined
      this.setStatus(code === 0 ? { state: 'stopped' } : { state: 'crashed', message: `Preview exited with code ${code}` })
    })
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8')
    const lines = this.buffer.split(/\r?\n/)
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith(PREFIX)) {
        try {
          const msg = JSON.parse(line.slice(PREFIX.length)) as PreviewMessage
          this.onMessage(msg)
        } catch (e) {
          this.emit('console', { stream: 'system', text: `Bad preview message: ${(e as Error).message}\n` })
        }
      } else if (line.length) {
        this.emit('console', { stream: 'stdout', text: line + '\n' })
      }
    }
  }

  private onMessage(msg: PreviewMessage): void {
    switch (msg.type) {
      case 'ready':
        this.setStatus({ state: 'running' })
        this.sendEnvironment(this.env)
        break
      case 'tree':
        this.emit('tree', msg.root)
        break
      case 'log':
        this.emit('console', { stream: 'stdout', text: msg.text + '\n' })
        break
    }
  }

  private send(obj: unknown): void {
    this.proc?.stdin.write(JSON.stringify(obj) + '\n')
  }

  sendEvent(e: PreviewEvent): void {
    this.send({ type: 'event', ...e })
  }

  sendEnvironment(env: Partial<PreviewEnvironment>): void {
    this.env = { ...this.env, ...env }
    if (this.proc) this.send({ type: 'env', ...this.env })
  }

  async stop(): Promise<void> {
    const proc = this.proc
    if (!proc) return
    this.proc = undefined
    this.send({ type: 'quit' })
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { windowsHide: true })
        resolve()
      }, 800)
      proc.once('close', () => {
        clearTimeout(t)
        resolve()
      })
    })
    this.setStatus({ state: 'stopped' })
  }
}
