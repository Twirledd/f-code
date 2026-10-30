import { spawn, ChildProcess, ChildProcessWithoutNullStreams } from 'child_process'
import { EventEmitter } from 'events'
import { existsSync, promises as fs } from 'fs'
import { promises as dns } from 'dns'
import { basename, join } from 'path'
import { app } from 'electron'
import type { BuildStatus, ConsoleChunk, Diagnostic, MacConnection, MacRunStatus, MacStatus, Severity, SimDevice } from '@shared/types'
import { WdaClient, PortTakenError, readMjpeg, waitPort, withFreePorts } from './wda'
import { startAuthProxy, newSessionToken, type AuthProxy } from './auth-proxy'
import * as keystore from './keystore'
import {
  assertAppearance, assertBundleId, assertConnection, assertContentSize, assertProduct, assertUdid, q, xmlEscape,
  type ConnectionLike
} from './validate'

/** Location of a helper script shipped with the app (dev checkout or packaged resources). */
function helperPath(name: string): string {
  const candidates = [join(app.getAppPath(), 'scripts', 'sim-headless', name), join(process.resourcesPath ?? '', 'sim-headless', name)]
  return candidates.find((p) => existsSync(p)) ?? candidates[1]
}

/**
 * Drives a Mac over SSH: syncs the open package there, builds it with `xcodebuild`
 * for the iOS Simulator, wraps the executable in an .app bundle, installs and
 * launches it with `simctl`, and streams the Simulator screen back as JPEG frames.
 *
 * Only OpenSSH (shipped with Windows) and bsdtar (also shipped) are needed on this
 * side. On the Mac side: Remote Login, Xcode, and optionally facebook/idb for input.
 */
export class MacBridge extends EventEmitter {
  private conn: MacConnection | undefined
  private status: MacStatus = { state: 'unconfigured' }
  private runStatus: MacRunStatus = { state: 'idle', message: '' }
  private screenProc: ChildProcessWithoutNullStreams | undefined
  private active: { udid: string; bundleId: string } | undefined
  private sims = new Map<string, SimDevice>()
  /** Live touch/typing session (WebDriverAgent, through an SSH tunnel) for the current run. */
  private wda: { client: WdaClient; video?: { close: () => void }; proxies: AuthProxy[] } | undefined
  private helperPushed = false
  private wdaIdleTimer: NodeJS.Timeout | undefined
  private setupProc: ChildProcess | undefined

  // -- status -------------------------------------------------------------

  get current(): MacStatus {
    return this.status
  }
  get connection(): MacConnection | undefined {
    return this.conn
  }

  private setStatus(s: MacStatus): void {
    this.status = s
    this.emit('status', s)
  }
  private setRun(patch: Partial<MacRunStatus>): void {
    this.runStatus = { ...this.runStatus, ...patch }
    this.emit('run', this.runStatus)
  }
  private log(stream: ConsoleChunk['stream'], text: string): void {
    this.emit('console', { stream, text })
  }

  // -- key management -------------------------------------------------------

  static keyPath(): string {
    return keystore.keyPath()
  }

  /** Create F-Code's own ed25519 key if needed (locked to this user) and return the public key line. */
  static ensureKey(): Promise<string> {
    return keystore.ensureKey()
  }

  /** Put a passphrase on the key (kept in the OS credential store) and load it into ssh-agent, if ssh-agent is running. */
  static protectKey(): Promise<{ ok: boolean; message: string }> {
    return keystore.protectKey()
  }

  // -- ssh plumbing ---------------------------------------------------------

  configure(conn: MacConnection | undefined): void {
    this.conn = conn ? assertConnection(conn) : undefined
    this.pendingHostKey = undefined
    if (!conn) this.setStatus({ state: 'unconfigured' })
  }

  /** Address ssh dials: the host name, or the last-known IP when the name can't be resolved. */
  private target: string | undefined
  /** Host key shown to the user and waiting for their "Trust" click; pinned exactly as shown. */
  private pendingHostKey: keystore.ScannedHostKey | undefined

  /** Name the host key is stored under: always the host name (never the IP we happened to dial). */
  private hostAlias(): string {
    return this.conn!.host.toLowerCase()
  }

  /**
   * Fixed-shape ssh argument list. Every value comes from a validated MacConnection and is passed as its own argv
   * element (no shell on this side), and the host key must already be pinned (StrictHostKeyChecking=yes).
   */
  private sshArgs(): string[] {
    const c = assertConnection(this.conn!)
    const via = this.target && this.target !== c.host
    return [
      '-i', MacBridge.keyPath(),
      '-o', 'IdentitiesOnly=yes',
      '-o', 'BatchMode=yes',
      '-o', 'PasswordAuthentication=no',
      '-o', 'ConnectTimeout=8',
      // Dialling an IP still checks the key pinned for the host name (HostKeyAlias). Never trust-on-first-use:
      // an unpinned host is refused, and pinning is an explicit step (see connect / trustHostKey).
      '-o', 'StrictHostKeyChecking=yes',
      '-o', `UserKnownHostsFile=${keystore.pinnedHostsPath().replace(/\\/g, '/')}`,
      '-o', `HostKeyAlias=${this.hostAlias()}`,
      '-o', 'ServerAliveInterval=15',
      '-p', String(c.port ?? 22),
      `${c.user}@${via ? this.target : c.host}`
    ]
  }

  /** Resolve the host; remember the IP on success, fall back to the remembered one on failure. */
  private async resolveTarget(): Promise<void> {
    const c = this.conn!
    this.target = c.host
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(c.host)) return
    try {
      const { address } = await dnsLookup(c.host, { family: 4 })
      if (address !== c.lastIp) {
        this.conn = { ...c, lastIp: address }
        this.emit('resolved', address)
      }
    } catch {
      if (c.lastIp) {
        this.target = c.lastIp
        this.log('system', `Couldn't resolve ${c.host}; using last known address ${c.lastIp}.\n`)
      }
    }
  }

  /** Run a remote shell command, collecting output. */
  private exec(cmd: string, timeoutMs = 60000, input?: string): Promise<{ code: number; stdout: string; stderr: string }> {
    if (!this.conn) return Promise.reject(new Error('Mac not configured'))
    return new Promise((resolve, reject) => {
      const p = spawn('ssh', [...this.sshArgs(), cmd], { windowsHide: true })
      p.stdin.on('error', () => undefined)
      if (input !== undefined) p.stdin.end(input)
      const out: Buffer[] = []
      const err: Buffer[] = []
      const t = setTimeout(() => {
        p.kill()
        reject(new Error('SSH command timed out'))
      }, timeoutMs)
      p.stdout.on('data', (b: Buffer) => out.push(b))
      p.stderr.on('data', (b: Buffer) => err.push(b))
      p.on('error', (e) => {
        clearTimeout(t)
        reject(e)
      })
      p.on('close', (code) => {
        clearTimeout(t)
        resolve({ code: code ?? -1, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') })
      })
    })
  }

  /** Run a remote command streaming its output to the console; resolves with the exit code. */
  private stream(cmd: string, onLine?: (line: string) => void): { proc: ChildProcessWithoutNullStreams; done: Promise<number> } {
    const proc = this.track(spawn('ssh', [...this.sshArgs(), cmd], { windowsHide: true }))
    proc.stdin.on('error', () => undefined)
    let buf = ''
    const pump = (chunk: Buffer, which: 'stdout' | 'stderr'): void => {
      const text = chunk.toString('utf8')
      this.log(which, text)
      if (!onLine) return
      buf += text
      const parts = buf.split(/\r?\n/)
      buf = parts.pop() ?? ''
      parts.forEach(onLine)
    }
    proc.stdout.on('data', (c: Buffer) => pump(c, 'stdout'))
    proc.stderr.on('data', (c: Buffer) => pump(c, 'stderr'))
    const done = new Promise<number>((resolve) => {
      proc.on('error', (e) => {
        this.log('system', `ssh failed: ${e.message}\n`)
        resolve(-1)
      })
      proc.on('close', (code) => {
        if (buf && onLine) onLine(buf)
        resolve(code ?? -1)
      })
    })
    return { proc, done }
  }

  // -- connection -----------------------------------------------------------

  async connect(): Promise<MacStatus> {
    if (!this.conn?.host || !this.conn.user) {
      this.setStatus({ state: 'unconfigured' })
      return this.status
    }
    this.setStatus({ state: 'connecting', detail: `Connecting to ${this.conn.host}…`, input: this.status.input })
    this.helperPushed = false
    await this.resolveTarget()
    try {
      // Fail closed before any ssh process is started: key readable only by us, host key pinned, key loadable.
      try {
        await keystore.secureKeyAcl()
        await keystore.assertKeyAcl()
      } catch (e) {
        this.setStatus({ state: 'error', detail: (e as Error).message })
        return this.status
      }
      if (!(await this.ensureHostPinned())) return this.status
      const loaded = await keystore.ensureKeyLoaded()
      if (loaded === 'locked') {
        this.setStatus({ state: 'error', detail: "The SSH key is passphrase-protected but ssh-agent doesn't have it. Start the OpenSSH Authentication Agent service and click Reconnect." })
        return this.status
      }
      const probe = [
        'echo "HOST=$(hostname -s)"',
        'echo "MACOS=$(sw_vers -productVersion 2>/dev/null)"',
        'echo "XCODE=$(xcodebuild -version 2>/dev/null | head -1)"',
        'echo "IDB=$(command -v idb >/dev/null 2>&1 && echo yes || echo no)"',
        'echo "WDA=$(ls ~/tomcode-sim/wda-build/Build/Products/*.xctestrun >/dev/null 2>&1 && echo yes || echo no)"',
        'echo "PERSIST=$(cat ~/tomcode-sim/persistent.udid 2>/dev/null)"',
        'echo "KEEPALIVE=$(pgrep -f mac_keepalive.sh >/dev/null 2>&1 && echo yes || echo no)"'
      ].join('; ')
      const r = await this.exec(probe, 20000)
      if (r.code !== 0) {
        const msg = r.stderr.trim().split('\n').pop() ?? `ssh exited ${r.code}`
        this.setStatus({ state: 'error', detail: friendlySshError(msg) })
        return this.status
      }
      const get = (k: string): string | undefined => new RegExp(`^${k}=(.*)$`, 'm').exec(r.stdout)?.[1].trim() || undefined
      const xcode = get('XCODE')
      this.setStatus({
        state: xcode ? 'ready' : 'error',
        hostname: get('HOST'),
        macOS: get('MACOS'),
        xcode,
        idb: get('IDB') === 'yes',
        input: this.status.input === 'building' ? 'building' : get('WDA') === 'yes' ? 'ready' : 'missing',
        persistent: get('PERSIST') ? { udid: get('PERSIST')!, running: get('KEEPALIVE') === 'yes' } : undefined,
        detail: xcode ? undefined : 'Xcode not found on the Mac. Install it from the App Store and run `sudo xcode-select -s /Applications/Xcode.app`.'
      })
      // Put the helper scripts on the Mac now, so the commands Settings shows (always-on setup etc.) exist there.
      if (xcode) void this.ensureHelper().catch(() => undefined)
    } catch (e) {
      this.setStatus({ state: 'error', detail: (e as Error).message })
    }
    return this.status
  }

  /**
   * The Mac's host key must be pinned before we dial it. Keys the user already trusted (from the plain known_hosts)
   * are carried over; otherwise we fetch the key, show its fingerprint and wait for an explicit "Trust" click.
   */
  private async ensureHostPinned(): Promise<boolean> {
    const alias = this.hostAlias()
    const port = this.conn!.port ?? 22
    if (await keystore.importTrustedHost(alias, port)) return true
    try {
      this.pendingHostKey = await keystore.scanHostKey(alias, this.target ?? this.conn!.host, port)
    } catch (e) {
      this.setStatus({ state: 'error', detail: friendlySshError((e as Error).message) })
      return false
    }
    this.setStatus({
      state: 'error',
      detail: `F-Code has not seen ${this.conn!.host} before. Compare these fingerprints with the Mac (Terminal there: ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub), then click Trust.`,
      hostKey: { host: this.conn!.host, fingerprints: this.pendingHostKey.fingerprints }
    })
    return false
  }

  /** The user compared the fingerprints and clicked Trust: pin exactly the keys they were shown, then connect. */
  async trustHostKey(): Promise<MacStatus> {
    if (!this.pendingHostKey) return this.status
    await keystore.pinHostKey(this.pendingHostKey)
    this.pendingHostKey = undefined
    return this.connect()
  }

  async listSimulators(): Promise<SimDevice[]> {
    if (this.status.state !== 'ready') return []
    const r = await this.exec('xcrun simctl list devices available -j', 30000)
    if (r.code !== 0) return []
    try {
      const json = JSON.parse(r.stdout) as { devices: Record<string, { udid: string; name: string; state: string; isAvailable: boolean }[]> }
      const out: SimDevice[] = []
      for (const [rt, devs] of Object.entries(json.devices)) {
        // com.apple.CoreSimulator.SimRuntime.iOS-18-1 -> iOS 18.1
        const m = /SimRuntime\.(\w+)-(\d+)-(\d+)/.exec(rt)
        if (!m || m[1] !== 'iOS') continue
        const runtime = `${m[1]} ${m[2]}.${m[3]}`
        for (const d of devs) if (d.isAvailable) out.push({ udid: d.udid, name: d.name, runtime, state: d.state })
      }
      this.sims = new Map(out.map((d) => [d.udid, d]))
      // Newest runtime first, iPhones before iPads, Pro models first like Xcode's picker.
      return out.sort((a, b) => b.runtime.localeCompare(a.runtime, undefined, { numeric: true }) || rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
    } catch {
      return []
    }
  }

  // -- sync / build / run ---------------------------------------------------

  private remoteDir(root: string): string {
    const base = (this.conn?.remoteRoot ?? '~/TomCodeProjects').replace(/\/+$/, '')
    return `${base}/${basename(root)}`
  }

  /** Copy the package to the Mac with tar piped over ssh (no rsync on Windows). */
  private async sync(root: string): Promise<boolean> {
    const dir = this.remoteDir(root)
    this.setRun({ state: 'syncing', message: 'Syncing project to Mac…' })
    this.log('system', `$ tar | ssh ${this.conn!.host} "tar -x -C ${dir}"\n`)
    const mk = await this.exec(`mkdir -p ${q(dir)}`)
    if (mk.code !== 0) {
      this.log('system', mk.stderr)
      return false
    }
    return new Promise<boolean>((resolve) => {
      const tar = this.track(spawn('tar', ['-c', '-f', '-', '--exclude=.build', '--exclude=.git', '--exclude=.swiftpm', '--exclude=.index-build', '--exclude=DerivedData', '-C', root, '.'], { windowsHide: true }))
      const ssh = this.track(spawn('ssh', [...this.sshArgs(), `tar -x -f - -C ${q(dir)}`], { windowsHide: true }))
      tar.stdout.pipe(ssh.stdin)
      // Killing one end must not leave the other hanging on a broken pipe.
      ssh.stdin.on('error', () => undefined)
      tar.stdout.on('error', () => undefined)
      tar.stderr.on('data', (c: Buffer) => this.log('stderr', c.toString('utf8')))
      ssh.stderr.on('data', (c: Buffer) => this.log('stderr', c.toString('utf8')))
      tar.on('error', (e) => this.log('system', `tar failed: ${e.message}\n`))
      ssh.on('error', (e) => {
        this.log('system', `ssh failed: ${e.message}\n`)
        resolve(false)
      })
      ssh.on('close', (code) => resolve(code === 0))
    })
  }

  // -- cancellation -----------------------------------------------------------

  /** Bumped by every stop()/new job; a job that sees it change after an await abandons quietly. */
  private gen = 0
  private procs = new Set<ChildProcess>()
  private job: { dir: string; product: string } | undefined

  private track<T extends ChildProcess>(p: T): T {
    this.procs.add(p)
    p.once('close', () => this.procs.delete(p))
    return p
  }

  /** Is a sync/build/install/run in flight? */
  private get inFlight(): boolean {
    return ['syncing', 'building', 'installing', 'running'].includes(this.runStatus.state)
  }

  /**
   * Build `product` for the Simulator with xcodebuild. Emits BuildStatus like SwiftPM does so
   * the toolbar and Issue navigator work unchanged; remote paths are mapped back to local ones.
   */
  async build(root: string, product: string, udid: string, action: 'build' | 'test' = 'build'): Promise<boolean> {
    assertProduct(product)
    assertUdid(udid)
    if (action !== 'build' && action !== 'test') throw new Error('Invalid action')
    const g = this.gen
    const dir = this.remoteDir(root)
    this.job = { dir, product }
    this.emitBuild({ phase: 'building', message: 'Syncing project to Mac…', diagnostics: [], startedAt: Date.now() })
    const synced = await this.sync(root)
    if (g !== this.gen) return false // stopped while syncing; stop() already reported it
    if (!synced) {
      this.setRun({ state: 'failed', message: 'Sync failed' })
      this.emitBuild({ phase: 'failed', message: 'Sync to Mac failed', diagnostics: [], finishedAt: Date.now() })
      return false
    }
    this.setRun({ state: 'building', message: `${action === 'test' ? 'Testing' : 'Building'} ${product} on ${this.status.hostname ?? 'Mac'}…` })
    this.emitBuild({ phase: 'building', message: `Building ${product} on Mac…`, diagnostics: [], startedAt: Date.now() })
    const cmd = `cd ${q(dir)} && xcodebuild -scheme ${q(product)} -destination ${q(`platform=iOS Simulator,id=${udid}`)} -derivedDataPath .build/xcode -configuration Debug CODE_SIGNING_ALLOWED=NO ${q(action)} 2>&1`
    this.log('system', `$ ${cmd}\n`)

    const diagnostics: Diagnostic[] = []
    const seen = new Set<string>()
    const remoteHome = `${dir}/`.replace(/^~\//, '') // paths come back absolute; match on the suffix
    const toLocal = (p: string): string => {
      const i = p.indexOf(remoteHome)
      if (i < 0) return p
      return join(root, p.slice(i + remoteHome.length).replace(/\//g, '\\'))
    }
    const { proc, done } = this.stream(cmd, (line) => {
      const d = /^(.+?\.swift):(\d+):(\d+):\s+(error|warning|note):\s+(.*)$/.exec(line.trim())
      if (!d || seen.has(line)) return
      seen.add(line)
      diagnostics.push({ file: toLocal(d[1]), line: Number(d[2]), column: Number(d[3]), severity: d[4] as Severity, message: d[5] })
      this.emitBuild({ phase: 'building', message: `Building ${product} on Mac…`, diagnostics: [...diagnostics] })
    })
    const code = await done
    if (g !== this.gen) return false // stopped; stop() already reported it
    void proc
    const errors = diagnostics.filter((d) => d.severity === 'error').length
    if (code === 0) {
      this.emitBuild({ phase: 'succeeded', message: action === 'test' ? 'Tests Succeeded (Mac)' : 'Build Succeeded (Mac)', diagnostics, finishedAt: Date.now() })
      return true
    }
    this.emitBuild({ phase: 'failed', message: errors ? `Build Failed — ${errors} error${errors > 1 ? 's' : ''}` : 'Build Failed (see console)', diagnostics, finishedAt: Date.now() })
    this.setRun({ state: 'failed', message: 'Build failed' })
    return false
  }

  private emitBuild(s: BuildStatus): void {
    this.emit('build', s)
  }

  /** Product ▸ Build with a Mac destination: sync and xcodebuild, but don't launch. */
  async buildOnly(root: string, product: string, udid: string): Promise<boolean> {
    assertProduct(product)
    assertUdid(udid)
    await this.stop()
    const g = this.gen
    const ok = await this.build(root, product, udid)
    if (ok && g === this.gen) this.setRun({ state: 'stopped', message: 'Build Succeeded' })
    return ok
  }

  /** Product ▸ Test with a Mac destination: sync and `xcodebuild test` on the simulator (never the local Windows toolchain). */
  async testOnly(root: string, scheme: string, udid: string): Promise<boolean> {
    assertProduct(scheme)
    assertUdid(udid)
    await this.stop()
    const g = this.gen
    const ok = await this.build(root, scheme, udid, 'test')
    if (g === this.gen) this.setRun({ state: ok ? 'stopped' : 'failed', message: ok ? 'Tests Succeeded' : 'Tests failed' })
    return ok
  }

  /** Build, bundle, install and launch on the given simulator; streams the app's console output. */
  async run(root: string, product: string, udid: string): Promise<boolean> {
    assertProduct(product)
    assertUdid(udid)
    await this.stop()
    const g = this.gen
    const ok = await this.build(root, product, udid)
    if (!ok || g !== this.gen) return false
    const dir = this.remoteDir(root)
    const bundleId = assertBundleId(`dev.fcode.${product.replace(/[^A-Za-z0-9-]/g, '-')}`)
    this.active = { udid, bundleId }
    const attached = this.attachedTo(udid)
    if (attached) this.log('system', 'Attached to the always-on simulator: nothing to boot.\n')
    this.setRun({ state: 'installing', message: attached ? 'Installing on the always-on Simulator…' : 'Installing on Simulator…', udid })

    // Xcode builds a package executable as a bare Mach-O; the Simulator wants an .app bundle.
    const plist = infoPlist(product, bundleId)
    const script = [
      'set -e',
      `cd ${q(dir)}`,
      'P=.build/xcode/Build/Products/Debug-iphonesimulator',
      `APP="$P"/${q(`${product}.app`)}`,
      'rm -rf "$APP" && mkdir -p "$APP"',
      `cp "$P"/${q(product)} "$APP"/${q(product)}`,
      `cat > "$APP/Info.plist" <<'PLIST'\n${plist}\nPLIST`,
      // Always-on Mac: its keep-alive already booted the simulator; booting here would only risk a cold-boot storm.
      ...(attached ? [] : [`xcrun simctl boot ${q(udid)} >/dev/null 2>&1 || true`, `xcrun simctl bootstatus ${q(udid)} -b >/dev/null 2>&1 || true`]),
      `xcrun simctl install ${q(udid)} "$APP"`,
      `echo ${q(`[f-code] launching ${bundleId}`)}`,
      `exec xcrun simctl launch --console --terminate-running-process ${q(udid)} ${q(bundleId)}`
    ].join('\n')

    const { proc, done } = this.stream(script, (line) => {
      if (line.startsWith('[f-code] launching')) {
        this.setRun({ state: 'running', message: `Running ${product} on ${this.simName(udid)}`, udid })
        this.emitBuild({ phase: 'running', message: `Running ${product} on Simulator`, diagnostics: [], startedAt: Date.now() })
        this.startScreen(udid) // view-only frames straight away; WebDriverAgent takes over when it is ready
        void this.startInput(udid, g)
      }
    })
    void proc
    void done.then((code) => {
      if (g !== this.gen) return // stopped by the user; stop() already reported it
      this.stopScreen()
      this.log('system', `\nProgram ended with exit code: ${code}\n`)
      this.setRun({ state: code === 0 ? 'stopped' : 'failed', message: code === 0 ? 'Finished running' : `Exited with code ${code}` })
      this.emitBuild({ phase: code === 0 ? 'succeeded' : 'failed', message: code === 0 ? 'Finished running' : `Exited with code ${code}`, diagnostics: [], finishedAt: Date.now() })
    })
    return true
  }

  private simName(udid: string): string {
    return this.sims.get(udid)?.name ?? 'Simulator'
  }

  // -- touch / typing / fast video (WebDriverAgent) ------------------------------

  /** True when the Mac runs its own always-on simulator for this device: attach to it, never boot or stop things. */
  private attachedTo(udid: string): boolean {
    const p = this.status.persistent
    return !!p?.running && p.udid === udid
  }

  /** Copy the helper scripts to the Mac (once per connection) so nothing depends on a manual copy. */
  private async ensureHelper(): Promise<void> {
    if (this.helperPushed) return
    for (const name of HELPERS) {
      const script = await fs.readFile(helperPath(name), 'utf8')
      const r = await this.exec(`mkdir -p ~/tomcode-sim && cat > ~/tomcode-sim/${name} && chmod +x ~/tomcode-sim/${name}`, 20000, script)
      if (r.code !== 0) throw new Error(`Couldn't copy ${name} to the Mac: ${r.stderr.trim()}`)
    }
    this.helperPushed = true
  }

  /** One-time: fetch and build WebDriverAgent on the Mac (about 10 minutes on an older one). */
  async setupInput(udid: string): Promise<boolean> {
    assertUdid(udid)
    if (this.status.state !== 'ready' || this.setupProc) return false
    try {
      await this.ensureHelper()
    } catch (e) {
      this.log('system', `${(e as Error).message}\n`)
      return false
    }
    this.setStatus({ ...this.status, input: 'building' })
    this.log('system', '\nSetting up touch input on the Mac (one time, roughly 10 minutes on an older Mac)…\n')
    const proc = spawn('ssh', [...this.sshArgs(), `bash ~/tomcode-sim/mac_wda.sh setup ${q(udid)}`], { windowsHide: true })
    this.setupProc = proc
    proc.stdin.on('error', () => undefined)
    proc.stdout.on('data', (c: Buffer) => this.log('stdout', c.toString('utf8')))
    proc.stderr.on('data', (c: Buffer) => this.log('stderr', c.toString('utf8')))
    return new Promise<boolean>((resolve) => {
      proc.on('error', () => resolve(false))
      proc.on('close', (code) => {
        this.setupProc = undefined
        const ok = code === 0
        this.setStatus({ ...this.status, input: ok ? 'ready' : 'missing' })
        this.log('system', ok ? 'Touch input is ready.\n' : 'Touch input setup failed (see the log above).\n')
        resolve(ok)
      })
    })
  }

  /**
   * Start WebDriverAgent in the Simulator, tunnel to it over SSH (localhost ports only), open a
   * session, and switch the video source from screenshots to its MJPEG stream. Any failure leaves
   * the view-only screenshot stream running.
   */
  private async startInput(udid: string, g: number): Promise<void> {
    if (this.status.input !== 'ready') {
      this.log('system', 'Touch input is not set up yet: Settings ▸ Mac ▸ Enable touch input.\n')
      return
    }
    clearTimeout(this.wdaIdleTimer)
    try {
      assertUdid(udid)
      await this.ensureHelper()
      // Always-on Mac: the agent is already running (a LaunchAgent keeps it up), so just wait for it; never
      // start, restart or stop it from here (that would fight the Mac's keep-alive). Otherwise start it ourselves.
      const started = this.attachedTo(udid)
        ? await this.exec(
            'n=0; until bash ~/tomcode-sim/mac_wda.sh status | grep -q ready || [ $n -ge 40 ]; do sleep 3; n=$((n+1)); done; ' +
              'bash ~/tomcode-sim/mac_wda.sh status | grep -q ready && echo READY || echo "the always-on agent is not ready: run bash ~/tomcode-sim/mac_persistent_sim.sh status on the Mac"',
            150000
          )
        : await this.exec(`bash ~/tomcode-sim/mac_wda.sh start ${q(udid)}`, 300000)
      if (g !== this.gen) return
      if (!/READY/.test(started.stdout)) throw new Error((started.stdout + started.stderr).trim() || 'WebDriverAgent did not start')

      // The tunnel's loopback ports are picked with freePort(), which is racy: another process can take one before ssh
      // binds it. ssh runs with ExitOnForwardFailure=yes, so a lost race shows up as an early exit and we pick again.
      const { tunnel, apiPort, videoPort } = await withFreePorts(2, async ([apiPort, videoPort]) => {
        const args = this.sshArgs()
        const target = args.pop()!
        const tunnel = this.track(
          spawn('ssh', ['-N', '-o', 'ExitOnForwardFailure=yes', '-L', `127.0.0.1:${apiPort}:127.0.0.1:8100`, '-L', `127.0.0.1:${videoPort}:127.0.0.1:9100`, ...args, target], { windowsHide: true })
        )
        tunnel.stdin.on('error', () => undefined)
        let stderr = ''
        tunnel.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')))
        const exited = new Promise<number>((r) => tunnel.once('close', (code) => r(code ?? -1)))
        const early = await Promise.race([exited, waitPort(apiPort, 15000).then(() => 'up' as const)])
        if (early !== 'up' || tunnel.exitCode !== null) {
          tunnel.kill()
          if (/address already in use|cannot listen|bind|Could not request local forwarding/i.test(stderr)) throw new PortTakenError(stderr.trim())
          throw new Error(stderr.trim() || 'the SSH tunnel to WebDriverAgent exited immediately')
        }
        tunnel.stderr.on('data', (c: Buffer) => this.log('stderr', c.toString('utf8')))
        return { tunnel, apiPort, videoPort }
      })
      if (g !== this.gen) return

      // Per-session bearer token + validating loopback proxies: the app talks to the proxies, never straight to the tunnel.
      const token = newSessionToken()
      const proxies = [await startAuthProxy(apiPort, token), await startAuthProxy(videoPort, token)]
      const closeProxies = (): void => proxies.forEach((p) => p.close())
      const client = new WdaClient(proxies[0].port, token)
      try {
        await client.createSession()
      } catch (e) {
        closeProxies()
        throw e
      }
      const points = await client.windowSize().catch((e) => {
        closeProxies()
        throw e
      })
      if (g !== this.gen) {
        closeProxies()
        void client.close()
        return
      }
      this.wda = { client, proxies }
      tunnel.once('close', () => {
        closeProxies()
        if (g === this.gen && this.wda?.client === client) {
          this.wda = undefined
          this.setRun({ input: false })
        }
      })
      this.setRun({ input: true, points })

      let first = true
      this.wda.video = readMjpeg(
        proxies[1].port,
        token,
        (jpeg) => {
          if (g !== this.gen) return
          if (first) {
            first = false
            this.stopScreen() // the faster stream is live: drop the screenshot loop
          }
          this.emit('frame', jpeg.toString('base64'))
        },
        () => {
          // Stream ended unexpectedly while still running: fall back to screenshots.
          if (g === this.gen && this.runStatus.state === 'running') this.startScreen(udid)
        }
      )
    } catch (e) {
      if (g === this.gen) this.log('system', `Touch input unavailable (${(e as Error).message}); the screen stays view-only.\n`)
    }
  }

  /** Close the touch session and stream. The WebDriverAgent runner is left running between runs. */
  private async stopInput(): Promise<void> {
    const w = this.wda
    clearTimeout(this.textTimer)
    this.pendingText = ''
    this.wda = undefined
    w?.video?.close()
    w?.proxies.forEach((p) => p.close())
    if (w) await Promise.race([w.client.close(), new Promise((r) => setTimeout(r, 1500))])
  }

  /** Stop the WebDriverAgent runner on the Mac (idle timeout / app quit). */
  private stopRunner(): void {
    if (this.conn && this.status.state === 'ready' && this.status.input === 'ready' && !this.status.persistent?.running) {
      void this.exec('bash ~/tomcode-sim/mac_wda.sh stop', 15000).catch(() => undefined)
    }
  }

  /** App is quitting: end every child process and ask the Mac to stop its runner. */
  shutdown(): void {
    clearTimeout(this.wdaIdleTimer)
    this.wda?.video?.close()
    this.wda?.proxies.forEach((p) => p.close())
    for (const p of [...this.procs]) p.kill()
    if (this.conn && this.status.state === 'ready' && !this.status.persistent?.running) {
      spawn('ssh', [...this.sshArgs(), 'bash ~/tomcode-sim/mac_wda.sh stop; true'], { windowsHide: true, detached: true, stdio: 'ignore' }).unref()
    }
  }

  /**
   * Cancel whatever stage is in flight (sync, xcodebuild, install, run): kill every local ssh/tar,
   * ask the Mac to drop the orphaned xcodebuild / app, and reset the status so the toolbar's
   * spinner stops and the UI is usable again.
   */
  async stop(): Promise<void> {
    const wasBusy = this.inFlight
    const hadInput = !!this.wda
    this.gen++
    this.stopScreen()
    await this.stopInput() // before killing the tunnel it talks through
    for (const p of [...this.procs]) p.kill()
    this.procs.clear()
    if ((hadInput || this.status.input === 'ready') && !this.status.persistent?.running) {
      // Keep the runner warm for quick re-runs, but don't leave it burning CPU on an idle server.
      // (Not with an always-on Mac: its keep-alive owns the runner.)
      clearTimeout(this.wdaIdleTimer)
      this.wdaIdleTimer = setTimeout(() => this.stopRunner(), 10 * 60 * 1000)
    }

    // Killing the local ssh client doesn't stop the remote command; clean up on the Mac (best effort).
    const cleanup: string[] = []
    if (this.job) cleanup.push(`pkill -f ${q(`xcodebuild -scheme ${this.job.product} `)} 2>/dev/null`)
    if (this.active) cleanup.push(`xcrun simctl terminate ${q(this.active.udid)} ${q(this.active.bundleId)} >/dev/null 2>&1`)
    if (cleanup.length && this.conn && this.status.state === 'ready') {
      void this.exec(`${cleanup.join('; ')}; true`, 10000).catch(() => undefined)
    }
    this.job = undefined
    this.active = undefined

    if (wasBusy || hadInput) this.setRun({ input: false })
    if (wasBusy) {
      this.log('system', '\nStopped by user.\n')
      this.setRun({ state: 'stopped', message: 'Stopped' })
      this.emitBuild({ phase: 'stopped', message: 'Stopped', diagnostics: [], finishedAt: Date.now() })
    }
  }

  // -- screen streaming -----------------------------------------------------

  /**
   * One long-lived ssh session runs a loop on the Mac that writes JPEG screenshots with a
   * length-prefixed header ("XCF <bytes>\n"), so each frame costs no new SSH handshake.
   */
  private startScreen(udid: string): void {
    assertUdid(udid)
    this.stopScreen()
    const loop = `while :; do f=$(mktemp /tmp/xcf.XXXXXX); xcrun simctl io ${q(udid)} screenshot --type=jpeg "$f" >/dev/null 2>&1; s=$(stat -f%z "$f"); printf 'XCF %s\\n' "$s"; cat "$f"; rm -f "$f"; sleep 0.12; done`
    const proc = this.track(spawn('ssh', [...this.sshArgs(), loop], { windowsHide: true }))
    proc.stdin.on('error', () => undefined)
    this.screenProc = proc
    let buf = Buffer.alloc(0)
    proc.stdout.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk])
      for (;;) {
        const nl = buf.indexOf(0x0a)
        if (nl < 0) return
        const header = buf.subarray(0, nl).toString('ascii')
        const m = /^XCF (\d+)$/.exec(header)
        if (!m) {
          buf = buf.subarray(nl + 1) // junk line — resync
          continue
        }
        const size = Number(m[1])
        if (buf.length < nl + 1 + size) return
        const frame = buf.subarray(nl + 1, nl + 1 + size)
        buf = buf.subarray(nl + 1 + size)
        if (size > 0) this.emit('frame', frame.toString('base64'))
      }
    })
    proc.on('close', () => {
      if (this.screenProc === proc) this.screenProc = undefined
    })
  }

  private stopScreen(): void {
    const p = this.screenProc
    this.screenProc = undefined
    p?.kill()
  }

  // -- input & environment (idb for input; simctl ui for appearance) -----------

  /**
   * Input is delivered strictly in order through one chain. WebDriverAgent does not preserve the
   * order of concurrent requests (typing "tomcode" arrived as "tcmeodo"), so nothing goes out in parallel.
   */
  private inputChain: Promise<void> = Promise.resolve()
  private pendingText = ''
  private textTimer: NodeJS.Timeout | undefined

  private enqueue(what: string, fn: (c: WdaClient) => Promise<unknown>): Promise<void> {
    const run = async (): Promise<void> => {
      const c = this.wda?.client
      if (!c) return // view-only: nothing to deliver the input to
      try {
        await fn(c)
      } catch (e) {
        this.log('stderr', `${what} failed: ${(e as Error).message}\n`)
      }
    }
    this.inputChain = this.inputChain.then(run)
    return this.inputChain
  }

  /** Send any buffered typing now, so a following tap/key can't overtake it. */
  private flushText(): void {
    clearTimeout(this.textTimer)
    const t = this.pendingText
    this.pendingText = ''
    if (t) void this.enqueue('Typing', (c) => c.keys([...t])) // spread = by code point, so emoji stay whole
  }

  /** Coordinates are in points (the Simulator's logical pixels), like WebDriverAgent expects. */
  tap(x: number, y: number): Promise<void> {
    this.flushText()
    return this.enqueue('Tap', (c) => c.tap(Math.round(x), Math.round(y)))
  }
  swipe(x1: number, y1: number, x2: number, y2: number, seconds = 0.3): Promise<void> {
    this.flushText()
    return this.enqueue('Swipe', (c) => c.swipe(Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), seconds))
  }
  /** Fast typing is merged into one request: characters typed within 30 ms of each other travel together. */
  text(s: string): Promise<void> {
    if (!this.wda) return Promise.resolve()
    this.pendingText += s
    clearTimeout(this.textTimer)
    this.textTimer = setTimeout(() => this.flushText(), 30)
    return this.inputChain
  }
  key(name: string): Promise<void> {
    const keys: Record<string, string> = { enter: '\n', tab: '\t', backspace: BACKSPACE }
    const k = keys[name]
    if (!k) return Promise.resolve()
    this.flushText()
    return this.enqueue('Key', (c) => c.keys([k]))
  }
  button(name: string): Promise<void> {
    this.flushText()
    return this.enqueue('Button', (c) => c.button(name))
  }
  async setAppearance(scheme: 'light' | 'dark'): Promise<void> {
    if (!this.active) return
    assertAppearance(scheme)
    await this.exec(`xcrun simctl ui ${q(this.active.udid)} appearance ${q(scheme)}`, 15000).catch(() => undefined)
  }
  async setContentSize(size: string): Promise<void> {
    if (!this.active) return
    assertContentSize(size)
    // simctl names: extra-small small medium large extra-large extra-extra-large extra-extra-extra-large accessibility-medium …
    const map: Record<string, string> = {
      xSmall: 'extra-small', small: 'small', medium: 'medium', large: 'large', xLarge: 'extra-large', xxLarge: 'extra-extra-large', xxxLarge: 'extra-extra-extra-large',
      accessibility1: 'accessibility-medium', accessibility3: 'accessibility-extra-large'
    }
    await this.exec(`xcrun simctl ui ${this.active.udid} content_size ${q(map[size] ?? 'large')}`, 15000).catch(() => undefined)
  }
}

// ---------------------------------------------------------------------------

const dnsLookup = (host: string, opts: { family: 4 }): Promise<{ address: string }> => dns.lookup(host, opts)

/** What WebDriverAgent's /wda/keys treats as the delete key (verified against iOS 17.2). */
const BACKSPACE = '\b'

/** Scripts copied to ~/tomcode-sim on the Mac (so the commands shown in Settings always exist there). */
const HELPERS = ['mac_wda.sh', 'mac_headless.sh', 'mac_keepalive.sh', 'mac_persistent_sim.sh', 'mac_sim_trim.sh', 'mac_server_mode.sh', 'mac_ultra_mode.sh']

function rank(name: string): number {
  if (/iPhone.*Pro Max/.test(name)) return 1
  if (/iPhone.*Pro/.test(name)) return 0
  if (/iPhone/.test(name)) return 2
  if (/iPad/.test(name)) return 3
  return 4
}

function friendlySshError(msg: string): string {
  if (/REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed|host key for .* has changed/i.test(msg)) {
    return "The Mac's host key does not match the one F-Code pinned. If you did not reinstall macOS or its SSH keys, someone may be impersonating it: do not connect. Otherwise delete its line from ~/.ssh/tomcode_known_hosts and reconnect."
  }
  if (/Permission denied/.test(msg)) return "The Mac refused F-Code's key. Add the public key to ~/.ssh/authorized_keys on the Mac (see instructions below)."
  if (/Could not resolve hostname|Name or service not known|nodename nor servname/.test(msg)) return 'Could not find that Mac on the network. Check the hostname (System Settings ▸ General ▸ Sharing) and that both machines are on the same network.'
  if (/Connection refused/.test(msg)) return 'The Mac is not accepting SSH. Turn on Remote Login in System Settings ▸ General ▸ Sharing.'
  if (/timed out|Operation timed out/.test(msg)) return 'Connection timed out. Is the Mac awake and on the same network?'
  return msg
}

function infoPlist(product: string, bundleId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleExecutable</key><string>${xmlEscape(product)}</string>
  <key>CFBundleIdentifier</key><string>${xmlEscape(bundleId)}</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>${xmlEscape(product)}</string>
  <key>CFBundleDisplayName</key><string>${xmlEscape(product)}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleSupportedPlatforms</key><array><string>iPhoneSimulator</string></array>
  <key>DTPlatformName</key><string>iphonesimulator</string>
  <key>DTSDKName</key><string>iphonesimulator</string>
  <key>LSRequiresIPhoneOS</key><true/>
  <key>MinimumOSVersion</key><string>17.0</string>
  <key>UIDeviceFamily</key><array><integer>1</integer><integer>2</integer></array>
  <key>UILaunchScreen</key><dict/>
  <key>UIApplicationSceneManifest</key><dict><key>UIApplicationSupportsMultipleScenes</key><true/></dict>
  <key>UISupportedInterfaceOrientations</key><array><string>UIInterfaceOrientationPortrait</string><string>UIInterfaceOrientationLandscapeLeft</string><string>UIInterfaceOrientationLandscapeRight</string></array>
</dict></plist>`
}
