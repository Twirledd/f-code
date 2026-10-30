import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { EventEmitter } from 'events'
import { pathToFileURL } from 'url'
import {
  createMessageConnection,
  MessageConnection,
  StreamMessageReader,
  StreamMessageWriter
} from 'vscode-jsonrpc/node'
import type {
  LspCompletionItem,
  LspDiagnostic,
  LspDocumentSymbol,
  LspHover,
  LspLocation,
  LspPosition
} from '@shared/types'
import { toolchainEnv } from './toolchain'

export type LspState = 'stopped' | 'starting' | 'running' | 'error'

/**
 * Minimal Language Server Protocol client speaking to sourcekit-lsp over stdio.
 * Only the handful of requests the editor uses are wrapped; everything else is
 * passed straight through via `request()`.
 */
export class SourceKitLSP extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | undefined
  private conn: MessageConnection | undefined
  private versions = new Map<string, number>()
  /** Documents the editor has open; replayed to the server when it (re)starts. */
  private openDocs = new Map<string, string>()
  state: LspState = 'stopped'

  constructor(private lspPath: () => string | undefined) {
    super()
  }

  static uri(path: string): string {
    return pathToFileURL(path).toString()
  }

  static path(uri: string): string {
    return decodeURIComponent(new URL(uri).pathname.replace(/^\/([A-Za-z]:)/, '$1')).replace(/\//g, '\\')
  }

  private setState(s: LspState, detail?: string): void {
    this.state = s
    this.emit('status', { state: s, detail })
  }

  async start(rootPath: string): Promise<void> {
    await this.stop()
    const exe = this.lspPath()
    if (!exe) {
      this.setState('error', 'sourcekit-lsp not found')
      return
    }
    this.setState('starting')
    const env = await toolchainEnv()
    const proc = spawn(exe, [], { cwd: rootPath, windowsHide: true, env })
    this.proc = proc
    proc.stdin.on('error', () => undefined) // EPIPE after the server exits is expected
    proc.stderr.on('data', (c: Buffer) => this.emit('log', c.toString('utf8')))
    proc.on('exit', (code) => {
      if (this.proc === proc) {
        this.proc = undefined
        this.conn = undefined
        this.setState('stopped', `sourcekit-lsp exited (${code})`)
      }
    })

    const conn = createMessageConnection(new StreamMessageReader(proc.stdout), new StreamMessageWriter(proc.stdin))
    this.conn = conn
    conn.onNotification('textDocument/publishDiagnostics', (p: { uri: string; diagnostics: LspDiagnostic[] }) => {
      this.emit('diagnostics', { path: SourceKitLSP.path(p.uri), diagnostics: p.diagnostics })
    })
    conn.onNotification('window/logMessage', (p: { message: string }) => this.emit('log', p.message + '\n'))
    conn.onRequest('window/workDoneProgress/create', () => null)
    conn.onRequest('client/registerCapability', () => null)
    conn.onRequest('workspace/configuration', (p: { items: unknown[] }) => p.items.map(() => null))
    conn.onError((e) => this.emit('log', `LSP error: ${String(e)}\n`))
    conn.listen()

    try {
      await conn.sendRequest('initialize', {
        processId: process.pid,
        rootUri: SourceKitLSP.uri(rootPath),
        workspaceFolders: [{ uri: SourceKitLSP.uri(rootPath), name: 'workspace' }],
        capabilities: {
          textDocument: {
            synchronization: { didSave: true, dynamicRegistration: false },
            completion: {
              completionItem: { snippetSupport: true, documentationFormat: ['markdown', 'plaintext'] }
            },
            hover: { contentFormat: ['markdown', 'plaintext'] },
            publishDiagnostics: { relatedInformation: true },
            documentSymbol: { hierarchicalDocumentSymbolSupport: true },
            definition: {}
          },
          workspace: { workspaceFolders: true, configuration: true },
          window: { workDoneProgress: true }
        },
        initializationOptions: {}
      })
      conn.sendNotification('initialized', {})
      this.setState('running')
      // Replay documents opened while the server was starting (or before a restart).
      for (const [path, text] of this.openDocs) {
        this.versions.set(path, 1)
        conn.sendNotification('textDocument/didOpen', {
          textDocument: { uri: SourceKitLSP.uri(path), languageId: 'swift', version: 1, text }
        })
      }
    } catch (e) {
      this.setState('error', (e as Error).message)
    }
  }

  async stop(): Promise<void> {
    const conn = this.conn
    const proc = this.proc
    this.conn = undefined
    this.proc = undefined
    this.versions.clear()
    if (conn) {
      try {
        // The request may reject after the race settles (stream closed); swallow that too.
        const shutdown = conn.sendRequest('shutdown').catch(() => undefined)
        await Promise.race([shutdown, new Promise((r) => setTimeout(r, 1500))])
        if (proc && !proc.killed && proc.exitCode === null) await conn.sendNotification('exit').catch(() => undefined)
      } catch {
        /* ignore */
      }
      conn.dispose()
    }
    if (proc && !proc.killed) proc.kill()
    if (this.state !== 'stopped') this.setState('stopped')
  }

  private get live(): MessageConnection | undefined {
    return this.state === 'running' ? this.conn : undefined
  }

  didOpen(path: string, text: string): void {
    this.openDocs.set(path, text)
    this.versions.set(path, 1)
    this.live?.sendNotification('textDocument/didOpen', {
      textDocument: { uri: SourceKitLSP.uri(path), languageId: 'swift', version: 1, text }
    })
  }

  didChange(path: string, text: string): void {
    this.openDocs.set(path, text)
    const v = (this.versions.get(path) ?? 1) + 1
    this.versions.set(path, v)
    this.live?.sendNotification('textDocument/didChange', {
      textDocument: { uri: SourceKitLSP.uri(path), version: v },
      contentChanges: [{ text }]
    })
  }

  didSave(path: string, text: string): void {
    this.live?.sendNotification('textDocument/didSave', { textDocument: { uri: SourceKitLSP.uri(path) }, text })
  }

  didClose(path: string): void {
    this.openDocs.delete(path)
    this.versions.delete(path)
    this.live?.sendNotification('textDocument/didClose', { textDocument: { uri: SourceKitLSP.uri(path) } })
  }

  async completion(path: string, position: LspPosition): Promise<LspCompletionItem[]> {
    const c = this.live
    if (!c) return []
    try {
      const r = (await c.sendRequest('textDocument/completion', {
        textDocument: { uri: SourceKitLSP.uri(path) },
        position
      })) as LspCompletionItem[] | { items: LspCompletionItem[] } | null
      if (!r) return []
      return Array.isArray(r) ? r : r.items
    } catch {
      return []
    }
  }

  async hover(path: string, position: LspPosition): Promise<LspHover | null> {
    const c = this.live
    if (!c) return null
    try {
      return (await c.sendRequest('textDocument/hover', {
        textDocument: { uri: SourceKitLSP.uri(path) },
        position
      })) as LspHover | null
    } catch {
      return null
    }
  }

  async definition(path: string, position: LspPosition): Promise<LspLocation[]> {
    const c = this.live
    if (!c) return []
    try {
      const r = (await c.sendRequest('textDocument/definition', {
        textDocument: { uri: SourceKitLSP.uri(path) },
        position
      })) as LspLocation | LspLocation[] | null
      if (!r) return []
      return Array.isArray(r) ? r : [r]
    } catch {
      return []
    }
  }

  async documentSymbols(path: string): Promise<LspDocumentSymbol[]> {
    const c = this.live
    if (!c) return []
    try {
      const r = (await c.sendRequest('textDocument/documentSymbol', {
        textDocument: { uri: SourceKitLSP.uri(path) }
      })) as LspDocumentSymbol[] | null
      return r ?? []
    } catch {
      return []
    }
  }
}
