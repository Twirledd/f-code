/**
 * Source control for the open project, using the `git` that is installed on the PC (Git for Windows).
 *
 * Plain Node (no electron imports) so the security tests can exercise it directly. Every value that reaches
 * a git command line is validated in validate.ts first and passed as an argument, never through a shell.
 * HTTPS sign-in is left to Git Credential Manager (its own window); F-Code never sees a password or token.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import type { GitChange, GitChangeKind, GitCommit, GitCloneProgress, GitInfo, GitOpResult } from '../shared/types'
import {
  assertCommitMessage,
  assertGitBranch,
  assertGitFolderName,
  assertGitUrl,
  assertRepoPath,
  stripUrlCredentials
} from './validate'

const MAX_OUTPUT = 4 * 1024 * 1024
const MAX_DIFF = 300 * 1024

interface RunOptions {
  input?: string
  /** Read-only commands skip optional index locks so they never fight a running build or editor. */
  readOnly?: boolean
  timeoutMs?: number
  extraConfig?: string[]
}

interface RunResult {
  code: number
  stdout: string
  stderr: string
  /** git could not be started at all (not installed). */
  missing?: boolean
}

function gitEnv(readOnly?: boolean): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C', LANG: 'C' }
  // ssh must never wait for a password or a yes/no question in a window nobody can see.
  if (!env.GIT_SSH_COMMAND) env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes'
  if (readOnly) env.GIT_OPTIONAL_LOCKS = '0'
  return env
}

function baseArgs(extraConfig: string[] = []): string[] {
  const args = ['-c', 'core.quotepath=off', '-c', 'core.fsmonitor=false', '-c', 'protocol.ext.allow=never']
  for (const c of extraConfig) args.push('-c', c)
  return args
}

/** One command at a time per repository, so two quick clicks never collide on index.lock. */
const queues = new Map<string, Promise<unknown>>()
function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  queues.set(key, next.catch(() => undefined))
  return next
}

export function runGit(cwd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolvePromise) => {
    let child: ChildProcess
    try {
      child = spawn('git', [...baseArgs(opts.extraConfig), ...args], { cwd, env: gitEnv(opts.readOnly), windowsHide: true })
    } catch {
      return resolvePromise({ code: -1, stdout: '', stderr: 'git is not installed', missing: true })
    }
    const out: Buffer[] = []
    const err: Buffer[] = []
    let size = 0
    let killed = false
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          killed = true
          child.kill()
        }, opts.timeoutMs)
      : undefined
    child.stdout!.on('data', (d: Buffer) => {
      size += d.length
      if (size <= MAX_OUTPUT) out.push(d)
    })
    child.stderr!.on('data', (d: Buffer) => {
      if (err.reduce((n, b) => n + b.length, 0) < MAX_OUTPUT) err.push(d)
    })
    child.on('error', (e: NodeJS.ErrnoException) => {
      if (timer) clearTimeout(timer)
      resolvePromise({ code: -1, stdout: '', stderr: e.code === 'ENOENT' ? 'git is not installed' : e.message, missing: e.code === 'ENOENT' })
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      resolvePromise({
        code: killed ? -2 : (code ?? -1),
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8') + (killed ? '\nTimed out.' : '')
      })
    })
    child.stdin!.on('error', () => undefined)
    child.stdin!.end(opts.input ?? '')
  })
}

/** First few meaningful lines of git's own error text, for a status message. */
export function briefError(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^hint:/i.test(l))
  return lines.slice(0, 4).join(' ') || 'git reported an error'
}

// ---- status ------------------------------------------------------------------

const KIND: Record<string, GitChangeKind | undefined> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'typechange'
}

export interface ParsedStatus {
  branch?: string
  detachedOid?: string
  upstream?: string
  ahead: number
  behind: number
  changes: GitChange[]
}

/** Parse `git status --porcelain=v2 --branch -z --untracked-files=all`. */
export function parseStatus(raw: string): ParsedStatus {
  const out: ParsedStatus = { ahead: 0, behind: 0, changes: [] }
  const parts = raw.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i]
    if (!line) continue
    if (line.startsWith('# ')) {
      const [, key, ...rest] = line.split(' ')
      const val = rest.join(' ')
      if (key === 'branch.head') {
        if (val !== '(detached)') out.branch = val
      } else if (key === 'branch.oid') out.detachedOid = val === '(initial)' ? undefined : val
      else if (key === 'branch.upstream') out.upstream = val
      else if (key === 'branch.ab') {
        const m = /^\+(\d+) -(\d+)$/.exec(val)
        if (m) {
          out.ahead = Number(m[1])
          out.behind = Number(m[2])
        }
      }
      continue
    }
    const t = line[0]
    if (t === '?') {
      out.changes.push({ path: line.slice(2), unstaged: 'untracked' })
    } else if (t === '1') {
      const f = line.split(' ')
      out.changes.push(change(f[1], f.slice(8).join(' ')))
    } else if (t === '2') {
      const f = line.split(' ')
      const c = change(f[1], f.slice(9).join(' '))
      c.origPath = parts[++i]
      out.changes.push(c)
    } else if (t === 'u') {
      const f = line.split(' ')
      out.changes.push({ path: f.slice(10).join(' '), unstaged: 'conflicted' })
    }
  }
  return out
}

function change(xy: string, path: string): GitChange {
  const c: GitChange = { path }
  const staged = KIND[xy[0]]
  const unstaged = KIND[xy[1]]
  if (staged) c.staged = staged
  if (unstaged) c.unstaged = unstaged
  return c
}

// ---- info ----------------------------------------------------------------------

export async function getInfo(root: string | undefined): Promise<GitInfo> {
  const empty: GitInfo = { available: true, isRepo: false, ahead: 0, behind: 0, changes: [], log: [], branches: [], remoteBranches: [] }
  if (!root) return empty
  return serial(root, async () => {
    const top = await runGit(root, ['rev-parse', '--show-toplevel'], { readOnly: true, timeoutMs: 15000 })
    if (top.missing) return { ...empty, available: false, error: 'Git for Windows is not installed.' }
    if (top.code !== 0) {
      const notRepo = /not a git repository/i.test(top.stderr)
      return { ...empty, error: notRepo ? undefined : briefError(top.stderr) }
    }
    const repoRoot = resolve(top.stdout.trim())
    const info: GitInfo = { ...empty, isRepo: true, root: repoRoot }

    const status = await runGit(repoRoot, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'], { readOnly: true, timeoutMs: 30000 })
    if (status.code === 0) {
      const p = parseStatus(status.stdout)
      info.branch = p.branch
      info.upstream = p.upstream
      info.ahead = p.ahead
      info.behind = p.behind
      info.changes = p.changes
      if (!p.branch && p.detachedOid) info.detached = p.detachedOid.slice(0, 7)
    } else info.error = briefError(status.stderr)

    const remotes = await runGit(repoRoot, ['remote'], { readOnly: true })
    const names = remotes.stdout.split(/\r?\n/).filter(Boolean)
    const name = names.includes('origin') ? 'origin' : names[0]
    if (name) {
      const url = await runGit(repoRoot, ['remote', 'get-url', '--', name], { readOnly: true })
      if (url.code === 0) info.remote = { name, url: stripUrlCredentials(url.stdout.trim()) }
    }

    const log = await runGit(repoRoot, ['log', '-n', '40', '--no-color', '--format=%H%x1f%an%x1f%at%x1f%s'], { readOnly: true })
    if (log.code === 0) info.log = parseLog(log.stdout)

    const local = await runGit(repoRoot, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], { readOnly: true })
    info.branches = local.stdout.split(/\r?\n/).filter(Boolean)
    const remote = await runGit(repoRoot, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes'], { readOnly: true })
    info.remoteBranches = remote.stdout
      .split(/\r?\n/)
      .filter((b) => b && !b.endsWith('/HEAD') && b.includes('/'))
      .filter((b) => !info.branches.includes(b.slice(b.indexOf('/') + 1)))
    return info
  })
}

export function parseLog(raw: string): GitCommit[] {
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const [hash, author, at, ...subject] = l.split('\x1f')
      return { hash, short: hash.slice(0, 7), author, date: Number(at), subject: subject.join('\x1f') }
    })
}

// ---- helpers shared by the operations ---------------------------------------------

async function repoRootOf(root: string | undefined): Promise<string> {
  if (!root) throw new Error('Open a project first')
  const r = await runGit(root, ['rev-parse', '--show-toplevel'], { readOnly: true, timeoutMs: 15000 })
  if (r.missing) throw new Error('Git for Windows is not installed.')
  if (r.code !== 0) throw new Error('This project is not in a Git repository.')
  return resolve(r.stdout.trim())
}

async function changedPaths(repo: string): Promise<GitChange[]> {
  const s = await runGit(repo, ['status', '--porcelain=v2', '-z', '--untracked-files=all'], { readOnly: true, timeoutMs: 30000 })
  if (s.code !== 0) throw new Error(briefError(s.stderr))
  return parseStatus(s.stdout).changes
}

/** Only paths that git itself lists as changed may be staged, unstaged or discarded. */
async function pickChanged(repo: string, paths: unknown): Promise<GitChange[]> {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 5000) throw new Error('Invalid file list')
  const wanted = new Set(paths.map((p) => assertRepoPath(p)))
  const all = await changedPaths(repo)
  const picked = all.filter((c) => wanted.has(c.path))
  if (picked.length !== wanted.size) throw new Error('Some of those files have no changes any more')
  return picked
}

function result(r: RunResult, ok: string): GitOpResult {
  return r.code === 0 ? { ok: true, message: ok } : { ok: false, message: briefError(r.stderr || r.stdout) }
}

// ---- operations ----------------------------------------------------------------------

export function stage(root: string | undefined, paths: unknown): Promise<GitOpResult> {
  return serialOp(root, async (repo) => {
    const picked = await pickChanged(repo, paths)
    return result(await runGit(repo, ['add', '--', ...picked.map((c) => c.path)]), `Staged ${picked.length} file${picked.length === 1 ? '' : 's'}`)
  })
}

export function unstage(root: string | undefined, paths: unknown): Promise<GitOpResult> {
  return serialOp(root, async (repo) => {
    const picked = await pickChanged(repo, paths)
    return result(await runGit(repo, ['reset', '-q', '--', ...picked.map((c) => c.path)]), `Unstaged ${picked.length} file${picked.length === 1 ? '' : 's'}`)
  })
}

/** Throw away local changes to the given files. The caller (main process) must have asked the user first. */
export function discard(root: string | undefined, paths: unknown): Promise<GitOpResult> {
  return serialOp(root, async (repo) => {
    const picked = await pickChanged(repo, paths)
    const untracked = picked.filter((c) => c.unstaged === 'untracked').map((c) => c.path)
    const tracked = picked.filter((c) => c.unstaged !== 'untracked').map((c) => c.path)
    if (tracked.length) {
      const hasHead = (await runGit(repo, ['rev-parse', '--verify', '-q', 'HEAD'], { readOnly: true })).code === 0
      const r = hasHead
        ? await runGit(repo, ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...tracked])
        : await runGit(repo, ['rm', '-q', '-r', '--cached', '--force', '--', ...tracked])
      if (r.code !== 0) return result(r, '')
    }
    if (untracked.length) {
      const r = await runGit(repo, ['clean', '-f', '-q', '--', ...untracked])
      if (r.code !== 0) return result(r, '')
    }
    return { ok: true, message: `Discarded changes in ${picked.length} file${picked.length === 1 ? '' : 's'}` }
  })
}

/** `git init` in the open project's folder (only when it is not inside a repository already). */
export async function init(root: string | undefined): Promise<GitOpResult> {
  if (!root) return { ok: false, message: 'Open a project first' }
  const top = await runGit(root, ['rev-parse', '--show-toplevel'], { readOnly: true, timeoutMs: 15000 })
  if (top.missing) return { ok: false, message: 'Git for Windows is not installed.' }
  if (top.code === 0) return { ok: false, message: 'This project is already in a Git repository.' }
  return serial(root, async () => result(await runGit(root, ['init', '-b', 'main']), 'Created a Git repository'))
}

export function commit(root: string | undefined, message: unknown): Promise<GitOpResult> {
  return serialOp(root, async (repo) => {
    const msg = assertCommitMessage(message)
    const r = await runGit(repo, ['commit', '-F', '-'], { input: msg + '\n', timeoutMs: 120000 })
    if (r.code === 0) return { ok: true, message: `Committed: ${msg.split('\n')[0].slice(0, 80)}` }
    const text = r.stderr + r.stdout
    if (/Please tell me who you are|unable to auto-detect email|empty ident name/i.test(text)) {
      return { ok: false, message: 'Git does not know who you are yet. In a terminal run: git config --global user.name "Your Name" and git config --global user.email "you@example.com"' }
    }
    if (/nothing to commit|no changes added/i.test(text)) return { ok: false, message: 'Nothing is staged. Stage some files first.' }
    return { ok: false, message: briefError(text) }
  })
}

export function fetchRemote(root: string | undefined): Promise<GitOpResult> {
  return serialOp(root, async (repo) => {
    const r = await runGit(repo, ['fetch', '--prune'], { timeoutMs: 300000 })
    return r.code === 0 ? { ok: true, message: 'Fetched from the remote' } : { ok: false, message: remoteHint(r) }
  })
}

/** Fast-forward only: it never creates a merge commit or rewrites history behind your back. */
export function pull(root: string | undefined): Promise<GitOpResult> {
  return serialOp(root, async (repo) => {
    const r = await runGit(repo, ['pull', '--ff-only'], { timeoutMs: 300000 })
    if (r.code === 0) return { ok: true, message: /Already up to date/i.test(r.stdout) ? 'Already up to date' : 'Pulled the latest changes' }
    if (/Not possible to fast-forward|diverging|have diverged/i.test(r.stderr)) {
      return { ok: false, message: 'Your branch and the remote have both changed, so this needs a merge or rebase. Do that in a terminal, then come back.' }
    }
    return { ok: false, message: remoteHint(r) }
  })
}

export function push(root: string | undefined): Promise<GitOpResult> {
  return serialOp(root, async (repo) => {
    const info = await runGit(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { readOnly: true })
    let r: RunResult
    if (info.code === 0) r = await runGit(repo, ['push'], { timeoutMs: 300000 })
    else {
      const remotes = (await runGit(repo, ['remote'], { readOnly: true })).stdout.split(/\r?\n/).filter(Boolean)
      if (remotes.length === 0) return { ok: false, message: 'There is no remote yet. Add a GitHub URL first.' }
      const name = remotes.includes('origin') ? 'origin' : remotes[0]
      r = await runGit(repo, ['push', '-u', '--', name, 'HEAD'], { timeoutMs: 300000 })
    }
    return r.code === 0 ? { ok: true, message: 'Pushed to the remote' } : { ok: false, message: remoteHint(r) }
  })
}

export function checkout(root: string | undefined, branch: unknown): Promise<GitOpResult> {
  return serialOp(root, async (repo) => {
    const name = assertGitBranch(branch)
    return result(await runGit(repo, ['switch', name]), `Switched to ${name}`)
  })
}

export function createBranch(root: string | undefined, branch: unknown): Promise<GitOpResult> {
  return serialOp(root, async (repo) => {
    const name = assertGitBranch(branch)
    return result(await runGit(repo, ['switch', '-c', name]), `Created and switched to ${name}`)
  })
}

export function addRemote(root: string | undefined, url: unknown): Promise<GitOpResult> {
  return serialOp(root, async (repo) => {
    const safe = assertGitUrl(url)
    const existing = (await runGit(repo, ['remote'], { readOnly: true })).stdout.split(/\r?\n/).filter(Boolean)
    if (existing.includes('origin')) return { ok: false, message: 'This repository already has a remote called origin.' }
    return result(await runGit(repo, ['remote', 'add', 'origin', '--', safe]), 'Remote added as origin')
  })
}

/** Diff of one file, for the diff viewer. Never runs external diff or text-conversion programs. */
export async function diff(root: string | undefined, path: unknown, staged: boolean): Promise<string> {
  const repo = await repoRootOf(root)
  const rel = assertRepoPath(path)
  const change = (await changedPaths(repo)).find((c) => c.path === rel)
  if (!change) return 'No changes.'
  if (change.unstaged === 'untracked') {
    const full = resolve(repo, rel)
    if (!full.startsWith(repo)) throw new Error('Invalid file path')
    const buf = await fs.readFile(full)
    if (buf.includes(0)) return 'Binary file (new).'
    const text = buf.toString('utf8').slice(0, MAX_DIFF)
    return `new file: ${rel}\n` + text.split('\n').map((l) => `+${l}`).join('\n')
  }
  const args = ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '-U3']
  if (staged) args.push('--cached')
  const r = await runGit(repo, [...args, '--', rel], { readOnly: true, timeoutMs: 30000 })
  if (r.code !== 0) throw new Error(briefError(r.stderr))
  const text = r.stdout.length > MAX_DIFF ? r.stdout.slice(0, MAX_DIFF) + '\n… diff truncated …' : r.stdout
  return text || 'No changes.'
}

function remoteHint(r: RunResult): string {
  const t = r.stderr
  if (r.missing) return 'Git for Windows is not installed.'
  if (/Host key verification failed|Permission denied \(publickey\)/i.test(t)) return 'SSH was refused. Connect once from a terminal (ssh -T git@github.com) to trust the host and load your key, or use an https URL.'
  if (/could not read Username|terminal prompts disabled|Authentication failed|403|401/i.test(t)) return 'GitHub did not accept the sign-in. Open a terminal in the project and run a git command once so Git Credential Manager can sign you in, then try again.'
  if (/Repository not found|not found/i.test(t)) return 'Repository not found, or you do not have access to it.'
  if (/no tracking information|no upstream/i.test(t)) return 'This branch is not linked to a remote branch yet. Push it first.'
  return briefError(t)
}

async function serialOp(root: string | undefined, fn: (repo: string) => Promise<GitOpResult>): Promise<GitOpResult> {
  try {
    const repo = await repoRootOf(root)
    return await serial(repo, () => fn(repo))
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

// ---- clone ---------------------------------------------------------------------------------

export interface CloneHandle {
  promise: Promise<string>
  cancel: () => void
}

export interface CloneOptions {
  /** Tests only: replace the URL check (the IPC layer never passes this). */
  urlCheck?: (url: string) => string
  /** Tests only: allow a local file path as the source. */
  allowLocal?: boolean
}

/** Clone `url` into `<parentDir>/<folderName>`. Reports progress; the partial folder is removed on failure or cancel. */
export function cloneRepository(
  url: unknown,
  parentDir: unknown,
  folderName: unknown,
  onProgress: (p: GitCloneProgress) => void,
  opts: CloneOptions = {}
): CloneHandle {
  let child: ChildProcess | undefined
  let cancelled = false
  const promise = (async (): Promise<string> => {
    const safeUrl = (opts.urlCheck ?? assertGitUrl)(url as string)
    const folder = assertGitFolderName(folderName)
    if (typeof parentDir !== 'string' || !/^([A-Za-z]:[\\/]|[\\/])/.test(parentDir)) throw new Error('Choose a folder to clone into')
    const parent = resolve(parentDir)
    const st = await fs.stat(parent).catch(() => undefined)
    if (!st?.isDirectory()) throw new Error('That location does not exist')
    const dest = join(parent, folder)
    if (dirname(dest) !== parent || basename(dest) !== folder) throw new Error('Invalid folder name')
    if (await fs.stat(dest).then(() => true, () => false)) throw new Error(`"${folder}" already exists in that location. Choose another name or location.`)

    if (cancelled) throw new Error('Clone cancelled')
    const cfg = opts.allowLocal ? [] : ['protocol.file.allow=never']
    const args = [...baseArgs(cfg), 'clone', '--progress', '--', safeUrl, dest]
    await new Promise<void>((done, fail) => {
      child = spawn('git', args, { cwd: parent, env: gitEnv(), windowsHide: true })
      let tail = ''
      let buffer = ''
      child.stderr!.on('data', (d: Buffer) => {
        buffer += d.toString('utf8')
        const lines = buffer.split(/[\r\n]+/)
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          tail = (tail + '\n' + line).slice(-1500)
          const m = /^(?:remote: )?([A-Za-z ]+):\s+(\d+)%/.exec(line)
          if (m) onProgress({ phase: m[1].trim(), percent: Number(m[2]) })
          else if (/^Cloning into/.test(line)) onProgress({ phase: 'Starting' })
        }
      })
      child.stdout!.on('data', () => undefined)
      child.on('error', (e: NodeJS.ErrnoException) => fail(new Error(e.code === 'ENOENT' ? 'Git for Windows is not installed.' : e.message)))
      child.on('close', (code) => {
        if (cancelled) return fail(new Error('Clone cancelled'))
        if (code === 0) return done()
        fail(new Error(remoteHint({ code: code ?? -1, stdout: '', stderr: tail })))
      })
    }).catch(async (e) => {
      // Remove only what this clone created: the folder did not exist before.
      await fs.rm(dest, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined)
      throw e
    })
    return dest
  })()
  return {
    promise,
    cancel: () => {
      cancelled = true
      child?.kill()
    }
  }
}
