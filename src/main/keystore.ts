import { spawn } from 'child_process'
import { randomBytes } from 'crypto'
import { existsSync, promises as fs } from 'fs'
import { homedir, userInfo } from 'os'
import { join } from 'path'
import { app, safeStorage } from 'electron'

/**
 * F-Code's SSH private key and pinned host keys.
 *
 *  - The key file is locked to the current user (icacls on Windows, chmod 0600 elsewhere) and every connect is
 *    refused while anyone else can read it (`assertKeyAcl`, fail-closed).
 *  - Optionally the key carries a random passphrase that lives only in the OS credential store (Electron
 *    `safeStorage`: DPAPI on Windows) and is handed to ssh-agent with `ssh-add`. This needs the Windows
 *    "OpenSSH Authentication Agent" service to be running; if it isn't, nothing is changed and the key stays
 *    ACL-protected only.
 *  - Host keys are pinned in our own known_hosts file; a host that isn't pinned is never connected to.
 */

const isWin = process.platform === 'win32'

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

function run(cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv; input?: string; timeoutMs?: number } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    let p
    try {
      p = spawn(cmd, args, { windowsHide: true, env: opts.env ? { ...process.env, ...opts.env } : process.env })
    } catch (e) {
      return resolve({ code: -1, stdout: '', stderr: (e as Error).message })
    }
    const out: Buffer[] = []
    const err: Buffer[] = []
    const t = setTimeout(() => p.kill(), opts.timeoutMs ?? 20000)
    p.stdout.on('data', (b: Buffer) => out.push(b))
    p.stderr.on('data', (b: Buffer) => err.push(b))
    p.stdin.on('error', () => undefined)
    p.stdin.end(opts.input ?? '')
    p.on('error', (e) => {
      clearTimeout(t)
      resolve({ code: -1, stdout: '', stderr: e.message })
    })
    p.on('close', (code) => {
      clearTimeout(t)
      resolve({ code: code ?? -1, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') })
    })
  })
}

export function keyPath(): string {
  return join(homedir(), '.ssh', 'xcode_ed25519')
}
export function pinnedHostsPath(): string {
  return join(homedir(), '.ssh', 'tomcode_known_hosts')
}

// -- key file permissions (CM-1) ------------------------------------------------

function currentPrincipal(): string {
  const domain = process.env.USERDOMAIN || process.env.COMPUTERNAME || ''
  return domain ? `${domain}\\${userInfo().username}` : userInfo().username
}

/** Principals icacls prints for `key` (first line carries the path, the rest are indented), deny entries skipped. */
function aclPrincipals(icaclsOut: string, key: string): string[] {
  const out: string[] = []
  for (const raw of icaclsOut.split(/\r?\n/)) {
    let line = raw.trim()
    if (!line || /Successfully processed|Failed processing/i.test(line)) continue
    if (line.toLowerCase().startsWith(key.toLowerCase())) line = line.slice(key.length).trim()
    const i = line.indexOf(':(')
    if (i < 0 || /\(DENY\)/.test(line)) continue
    out.push(line.slice(0, i).trim())
  }
  return out
}

function allowedPrincipals(): string[] {
  return ['nt authority\\system', 'builtin\\administrators', 's-1-5-18', 's-1-5-32-544', currentPrincipal().toLowerCase(), userInfo().username.toLowerCase()]
}

/** Restrict the key to the current user (read-only) and drop every other principal. */
export async function secureKeyAcl(key = keyPath()): Promise<void> {
  if (!existsSync(key)) return
  if (!isWin) {
    await fs.chmod(join(homedir(), '.ssh'), 0o700).catch(() => undefined)
    await fs.chmod(key, 0o600)
    return
  }
  const r = await run('icacls', [key, '/inheritance:r', '/grant:r', `${currentPrincipal()}:(R)`])
  if (r.code !== 0) throw new Error(`icacls could not restrict ${key}: ${(r.stderr || r.stdout).trim()}`)
  const now = await run('icacls', [key])
  const allowed = allowedPrincipals()
  for (const p of aclPrincipals(now.stdout, key)) {
    if (!allowed.includes(p.toLowerCase())) await run('icacls', [key, '/remove', p])
  }
}

/** Fail closed: throw unless only the current user (plus SYSTEM / Administrators on Windows) can access the key. */
export async function assertKeyAcl(key = keyPath()): Promise<void> {
  if (!existsSync(key)) return
  if (!isWin) {
    const st = await fs.stat(key)
    if ((st.mode & 0o077) !== 0) throw new Error(`SSH key ${key} is accessible by other users (mode ${(st.mode & 0o777).toString(8)}); refusing to use it.`)
    return
  }
  const r = await run('icacls', [key])
  if (r.code !== 0) throw new Error(`Couldn't read the permissions of ${key}: ${(r.stderr || r.stdout).trim()}; refusing to use it.`)
  const allowed = allowedPrincipals()
  const extra = aclPrincipals(r.stdout, key).filter((p) => !allowed.includes(p.toLowerCase()))
  if (extra.length) {
    throw new Error(`SSH key ${key} is accessible by ${extra.join(', ')}; refusing to use it. Fix with: icacls "${key}" /inheritance:r /grant:r "${currentPrincipal()}:(R)"`)
  }
}

// -- passphrase + ssh-agent (CM-1) ------------------------------------------------

function passphraseFile(): string {
  return join(app.getPath('userData'), 'ssh-key-passphrase.bin')
}
function askpassFile(): string {
  return join(app.getPath('userData'), isWin ? 'askpass.cmd' : 'askpass.sh')
}

async function storePassphrase(p: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('The OS credential store is not available')
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(passphraseFile(), safeStorage.encryptString(p), { mode: 0o600 })
}
async function loadPassphrase(): Promise<string | undefined> {
  try {
    return safeStorage.decryptString(await fs.readFile(passphraseFile()))
  } catch {
    return undefined
  }
}

/** ssh-add -l: 0 = agent has keys, 1 = agent running with none, 2 = no agent reachable. */
export async function agentAvailable(): Promise<boolean> {
  const r = await run('ssh-add', ['-l'])
  return r.code === 0 || r.code === 1
}

export async function keyIsEncrypted(key = keyPath()): Promise<boolean> {
  const r = await run('ssh-keygen', ['-y', '-P', '', '-f', key])
  return r.code !== 0
}

async function agentHasKey(key: string): Promise<boolean> {
  const fp = await run('ssh-keygen', ['-lf', `${key}.pub`])
  const want = /SHA256:\S+/.exec(fp.stdout)?.[0]
  if (!want) return false
  const l = await run('ssh-add', ['-l'])
  return l.stdout.includes(want)
}

async function addToAgent(key: string, pass: string): Promise<RunResult> {
  // The passphrase travels in the child's environment only (never on disk, never on the command line);
  // the askpass helper just prints it.
  const helper = askpassFile()
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(helper, isWin ? '@echo off\r\necho %TOMCODE_PASS%\r\n' : '#!/bin/sh\nprintf "%s\\n" "$TOMCODE_PASS"\n', { mode: 0o700 })
  return run('ssh-add', [key], { env: { SSH_ASKPASS: helper, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: process.env.DISPLAY ?? 'tomcode:0', TOMCODE_PASS: pass } })
}

/** If the key is passphrase-protected, make sure ssh-agent holds it. Returns what ssh will be able to do. */
export async function ensureKeyLoaded(key = keyPath()): Promise<'unprotected' | 'loaded' | 'locked'> {
  if (!(await keyIsEncrypted(key))) return 'unprotected'
  if (await agentHasKey(key)) return 'loaded'
  const pass = await loadPassphrase()
  if (!pass || !(await agentAvailable())) return 'locked'
  const r = await addToAgent(key, pass)
  return r.code === 0 ? 'loaded' : 'locked'
}

/**
 * Put a random passphrase on the key (ssh-keygen -p, 100 KDF rounds), keep it in the credential store, and load the
 * key into ssh-agent with ssh-add. Does nothing (and says why) unless ssh-agent is running; if loading fails the
 * change is rolled back so the key is never left unusable.
 */
export async function protectKey(key = keyPath()): Promise<{ ok: boolean; message: string }> {
  if (!existsSync(key)) return { ok: false, message: 'There is no SSH key yet.' }
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, message: 'The OS credential store is not available, so no passphrase can be kept safely.' }
  if (!(await agentAvailable())) {
    return { ok: false, message: 'ssh-agent is not running (Windows service "OpenSSH Authentication Agent" is stopped). The key stays protected by file permissions only.' }
  }
  if (await keyIsEncrypted(key)) {
    const loaded = await ensureKeyLoaded(key)
    return { ok: loaded === 'loaded', message: loaded === 'loaded' ? 'The key already has a passphrase and is loaded in ssh-agent.' : 'The key has a passphrase but could not be loaded into ssh-agent.' }
  }
  const pass = randomBytes(32).toString('base64url')
  // ssh-keygen -p takes the new passphrase from argv only (it reads the terminal otherwise); it is briefly visible
  // to this user's own processes, which could read the key file anyway.
  const set = await run('ssh-keygen', ['-p', '-a', '100', '-f', key, '-P', '', '-N', pass, '-q'])
  if (set.code !== 0) return { ok: false, message: `ssh-keygen could not set a passphrase: ${set.stderr.trim()}` }
  try {
    await storePassphrase(pass)
    const add = await addToAgent(key, pass)
    if (add.code !== 0) throw new Error(add.stderr.trim() || `ssh-add exited ${add.code}`)
  } catch (e) {
    await run('ssh-keygen', ['-p', '-f', key, '-P', pass, '-N', '', '-q']) // roll back: never leave a key we can't unlock
    await fs.rm(passphraseFile(), { force: true })
    return { ok: false, message: `Rolled back (key unchanged): ${(e as Error).message}` }
  }
  await secureKeyAcl(key)
  return { ok: true, message: 'The key now has a passphrase (kept in the OS credential store) and is loaded in ssh-agent.' }
}

/** Create F-Code's own ed25519 key if needed (locked down, and passphrase-protected when ssh-agent is available). */
export async function ensureKey(): Promise<string> {
  const key = keyPath()
  if (!existsSync(key)) {
    await fs.mkdir(join(homedir(), '.ssh'), { recursive: true })
    const r = await run('ssh-keygen', ['-t', 'ed25519', '-a', '100', '-N', '', '-C', 'x-code', '-f', key, '-q'])
    if (r.code !== 0) throw new Error(`ssh-keygen exited ${r.code}: ${r.stderr.trim()}`)
    await secureKeyAcl(key)
    await protectKey(key).catch(() => undefined) // best effort: only does anything when ssh-agent is running
  }
  return (await fs.readFile(`${key}.pub`, 'utf8')).trim()
}

// -- host keys (SF-5) -------------------------------------------------------------

export interface ScannedHostKey {
  lines: string[]
  fingerprints: string[]
}

export async function isHostPinned(alias: string): Promise<boolean> {
  if (!existsSync(pinnedHostsPath())) return false
  const r = await run('ssh-keygen', ['-F', alias, '-f', pinnedHostsPath()])
  return r.code === 0 && /ssh-|ecdsa-/.test(r.stdout)
}

/** Key lines for `alias` already trusted in the user's default known_hosts (from before pinning existed). */
async function existingTrustedLines(alias: string, port: number): Promise<string[]> {
  const defaults = join(homedir(), '.ssh', 'known_hosts')
  if (!existsSync(defaults)) return []
  const out: string[] = []
  for (const name of port === 22 ? [alias] : [alias, `[${alias}]:${port}`]) {
    const r = await run('ssh-keygen', ['-F', name, '-f', defaults])
    for (const l of r.stdout.split(/\r?\n/)) {
      const f = l.trim().split(/\s+/)
      if (f.length >= 3 && !l.startsWith('#') && /^(ssh-|ecdsa-|sk-)/.test(f[1])) out.push(`${alias} ${f[1]} ${f[2]}`)
    }
  }
  return out
}

async function appendPinned(lines: string[]): Promise<void> {
  await fs.mkdir(join(homedir(), '.ssh'), { recursive: true })
  await fs.appendFile(pinnedHostsPath(), lines.join('\n') + '\n', { mode: 0o600 })
}

/** Pin `alias` from entries the user already trusted. Returns true if the host is pinned afterwards. */
export async function importTrustedHost(alias: string, port: number): Promise<boolean> {
  if (await isHostPinned(alias)) return true
  const lines = await existingTrustedLines(alias, port)
  if (!lines.length) return false
  await appendPinned([...new Set(lines)])
  return true
}

/** Fetch the host's public keys (ssh-keyscan) so the user can compare their fingerprint with the Mac's. */
export async function scanHostKey(alias: string, target: string, port: number): Promise<ScannedHostKey> {
  const r = await run('ssh-keyscan', ['-T', '8', '-t', 'ed25519,ecdsa,rsa', '-p', String(port), target], { timeoutMs: 20000 })
  const lines = r.stdout
    .split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/))
    .filter((f) => f.length >= 3 && /^(ssh-|ecdsa-)/.test(f[1]))
    .map((f) => `${alias} ${f[1]} ${f[2]}`)
  if (!lines.length) throw new Error(`Couldn't read a host key from ${target}:${port}: ${r.stderr.trim() || 'no response'}`)
  const fingerprints: string[] = []
  for (const l of lines) {
    const fp = await run('ssh-keygen', ['-lf', '-'], { input: l + '\n' })
    const m = /(\d+) (SHA256:\S+).*\((\w+)\)/.exec(fp.stdout)
    if (m) fingerprints.push(`${m[3]} ${m[2]}`)
  }
  return { lines, fingerprints }
}

/** Pin exactly the keys the user was shown (not a fresh scan, which could differ). */
export async function pinHostKey(scanned: ScannedHostKey): Promise<void> {
  await appendPinned(scanned.lines)
}
