import React from 'react'
import { useStore } from '@/state/store'
import { Folder, GitHub, Package, Plus, SwiftBird } from './Icons'
import iconUrl from '../assets/icon.png'

export function Welcome(): JSX.Element {
  const recent = useStore((s) => s.recent)
  const toolchain = useStore((s) => s.toolchain)
  const set = useStore((s) => s.set)
  const setProject = useStore((s) => s.setProject)

  const open = async (): Promise<void> => {
    await window.xcode.project.openDialog()
  }
  const openRecent = async (path: string): Promise<void> => {
    try {
      await window.xcode.project.open(path)
    } catch (e) {
      useStore.getState().showToast(`Couldn't open project: ${(e as Error).message}`)
      set({ recent: await window.xcode.project.recent() })
    }
  }
  void setProject

  return (
    <div className="welcome" style={{ position: 'relative' }}>
      <div className="hero">
        <img className="logo" src={iconUrl} alt="" draggable={false} />
        <h1>Welcome to F-Code</h1>
        <div className="ver">Version {__APP_VERSION__} — Swift for Windows</div>
        <div className="actions">
          <button className="action" onClick={() => set({ sheet: 'newProject' })}>
            <span className="ic">
              <Plus />
            </span>
            <div>
              <b>Create New Project…</b>
              <span>Start a new Swift package from a template</span>
            </div>
          </button>
          <button className="action" onClick={() => void open()}>
            <span className="ic" style={{ background: 'var(--text-tertiary)' }}>
              <Folder />
            </span>
            <div>
              <b>Open Existing Project…</b>
              <span>Open a folder containing Package.swift</span>
            </div>
          </button>
          <button className="action" onClick={() => set({ sheet: 'clone' })}>
            <span className="ic" style={{ background: '#24292f', color: '#fff' }}>
              <GitHub />
            </span>
            <div>
              <b>Clone Git Repository…</b>
              <span>Download a project from GitHub or another Git host</span>
            </div>
          </button>
          <button className="action" onClick={() => set({ sheet: 'settings' })}>
            <span className="ic" style={{ background: '#f05138' }}>
              <SwiftBird />
            </span>
            <div>
              <b>Swift Toolchain…</b>
              <span>{toolchain?.found ? toolchain.swiftVersion : 'Install or locate the Swift toolchain'}</span>
            </div>
          </button>
        </div>
      </div>
      <div className="recent">
        {recent.length === 0 && <div className="empty">No Recent Projects</div>}
        {recent.map((r) => (
          <div key={r.path} className="row" onClick={() => void openRecent(r.path)} title={r.path}>
            <span className="row-icon">
              <Package className="icon-package" />
            </span>
            <div className="meta">
              <b>{r.name}</b>
              <span>{r.path}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="toolchain-note">
        <span className="dot" style={{ background: toolchain?.found ? 'var(--green)' : 'var(--orange)' }} />
        {toolchain?.found ? `Swift ready — ${toolchain.swiftVersion}` : 'Swift toolchain not found'}
        {!toolchain?.found && <a onClick={() => set({ sheet: 'settings' })}>Set up…</a>}
      </div>
    </div>
  )
}
