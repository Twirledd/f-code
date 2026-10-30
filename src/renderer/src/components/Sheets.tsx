import React, { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/state/store'
import type { NewProjectOptions, ToolchainInfo } from '@shared/types'
import { Check, Copy, Hammer, Library, Search, Terminal, Warning } from './Icons'

/** Icon-only copy button that sits beside a command; shows a tick for a moment after copying. */
function CopyButton({ copied, onCopy }: { copied: boolean; onCopy: () => void }): JSX.Element {
  return (
    <button className={`copy-btn${copied ? ' copied' : ''}`} title={copied ? 'Copied' : 'Copy'} aria-label={copied ? 'Copied' : 'Copy command'} onClick={onCopy}>
      {copied ? <Check width={14} height={14} /> : <Copy width={14} height={14} />}
    </button>
  )
}
import { FileIcon } from './FileTree'
import { flatten } from './Navigator'
import { actions } from '@/lib/actions'
import iconUrl from '../assets/icon.png'

function SheetFrame({ title, children, footer, width }: { title: string; children: React.ReactNode; footer?: React.ReactNode; width?: number }): JSX.Element {
  const set = useStore((s) => s.set)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') set({ sheet: 'none' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [set])
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && set({ sheet: 'none' })}>
      <div className="sheet" style={width ? { width } : undefined}>
        <div className="sheet-header">{title}</div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function Sheets(): JSX.Element | null {
  const sheet = useStore((s) => s.sheet)
  switch (sheet) {
    case 'newProject':
      return <NewProjectSheet />
    case 'settings':
      return <SettingsSheet />
    case 'newFile':
      return <NewFileSheet />
    case 'openQuickly':
      return <OpenQuickly />
    case 'about':
      return <AboutSheet />
    case 'gotoLine':
      return <GotoLineSheet />
    case 'clone':
      return <CloneSheet />
    case 'gitDiff':
      return <GitDiffSheet />
    default:
      return null
  }
}

// ---------------------------------------------------------------------------

/** Folder name suggested from a URL: https://github.com/a/f-code.git -> f-code. */
function suggestFolder(url: string): string {
  const last = url.trim().replace(/\/+$/, '').split(/[/:]/).pop() ?? ''
  return last.replace(/\.git$/i, '')
}

function CloneSheet(): JSX.Element {
  const set = useStore((s) => s.set)
  const showToast = useStore((s) => s.showToast)
  const [url, setUrl] = useState('')
  const [location, setLocation] = useState('')
  const [folder, setFolder] = useState('')
  const [folderEdited, setFolderEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ phase: string; percent?: number }>()
  const [error, setError] = useState<string>()
  const busyRef = React.useRef(false)

  useEffect(() => {
    const off = window.xcode.git.onCloneProgress(setProgress)
    return () => {
      off()
      if (busyRef.current) void window.xcode.git.cancelClone() // closing the sheet stops a running clone
    }
  }, [])

  const onUrl = (v: string): void => {
    setUrl(v)
    if (!folderEdited) setFolder(suggestFolder(v))
  }
  const valid = url.trim().length > 0 && folder.length > 0 && !!location

  const clone = async (): Promise<void> => {
    busyRef.current = true
    setBusy(true)
    setError(undefined)
    setProgress({ phase: 'Starting' })
    try {
      const r = await window.xcode.git.clone(url.trim(), location, folder)
      if (r.ok) {
        busyRef.current = false
        showToast(`Cloned ${folder}`)
        set({ sheet: 'none' })
      } else setError(r.message)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <SheetFrame
      title="Clone a Git repository"
      footer={
        <>
          <button className="btn" onClick={() => (busy ? void window.xcode.git.cancelClone() : set({ sheet: 'none' }))}>
            {busy ? 'Stop' : 'Cancel'}
          </button>
          <button className="btn primary" disabled={!valid || busy} onClick={() => void clone()}>
            {busy ? 'Cloning…' : 'Clone'}
          </button>
        </>
      }
    >
      <div className="form-row">
        <label>Repository URL:</label>
        <input type="text" value={url} onChange={(e) => onUrl(e.target.value)} autoFocus disabled={busy} placeholder="https://github.com/owner/repo.git" spellCheck={false} onKeyDown={(e) => e.key === 'Enter' && valid && !busy && void clone()} />
      </div>
      <div className="form-row">
        <label>Clone into:</label>
        <div className="inline">
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} disabled={busy} placeholder="Choose a folder…" spellCheck={false} />
          <button className="btn" disabled={busy} onClick={() => void window.xcode.git.chooseCloneLocation().then((p) => p && setLocation(p))}>
            Choose…
          </button>
        </div>
      </div>
      <div className="form-row">
        <label>Folder name:</label>
        <input
          type="text"
          value={folder}
          disabled={busy}
          onChange={(e) => {
            setFolder(e.target.value)
            setFolderEdited(true)
          }}
          spellCheck={false}
        />
      </div>
      <div className="form-row">
        <label></label>
        <span className="form-hint">
          {location && folder ? `The project will be cloned to ${location}\\${folder}. ` : ''}
          Private repositories open a GitHub sign-in window the first time (Git Credential Manager). F-Code never sees your password.
        </span>
      </div>
      {busy && (
        <div className="form-row">
          <label></label>
          <div className="clone-progress" role="status">
            <div className="bar">
              <div className="fill" style={{ width: `${progress?.percent ?? 4}%` }} />
            </div>
            <span>
              {progress?.phase ?? 'Starting'}
              {progress?.percent !== undefined ? ` ${progress.percent}%` : '…'}
            </span>
          </div>
        </div>
      )}
      {error && (
        <div className="form-row">
          <label></label>
          <span className="form-error">{error}</span>
        </div>
      )}
    </SheetFrame>
  )
}

function GitDiffSheet(): JSX.Element {
  const set = useStore((s) => s.set)
  const target = useStore((s) => s.gitDiffTarget)
  const [text, setText] = useState<string>()

  useEffect(() => {
    if (!target) return
    let live = true
    void window.xcode.git.diff(target.path, target.staged).then((t) => live && setText(t))
    return () => {
      live = false
    }
  }, [target])

  return (
    <SheetFrame
      title={target ? `${target.staged ? 'Staged changes' : 'Changes'}: ${target.path}` : 'Changes'}
      width={820}
      footer={
        <button className="btn primary" onClick={() => set({ sheet: 'none' })}>
          Done
        </button>
      }
    >
      <pre className="diff-view">
        {text === undefined
          ? 'Loading…'
          : text.split('\n').map((line, i) => {
              const cls = line.startsWith('@@') ? 'hunk' : line.startsWith('+') && !line.startsWith('+++') ? 'add' : line.startsWith('-') && !line.startsWith('---') ? 'del' : /^(diff |index |new file|deleted file|---|\+\+\+)/.test(line) ? 'meta' : ''
              return (
                <div key={i} className={`diff-line ${cls}`}>
                  {line || ' '}
                </div>
              )
            })}
      </pre>
    </SheetFrame>
  )
}

// ---------------------------------------------------------------------------

const TEMPLATES: { id: NewProjectOptions['template']; title: string; desc: string; icon: JSX.Element; color: string }[] = [
  { id: 'app', title: 'App', desc: 'A SwiftUI app. Runs in the Simulator canvas on Windows and builds with Xcode on a Mac.', icon: <Hammer />, color: '#0a84ff' },
  { id: 'executable', title: 'Command Line Tool', desc: 'An executable Swift package with a main.swift and a test target.', icon: <Terminal />, color: '#1d4ed8' },
  { id: 'library', title: 'Library', desc: 'A reusable Swift library with public API and unit tests.', icon: <Library />, color: '#7c3aed' },
  { id: 'tool', title: 'ArgumentParser Tool', desc: 'A command line tool using swift-argument-parser (fetched on first build).', icon: <Hammer />, color: '#b45309' }
]

function NewProjectSheet(): JSX.Element {
  const set = useStore((s) => s.set)
  const [template, setTemplate] = useState<NewProjectOptions['template']>('app')
  const [name, setName] = useState('MyApp')
  const [location, setLocation] = useState('')
  const [git, setGit] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const valid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !!location

  const create = async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      await window.xcode.project.create({ name, location, template, createGit: git })
      set({ sheet: 'none' })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SheetFrame
      title="Choose a template for your new project"
      footer={
        <>
          <button className="btn" onClick={() => set({ sheet: 'none' })}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid || busy} onClick={() => void create()}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <div className="templates" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {TEMPLATES.map((t) => (
          <div key={t.id} className={`template ${template === t.id ? 'selected' : ''}`} onClick={() => setTemplate(t.id)}>
            <span className="ic" style={{ background: t.color }}>
              {t.icon}
            </span>
            <b>{t.title}</b>
            <span>{t.desc}</span>
          </div>
        ))}
      </div>
      <div className="form-row">
        <label>Product Name:</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus spellCheck={false} />
      </div>
      <div className="form-row">
        <label>Location:</label>
        <div className="inline">
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Choose a folder…" spellCheck={false} />
          <button className="btn" onClick={() => void window.xcode.project.chooseLocation().then((p) => p && setLocation(p))}>
            Choose…
          </button>
        </div>
      </div>
      <div className="form-row">
        <label></label>
        <label className="check">
          <input type="checkbox" checked={git} onChange={(e) => setGit(e.target.checked)} /> Create Git repository on my PC
        </label>
      </div>
      <div className="form-row">
        <label></label>
        <span className="form-hint">
          The project will be created at {location ? `${location}\\${name}` : '…'}
        </span>
      </div>
      {error && (
        <div className="form-row">
          <label></label>
          <span className="form-error">{error}</span>
        </div>
      )}
    </SheetFrame>
  )
}

// ---------------------------------------------------------------------------

export function SettingsSheet(): JSX.Element {
  const set = useStore((s) => s.set)
  const toolchain = useStore((s) => s.toolchain)
  const theme = useStore((s) => s.theme)
  const [cmds, setCmds] = useState<{ title: string; command: string }[]>([])
  const [checking, setChecking] = useState(false)
  const [copied, setCopied] = useState<string>()

  useEffect(() => {
    void window.xcode.toolchain.installCommands().then(setCmds)
  }, [])

  const recheck = async (): Promise<void> => {
    setChecking(true)
    const t: ToolchainInfo = await window.xcode.toolchain.detect(true)
    set({ toolchain: t })
    setChecking(false)
  }
  const copy = (text: string): void => {
    void navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(undefined), 1500)
  }

  return (
    <SheetFrame
      title="Settings"
      footer={
        <button className="btn primary" onClick={() => set({ sheet: 'none' })}>
          Done
        </button>
      }
    >
      <h4 style={{ margin: '0 0 8px' }}>Appearance</h4>
      <div className="form-row" style={{ gridTemplateColumns: '100px 1fr' }}>
        <label>Theme:</label>
        <div className="inline">
          <select value={theme} onChange={(e) => set({ theme: e.target.value as 'dark' | 'light' })} className="btn" style={{ padding: '0 8px' }}>
            <option value="dark">Default (Dark)</option>
            <option value="light">Default (Light)</option>
          </select>
        </div>
      </div>

      <h4 style={{ margin: '18px 0 8px' }}>Swift Toolchain</h4>
      <div className="tc-status">
        <span className="dot" style={{ background: toolchain?.found ? 'var(--green)' : 'var(--orange)' }} />
        <div style={{ flex: 1 }}>
          <b>{toolchain?.found ? toolchain.swiftVersion ?? 'Swift found' : 'Swift toolchain not found'}</b>
          <span>{toolchain?.found ? toolchain.swiftPath : 'Install the toolchain, then click Re-check.'}</span>
        </div>
        <button className="btn small" onClick={() => void recheck()} disabled={checking}>
          {checking ? 'Checking…' : 'Re-check'}
        </button>
      </div>
      {toolchain?.found && (
        <>
          <div className="insp-row" style={{ gridTemplateColumns: '110px 1fr' }}>
            <span className="k">sourcekit-lsp</span>
            <span className="v mono">{toolchain.lspPath ?? <span style={{ color: 'var(--orange)' }}>not found</span>}</span>
          </div>
          <div className="insp-row" style={{ gridTemplateColumns: '110px 1fr' }}>
            <span className="k">lldb-dap</span>
            <span className="v mono">{toolchain.lldbDapPath ?? <span style={{ color: 'var(--orange)' }}>not found</span>}</span>
          </div>
        </>
      )}
      {toolchain?.problems.map((p, i) => (
        <div key={i} className="tc-problem">
          <Warning />
          <span>{p}</span>
        </div>
      ))}
      {!toolchain?.found && (
        <>
          <p className="muted" style={{ margin: '12px 0 4px', lineHeight: 1.5 }}>
            Run these in an elevated PowerShell (Windows Terminal ▸ Run as administrator). The Build Tools install is several GB and
            takes a while; the Swift installer is ~500 MB. Reboot if the installer asks, then click Re-check.
          </p>
          {cmds.map((c) => (
            <div key={c.title} className="cmd">
              <b>{c.title}</b>
              <pre>
                <span>{c.command}</span>
                <CopyButton copied={copied === c.command} onCopy={() => copy(c.command)} />
              </pre>
            </div>
          ))}
          <p className="muted" style={{ marginTop: 10 }}>
            Or download the installer from{' '}
            <a style={{ color: 'var(--accent-text)' }} onClick={() => window.xcode.window.openExternal('https://www.swift.org/install/windows/')}>
              swift.org/install/windows
            </a>
            .
          </p>
        </>
      )}

      <MacSettings copy={copy} copied={copied} />
    </SheetFrame>
  )
}

/** Settings ▸ Mac: connect to a Mac over SSH to build with Xcode and run in the real iOS Simulator. */
function MacSettings({ copy, copied }: { copy: (t: string) => void; copied?: string }): JSX.Element {
  const mac = useStore((s) => s.mac)
  const conn = useStore((s) => s.macConn)
  const pub = useStore((s) => s.macPublicKey)
  const sims = useStore((s) => s.simulators)
  const simUdid = useStore((s) => s.simUdid)
  const [host, setHost] = useState(conn?.host ?? '')
  const [user, setUser] = useState(conn?.user ?? '')
  const [port, setPort] = useState(String(conn?.port ?? 22))
  const [busy, setBusy] = useState(false)
  const [keyMsg, setKeyMsg] = useState<string>()
  useEffect(() => {
    setHost(conn?.host ?? '')
    setUser(conn?.user ?? '')
    setPort(String(conn?.port ?? 22))
  }, [conn])

  const connect = async (): Promise<void> => {
    setBusy(true)
    try {
      const c = host && user ? { host: host.trim(), user: user.trim(), port: Number(port) || 22 } : undefined
      const status = await window.xcode.mac.configure(c)
      useStore.getState().set({ mac: status, macConn: c })
      await actions.refreshMac()
    } finally {
      setBusy(false)
    }
  }
  const authCmd = pub ? `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '${pub}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys` : ''
  const color = mac.state === 'ready' ? 'var(--green)' : mac.state === 'connecting' ? 'var(--orange)' : mac.state === 'error' ? 'var(--red)' : 'var(--text-tertiary)'

  return (
    <>
      <h4 style={{ margin: '18px 0 8px' }}>Mac — Xcode build &amp; iOS Simulator</h4>
      <p className="muted" style={{ margin: '0 0 10px', lineHeight: 1.5 }}>
        F-Code can send your project to a Mac on your network, build it with Xcode and run it in the real iOS Simulator, streaming the screen back here.
        The Mac needs Xcode installed and Remote Login on (System Settings ▸ General ▸ Sharing).
      </p>
      <div className="form-row" style={{ gridTemplateColumns: '100px 1fr' }}>
        <label>Mac:</label>
        <div className="inline">
          <input type="text" value={host} placeholder="my-mac.local" onChange={(e) => setHost(e.target.value)} spellCheck={false} />
          <input type="text" value={user} placeholder="username" style={{ width: 130 }} onChange={(e) => setUser(e.target.value)} spellCheck={false} />
          <input type="text" value={port} style={{ width: 52 }} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} title="SSH port" />
          <button className="btn" onClick={() => void connect()} disabled={busy || (!!host !== !!user)}>
            {busy ? 'Connecting…' : conn ? 'Reconnect' : 'Connect'}
          </button>
        </div>
      </div>
      <div className="tc-status">
        <span className="dot" style={{ background: color }} />
        <div style={{ flex: 1 }}>
          <b>
            {mac.state === 'ready'
              ? `${mac.hostname ?? host} — ${mac.xcode ?? 'Xcode'}`
              : mac.state === 'connecting'
                ? 'Connecting…'
                : mac.state === 'error'
                  ? "Couldn't connect"
                  : 'No Mac configured'}
          </b>
          <span>
            {mac.state === 'ready'
              ? `macOS ${mac.macOS ?? ''} · ${sims.length} iOS Simulator${sims.length === 1 ? '' : 's'} · touch input ${mac.input === 'ready' ? 'ready' : mac.input === 'building' ? 'setting up…' : 'not set up'}`
              : mac.detail ?? 'Enter the hostname shown under System Settings ▸ General ▸ Sharing and your Mac user name.'}
          </span>
        </div>
      </div>
      {mac.hostKey && (
        <div className="cmd">
          <b>Trust {mac.hostKey.host}? Compare with the fingerprint on the Mac</b>
          <pre>
            <span>{mac.hostKey.fingerprints.join('\n')}</span>
          </pre>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                useStore.getState().set({ mac: await window.xcode.mac.trustHost() })
                await actions.refreshMac()
              } finally {
                setBusy(false)
              }
            }}
          >
            Fingerprints match: trust this Mac
          </button>
        </div>
      )}
      <div className="tc-status" style={{ marginTop: 8 }}>
        <span className="dot" style={{ background: 'var(--text-tertiary)' }} />
        <div style={{ flex: 1 }}>
          <b>SSH key protection</b>
          <span>{keyMsg ?? "The key is locked to your Windows account. A passphrase kept in the Windows credential store can be added when the OpenSSH Authentication Agent service is running."}</span>
        </div>
        <button className="btn small" onClick={() => void window.xcode.mac.protectKey().then((r) => setKeyMsg(r.message))}>
          Add passphrase
        </button>
      </div>
      {mac.state !== 'ready' && pub && (
        <div className="cmd">
          <b>1. On the Mac, run this once in Terminal to authorise F-Code's key</b>
          <pre>
            <span>{authCmd}</span>
            <CopyButton copied={copied === authCmd} onCopy={() => copy(authCmd)} />
          </pre>
          <b style={{ marginTop: 8 }}>2. Then click Connect</b>
        </div>
      )}
      {mac.state === 'ready' && (
        <div className="tc-status" style={{ marginTop: 8 }}>
          <span className="dot" style={{ background: mac.input === 'ready' ? 'var(--green)' : mac.input === 'building' ? 'var(--orange)' : 'var(--text-tertiary)' }} />
          <div style={{ flex: 1 }}>
            <b>Touch, typing &amp; faster video</b>
            <span>
              {mac.input === 'ready'
                ? 'Enabled: click, drag, scroll and type in the Simulator canvas.'
                : mac.input === 'building'
                  ? 'Setting up on the Mac. About 10 minutes the first time; progress is in the console.'
                  : simUdid
                    ? "Not set up yet. This builds Appium's WebDriverAgent (open source) on your Mac once."
                    : 'Pick a Simulator in the toolbar first, then enable.'}
            </span>
          </div>
          {mac.input === 'missing' && (
            <button className="btn small" disabled={!simUdid} onClick={() => void window.xcode.mac.setupInput(simUdid!)}>
              Enable
            </button>
          )}
        </div>
      )}
      {mac.state === 'ready' && (
        <>
          <div className="tc-status" style={{ marginTop: 8 }}>
            <span className="dot" style={{ background: mac.persistent?.running ? 'var(--green)' : 'var(--text-tertiary)' }} />
            <div style={{ flex: 1 }}>
              <b>Always-on simulator</b>
              <span>
                {mac.persistent?.running
                  ? `Attached. The Mac keeps ${mac.persistent.udid.slice(0, 8)}… booted with the touch agent running, so Run starts instantly.`
                  : mac.persistent
                    ? 'Installed on the Mac but not running. On the Mac: bash ~/tomcode-sim/mac_persistent_sim.sh status'
                    : 'Not set up. Boots the simulator once at login and keeps it running, so there is no slow cold boot.'}
              </span>
            </div>
          </div>
          {!mac.persistent && simUdid && (
            <div className="cmd">
              <b>Run once in Terminal on the Mac (no password needed):</b>
              <pre>
                <span>{`bash ~/tomcode-sim/mac_persistent_sim.sh install ${simUdid}`}</span>
                <CopyButton
                  copied={copied === `bash ~/tomcode-sim/mac_persistent_sim.sh install ${simUdid}`}
                  onCopy={() => copy(`bash ~/tomcode-sim/mac_persistent_sim.sh install ${simUdid}`)}
                />
              </pre>
            </div>
          )}
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

function NewFileSheet(): JSX.Element {
  const set = useStore((s) => s.set)
  const project = useStore((s) => s.project)
  const selectedPath = useStore((s) => s.selectedPath)
  const openFile = useStore((s) => s.openFile)
  const [name, setName] = useState('NewFile.swift')
  const [kind, setKind] = useState<'swift' | 'empty'>('swift')
  const [error, setError] = useState<string>()

  const dir = useMemo(() => {
    if (!project) return undefined
    if (!selectedPath) return project.root
    const node = flatten(project.tree).find((f) => f.path === selectedPath)
    return node ? selectedPath.replace(/[\\/][^\\/]+$/, '') : selectedPath
  }, [project, selectedPath])

  const create = async (): Promise<void> => {
    if (!dir) return
    const full = await window.xcode.file.join(dir, name)
    const base = name.replace(/\.[^.]+$/, '')
    const body =
      kind === 'swift' && name.endsWith('.swift')
        ? `//\n//  ${name}\n//  ${project?.name ?? ''}\n//\n//  Created on ${new Date().toLocaleDateString()}.\n//\n\nimport Foundation\n\n${/^[A-Z]/.test(base) ? `struct ${base} {\n    \n}\n` : ''}`
        : ''
    try {
      await window.xcode.file.create(full, body)
      set({ sheet: 'none' })
      await openFile(full)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <SheetFrame
      title="New File"
      width={520}
      footer={
        <>
          <button className="btn" onClick={() => set({ sheet: 'none' })}>
            Cancel
          </button>
          <button className="btn primary" disabled={!name.trim() || !dir} onClick={() => void create()}>
            Create
          </button>
        </>
      }
    >
      <div className="templates" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className={`template ${kind === 'swift' ? 'selected' : ''}`} onClick={() => { setKind('swift'); if (!name.endsWith('.swift')) setName(name.replace(/\.[^.]*$/, '') + '.swift') }}>
          <span className="ic" style={{ background: '#f05138' }}>
            <FileIcon kind="swift" />
          </span>
          <b>Swift File</b>
          <span>An empty Swift file with a header comment.</span>
        </div>
        <div className={`template ${kind === 'empty' ? 'selected' : ''}`} onClick={() => setKind('empty')}>
          <span className="ic" style={{ background: 'var(--text-tertiary)' }}>
            <FileIcon kind="text" />
          </span>
          <b>Empty</b>
          <span>A blank file of any type.</span>
        </div>
      </div>
      <div className="form-row">
        <label>Save As:</label>
        <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} spellCheck={false} />
      </div>
      <div className="form-row">
        <label>Where:</label>
        <span className="mono muted" style={{ fontSize: 11 }}>
          {dir}
        </span>
      </div>
      {error && (
        <div className="form-row">
          <label></label>
          <span className="form-error">{error}</span>
        </div>
      )}
    </SheetFrame>
  )
}

// ---------------------------------------------------------------------------

function OpenQuickly(): JSX.Element {
  const set = useStore((s) => s.set)
  const project = useStore((s) => s.project)
  const openFile = useStore((s) => s.openFile)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const files = useMemo(() => (project ? flatten(project.tree) : []), [project])
  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return files.slice(0, 30)
    return files
      .map((f) => {
        const name = f.name.toLowerCase()
        let score = 0
        if (name === query) score = 100
        else if (name.startsWith(query)) score = 80
        else if (name.includes(query)) score = 60
        else if (fuzzy(name, query)) score = 30
        else if (f.path.toLowerCase().includes(query)) score = 10
        return { f, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.f.name.length - b.f.name.length)
      .slice(0, 30)
      .map((x) => x.f)
  }, [files, q])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') set({ sheet: 'none' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [set])

  const choose = (i: number): void => {
    const f = results[i]
    if (!f) return
    set({ sheet: 'none' })
    void openFile(f.path)
  }

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && set({ sheet: 'none' })} style={{ paddingTop: 120 }}>
      <div className="quick-open" style={{ position: 'relative' }}>
        <Search className="search-ic" />
        <input
          autoFocus
          value={q}
          placeholder="Open Quickly"
          onChange={(e) => {
            setQ(e.target.value)
            setIdx(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setIdx((i) => Math.min(i + 1, results.length - 1))
            if (e.key === 'ArrowUp') setIdx((i) => Math.max(i - 1, 0))
            if (e.key === 'Enter') choose(idx)
          }}
          spellCheck={false}
        />
        <div className="results">
          {results.map((f, i) => (
            <div key={f.path} className={`row ${i === idx ? 'selected' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => choose(i)}>
              <span className="row-icon">
                <FileIcon kind={f.kind} />
              </span>
              <span className="label">{f.name}</span>
              <span className="sub" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {project && f.path.startsWith(project.root) ? f.path.slice(project.root.length + 1) : f.path}
              </span>
            </div>
          ))}
          {results.length === 0 && <div className="nav-empty">No results</div>}
        </div>
      </div>
    </div>
  )
}

function fuzzy(hay: string, needle: string): boolean {
  let j = 0
  for (let i = 0; i < hay.length && j < needle.length; i++) if (hay[i] === needle[j]) j++
  return j === needle.length
}

// ---------------------------------------------------------------------------

function AboutSheet(): JSX.Element {
  const set = useStore((s) => s.set)
  const toolchain = useStore((s) => s.toolchain)
  return (
    <SheetFrame title="About F-Code" width={420} footer={<button className="btn primary" onClick={() => set({ sheet: 'none' })}>OK</button>}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <img src={iconUrl} alt="" draggable={false} style={{ width: 72, height: 72, borderRadius: 18 }} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)' }}>F-Code</div>
          <div className="muted">Version {__APP_VERSION__}</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 11.5 }}>
            An Xcode-style Swift IDE for Windows.
            <br />
            {toolchain?.found ? toolchain.swiftVersion : 'No Swift toolchain detected.'}
          </div>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 11, lineHeight: 1.5, marginTop: 16 }}>
        F-Code is an independent project and is not affiliated with or endorsed by Apple Inc. Xcode is a trademark of Apple Inc.
        Swift and the Swift logo are trademarks of Apple Inc.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, color: 'var(--green)', fontSize: 11.5 }}>
        <Check style={{ width: 12, height: 12 }} /> Electron · React · Monaco · SourceKit-LSP · lldb-dap
      </div>
    </SheetFrame>
  )
}

function GotoLineSheet(): JSX.Element {
  const set = useStore((s) => s.set)
  const activePath = useStore((s) => s.activePath)
  const openFile = useStore((s) => s.openFile)
  const [v, setV] = useState('')
  const go = (): void => {
    const n = parseInt(v, 10)
    if (activePath && n > 0) void openFile(activePath, n)
    set({ sheet: 'none' })
  }
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && set({ sheet: 'none' })} style={{ paddingTop: 120 }}>
      <div className="quick-open" style={{ width: 320, position: 'relative' }}>
        <input autoFocus value={v} placeholder="Jump to line" style={{ paddingLeft: 16 }} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && go()} />
      </div>
    </div>
  )
}
