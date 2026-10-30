/**
 * Boundary validation and escaping for everything that ends up in an ssh command line, a remote shell
 * command or a generated plist. Pure functions (no electron / fs) so they can be unit-tested directly.
 *
 * Rule of thumb: validate at the boundary (assert*), AND quote at the sink (q / xmlEscape). Either alone is
 * not enough; both together mean a bug in one layer is caught by the other.
 */

/** Canonical simulator UDID, e.g. A1B2C3D4-E5F6-4789-ABCD-0123456789AB (a subset of /^[0-9A-Fa-f-]{36}$/). */
export const UDID_RE = /^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$/
/** Bundle identifier: reverse-DNS characters only. */
export const BUNDLE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,154}$/
/** SwiftPM product / Xcode scheme name. No leading '-' (option injection), no quotes, no control characters. */
export const PRODUCT_RE = /^[A-Za-z0-9_][A-Za-z0-9_. -]{0,127}$/
export const APPEARANCE_RE = /^(light|dark)$/
/** Unix account name. No leading '-' so `user@host` can never be read as an ssh option. */
export const USER_RE = /^[A-Za-z_][A-Za-z0-9_.-]{0,31}$/
/** Folder on the Mac: absolute or ~-relative, plain path characters, no `..`. */
export const REMOTE_ROOT_RE = /^(~|\/)[A-Za-z0-9_./ -]{0,255}$/

export const CONTENT_SIZES = [
  'xSmall', 'small', 'medium', 'large', 'xLarge', 'xxLarge', 'xxxLarge', 'accessibility1', 'accessibility3'
] as const

function fail(what: string): never {
  throw new Error(`Invalid ${what}`)
}

export function isIPv4(s: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s)
  return !!m && m.slice(1).every((o) => Number(o) <= 255)
}

/** A DNS host name (labels of letters/digits/hyphen, dots between) or a dotted-quad IPv4 address. */
export function isHost(s: string): boolean {
  if (isIPv4(s)) return true
  if (/^\d+(\.\d+)*$/.test(s)) return false // looks like an IP but isn't a valid one
  return s.length <= 253 && /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(s)
}

export function assertUdid(s: unknown): string {
  if (typeof s !== 'string' || !UDID_RE.test(s)) fail('simulator UDID')
  return s
}
export function assertBundleId(s: unknown): string {
  if (typeof s !== 'string' || !BUNDLE_ID_RE.test(s)) fail('bundle identifier')
  return s
}
export function assertProduct(s: unknown): string {
  if (typeof s !== 'string' || !PRODUCT_RE.test(s)) fail('product / scheme name')
  return s
}
export function assertAppearance(s: unknown): 'light' | 'dark' {
  if (typeof s !== 'string' || !APPEARANCE_RE.test(s)) fail('appearance')
  return s as 'light' | 'dark'
}
export function assertContentSize(s: unknown): (typeof CONTENT_SIZES)[number] {
  if (typeof s !== 'string' || !(CONTENT_SIZES as readonly string[]).includes(s)) fail('content size')
  return s as (typeof CONTENT_SIZES)[number]
}

export interface ConnectionLike {
  host: string
  user: string
  port?: number
  remoteRoot?: string
  lastIp?: string
}

/** Validate (and normalise) a Mac connection before it is ever stored or handed to ssh. */
export function assertConnection<T extends ConnectionLike>(c: T): T {
  if (typeof c !== 'object' || c === null) fail('connection')
  if (typeof c.host !== 'string' || !isHost(c.host)) fail('host name (letters, digits, hyphens and dots, or an IPv4 address)')
  if (typeof c.user !== 'string' || !USER_RE.test(c.user)) fail('user name')
  if (c.port !== undefined && (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535)) fail('SSH port')
  if (c.remoteRoot !== undefined && (typeof c.remoteRoot !== 'string' || !REMOTE_ROOT_RE.test(c.remoteRoot) || c.remoteRoot.split('/').includes('..'))) fail('remote folder')
  if (c.lastIp !== undefined && (typeof c.lastIp !== 'string' || !isIPv4(c.lastIp))) fail('last-known IP address')
  return c
}

// ---- git ------------------------------------------------------------------
// Everything below ends up as an argument to the `git` executable (never through a shell), but it is still
// validated: git itself treats a leading '-' as an option and understands transports like `ext::` that run commands.

const GIT_HOST = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*'
const GIT_PATH = '[A-Za-z0-9._~%+/-]{1,400}'
const GIT_USER = '[A-Za-z0-9._-]{1,64}'
/** Remote forms F-Code accepts: https://host/path, ssh://user@host/path and scp-style user@host:path. No userinfo in https URLs. */
export const GIT_URL_RES: RegExp[] = [
  new RegExp(`^https://${GIT_HOST}(?::\\d{1,5})?/${GIT_PATH}$`),
  new RegExp(`^ssh://${GIT_USER}@${GIT_HOST}(?::\\d{1,5})?/${GIT_PATH}$`),
  new RegExp(`^${GIT_USER}@${GIT_HOST}:${GIT_PATH}$`)
]
/** Folder name for a clone: no separators, no leading '.' or '-', no spaces. */
export const GIT_FOLDER_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}$/
/** Local branch name: conservative subset of what git allows. Never starts with '-'. */
export const GIT_BRANCH_RE = /^[A-Za-z0-9_][A-Za-z0-9._/-]{0,199}$/

export function assertGitUrl(s: unknown): string {
  if (typeof s !== 'string') fail('repository URL')
  const url = s.trim()
  if (url.length > 600 || !GIT_URL_RES.some((re) => re.test(url)) || url.split(/[/:]/).includes('..')) {
    fail('repository URL (use https://host/owner/repo.git, ssh://git@host/owner/repo.git or git@host:owner/repo.git)')
  }
  return url
}

/** Remove any `user:token@` from an https URL before it is shown or logged. */
export function stripUrlCredentials(url: string): string {
  return url.replace(/^(https?:\/\/)[^/@\s]*@/i, '$1')
}

/** Default folder name for a clone: the last path segment without `.git`. */
export function folderNameFromUrl(url: string): string {
  const last = url.replace(/\/+$/, '').split(/[/:]/).pop() ?? ''
  return last.replace(/\.git$/i, '')
}

export function assertGitFolderName(s: unknown): string {
  if (typeof s !== 'string' || !GIT_FOLDER_RE.test(s) || s.endsWith('.') || /\.git$/i.test(s)) fail('folder name')
  return s
}

export function assertGitBranch(s: unknown): string {
  if (
    typeof s !== 'string' ||
    !GIT_BRANCH_RE.test(s) ||
    s.includes('..') ||
    s.includes('//') ||
    s.endsWith('/') ||
    s.endsWith('.') ||
    s.endsWith('.lock') ||
    s.split('/').some((p) => p.startsWith('.') || p.endsWith('.lock'))
  ) {
    fail('branch name')
  }
  return s
}

/** A repo-relative path from the renderer: no drive, no leading slash, no `..`, no control characters. Returns forward slashes. */
export function assertRepoPath(s: unknown): string {
  if (typeof s !== 'string' || s.length === 0 || s.length > 1000 || /[\u0000-\u001F]/.test(s)) fail('file path')
  const p = s.replace(/\\/g, '/')
  if (/^([A-Za-z]:|\/)/.test(p) || p.split('/').some((seg) => seg === '..' || seg === '' ) || p.startsWith(':')) fail('file path')
  return p
}

export function assertCommitMessage(s: unknown): string {
  if (typeof s !== 'string' || s.includes('\u0000')) fail('commit message')
  const m = s.trim()
  if (m.length === 0) fail('commit message (it is empty)')
  if (m.length > 10000) fail('commit message (too long)')
  return m
}

/** Single-quote for a POSIX shell (keeps a leading ~/ expandable). */
export function q(s: string): string {
  if (s.startsWith('~/')) return '~/' + q(s.slice(2))
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/** Escape text for an XML element body or attribute; also drops characters XML 1.0 cannot carry. */
export function xmlEscape(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
