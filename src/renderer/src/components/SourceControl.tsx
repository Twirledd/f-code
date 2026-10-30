import React, { useCallback, useEffect, useState } from 'react'
import type { GitChange, GitChangeKind, GitInfo, GitOpResult } from '@shared/types'
import { useStore } from '@/state/store'
import { Branch } from './Icons'

const LETTER: Record<GitChangeKind, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  typechange: 'T',
  untracked: 'U',
  conflicted: '!'
}
const COLOR: Record<GitChangeKind, string> = {
  modified: 'var(--orange)',
  added: 'var(--green)',
  deleted: 'var(--red)',
  renamed: 'var(--accent-text)',
  copied: 'var(--accent-text)',
  typechange: 'var(--orange)',
  untracked: 'var(--green)',
  conflicted: 'var(--red)'
}

function when(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Source Control navigator: branch, remote, changes, commit and history for the open project's Git repository. */
export function SourceControlNavigator(): JSX.Element {
  const project = useStore((s) => s.project)
  const set = useStore((s) => s.set)
  const [info, setInfo] = useState<GitInfo>()
  const [busy, setBusy] = useState<string>()
  const [note, setNote] = useState<{ ok: boolean; text: string }>()
  const [message, setMessage] = useState('')
  const [newBranch, setNewBranch] = useState<string>()
  const [remoteUrl, setRemoteUrl] = useState<string>()

  const refresh = useCallback(async (): Promise<void> => {
    setInfo(await window.xcode.git.info())
  }, [])

  // The project object is replaced whenever files change on disk, so this also keeps the list current.
  useEffect(() => {
    if (!project) return
    const t = setTimeout(() => void refresh(), 250)
    return () => clearTimeout(t)
  }, [project, refresh])

  const run = async (label: string, fn: () => Promise<GitOpResult>, onOk?: () => void): Promise<void> => {
    setBusy(label)
    setNote(undefined)
    try {
      const r = await fn()
      setNote({ ok: r.ok, text: r.message })
      if (r.ok) onOk?.()
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(undefined)
      await refresh()
    }
  }

  if (!project) return <div className="nav-empty">No project open</div>
  if (!info) return <div className="nav-empty">Checking for Git…</div>

  if (!info.available) {
    return (
      <div className="nav-empty">
        <Branch style={{ width: 28, height: 28, opacity: 0.5, marginBottom: 8 }} />
        <div>Git for Windows is not installed.</div>
        <div style={{ marginTop: 8 }}>
          <button className="btn small" onClick={() => window.xcode.window.openExternal('https://git-scm.com/download/win')}>
            Get Git for Windows
          </button>
        </div>
        <div style={{ marginTop: 8 }}>Install it, then reopen this project.</div>
      </div>
    )
  }

  if (!info.isRepo) {
    return (
      <div className="nav-empty">
        <Branch style={{ width: 28, height: 28, opacity: 0.5, marginBottom: 8 }} />
        <div>This project is not in a Git repository.</div>
        {info.error && <div className="scm-note bad">{info.error}</div>}
        <div style={{ marginTop: 10 }}>
          <button className="btn small" disabled={!!busy} onClick={() => void run('Creating repository…', () => window.xcode.git.init())}>
            Create Git Repository
          </button>
        </div>
        {note && <div className={`scm-note ${note.ok ? 'ok' : 'bad'}`}>{note.text}</div>}
      </div>
    )
  }

  const staged = info.changes.filter((c) => c.staged)
  const unstaged = info.changes.filter((c) => c.unstaged)
  const canCommit = staged.length > 0 && message.trim().length > 0 && !busy
  const openDiff = (path: string, isStaged: boolean): void => set({ gitDiffTarget: { path, staged: isStaged }, sheet: 'gitDiff' })
  const paths = (list: GitChange[]): string[] => list.map((c) => c.path)

  const commit = (): void => {
    if (!canCommit) return
    void run('Committing…', () => window.xcode.git.commit(message), () => setMessage(''))
  }

  const current = info.branch ?? ''
  const pickBranch = (value: string): void => {
    if (!value) return
    const name = value.startsWith('remote:') ? value.slice(value.indexOf('/') + 1) : value
    if (name === info.branch) return
    void run(`Switching to ${name}…`, () => window.xcode.git.checkout(name))
  }

  return (
    <>
      <div className="scm-head">
        <Branch className="scm-branch-icon" />
        <select value={current} disabled={!!busy} onChange={(e) => pickBranch(e.target.value)} title="Current branch">
          {!info.branch && <option value="">{info.detached ? `Detached at ${info.detached}` : 'No commits yet'}</option>}
          {info.branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
          {info.remoteBranches.length > 0 && (
            <optgroup label="Remote branches">
              {info.remoteBranches.map((b) => (
                <option key={b} value={`remote:${b}`}>
                  {b}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {(info.ahead > 0 || info.behind > 0) && (
          <span className="scm-ab" title={`${info.ahead} to push, ${info.behind} to pull`}>
            {info.ahead > 0 && `↑${info.ahead}`} {info.behind > 0 && `↓${info.behind}`}
          </span>
        )}
      </div>

      <div className="scm-actions">
        <button className="btn small" disabled={!!busy || !info.remote} onClick={() => void run('Fetching…', () => window.xcode.git.fetch())} title="Download remote changes without applying them">
          Fetch
        </button>
        <button className="btn small" disabled={!!busy || !info.remote} onClick={() => void run('Pulling…', () => window.xcode.git.pull(), () => void window.xcode.project.refresh())} title="Fast-forward to the remote branch">
          Pull
        </button>
        <button className="btn small" disabled={!!busy || !info.remote} onClick={() => void run('Pushing…', () => window.xcode.git.push())} title="Send your commits to the remote">
          Push
        </button>
        <button className="btn small" disabled={!!busy} onClick={() => setNewBranch(newBranch === undefined ? '' : undefined)} title="Create a branch from here">
          New Branch…
        </button>
      </div>

      {newBranch !== undefined && (
        <div className="scm-inline">
          <input
            autoFocus
            type="text"
            value={newBranch}
            placeholder="feature/name"
            spellCheck={false}
            onChange={(e) => setNewBranch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newBranch.trim()) void run('Creating branch…', () => window.xcode.git.createBranch(newBranch.trim()), () => setNewBranch(undefined))
              if (e.key === 'Escape') setNewBranch(undefined)
            }}
          />
          <button className="btn small primary" disabled={!newBranch.trim() || !!busy} onClick={() => void run('Creating branch…', () => window.xcode.git.createBranch(newBranch.trim()), () => setNewBranch(undefined))}>
            Create
          </button>
        </div>
      )}

      {info.remote ? (
        <div className="scm-remote" title={info.remote.url}>
          {info.remote.name}: {info.remote.url.replace(/^https?:\/\//, '')}
        </div>
      ) : (
        <div className="scm-remote">
          <span>No remote yet. </span>
          <a onClick={() => setRemoteUrl(remoteUrl === undefined ? '' : undefined)}>Add GitHub URL…</a>
        </div>
      )}
      {remoteUrl !== undefined && !info.remote && (
        <div className="scm-inline">
          <input
            autoFocus
            type="text"
            value={remoteUrl}
            placeholder="https://github.com/owner/repo.git"
            spellCheck={false}
            onChange={(e) => setRemoteUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && remoteUrl.trim()) void run('Adding remote…', () => window.xcode.git.addRemote(remoteUrl.trim()), () => setRemoteUrl(undefined))
              if (e.key === 'Escape') setRemoteUrl(undefined)
            }}
          />
          <button className="btn small primary" disabled={!remoteUrl.trim() || !!busy} onClick={() => void run('Adding remote…', () => window.xcode.git.addRemote(remoteUrl.trim()), () => setRemoteUrl(undefined))}>
            Add
          </button>
        </div>
      )}

      {(busy || note) && (
        <div className={`scm-note ${busy ? '' : note?.ok ? 'ok' : 'bad'}`} role="status">
          {busy ?? note?.text}
        </div>
      )}

      <div className="nav-body">
        {staged.length > 0 && (
          <>
            <div className="nav-section scm-section">
              <span>Staged Changes ({staged.length})</span>
              <button className="btn small" disabled={!!busy} onClick={() => void run('Unstaging…', () => window.xcode.git.unstage(paths(staged)))}>
                Unstage All
              </button>
            </div>
            {staged.map((c) => (
              <ChangeRow
                key={`s:${c.path}`}
                change={c}
                kind={c.staged!}
                disabled={!!busy}
                onOpen={() => openDiff(c.path, true)}
                actions={[{ title: 'Unstage', glyph: '−', run: () => void run('Unstaging…', () => window.xcode.git.unstage([c.path])) }]}
              />
            ))}
          </>
        )}

        <div className="nav-section scm-section">
          <span>Changes ({unstaged.length})</span>
          {unstaged.length > 0 && (
            <button className="btn small" disabled={!!busy} onClick={() => void run('Staging…', () => window.xcode.git.stage(paths(unstaged)))}>
              Stage All
            </button>
          )}
        </div>
        {unstaged.length === 0 && <div className="scm-none">{staged.length > 0 ? 'Everything is staged.' : 'No changes. Your working tree is clean.'}</div>}
        {unstaged.map((c) => (
          <ChangeRow
            key={`u:${c.path}`}
            change={c}
            kind={c.unstaged!}
            disabled={!!busy}
            onOpen={() => openDiff(c.path, false)}
            actions={[
              { title: 'Stage', glyph: '+', run: () => void run('Staging…', () => window.xcode.git.stage([c.path])) },
              { title: 'Discard changes', glyph: '↺', run: () => void run('Discarding…', () => window.xcode.git.discard([c.path]), () => void window.xcode.project.refresh()) }
            ]}
          />
        ))}

        <div className="nav-section scm-section">
          <span>Commit</span>
        </div>
        <div className="scm-commit">
          <textarea
            value={message}
            placeholder={staged.length ? 'Commit message (Ctrl+Enter to commit)' : 'Stage some changes, then write a message'}
            rows={3}
            spellCheck
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                commit()
              }
            }}
          />
          <button className="btn small primary" disabled={!canCommit} onClick={commit}>
            Commit{staged.length ? ` (${staged.length})` : ''}
          </button>
        </div>

        <div className="nav-section scm-section">
          <span>History</span>
        </div>
        {info.log.length === 0 && <div className="scm-none">No commits yet.</div>}
        {info.log.map((c) => (
          <div key={c.hash} className="row scm-log" title={`${c.hash}\n${c.author}\n${c.subject}`}>
            <code>{c.short}</code>
            <span className="label">{c.subject}</span>
            <span className="sub">{when(c.date)}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function ChangeRow({
  change,
  kind,
  disabled,
  onOpen,
  actions
}: {
  change: GitChange
  kind: GitChangeKind
  disabled: boolean
  onOpen: () => void
  actions: { title: string; glyph: string; run: () => void }[]
}): JSX.Element {
  const slash = change.path.lastIndexOf('/')
  const name = change.path.slice(slash + 1)
  const dir = slash >= 0 ? change.path.slice(0, slash) : ''
  return (
    <div className="row scm-row" onClick={onOpen} title={change.origPath ? `${change.origPath} → ${change.path}` : change.path}>
      <span className="scm-kind" style={{ color: COLOR[kind] }}>
        {LETTER[kind]}
      </span>
      <span className="label">
        {name}
        {dir && <span className="sub"> {dir}</span>}
      </span>
      <span className="scm-row-actions" onClick={(e) => e.stopPropagation()}>
        {actions.map((a) => (
          <button key={a.title} className="scm-icon-btn" title={a.title} aria-label={`${a.title}: ${change.path}`} disabled={disabled} onClick={a.run}>
            {a.glyph}
          </button>
        ))}
      </span>
    </div>
  )
}
