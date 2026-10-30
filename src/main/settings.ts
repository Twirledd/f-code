import { app } from 'electron'
import { promises as fs, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { MacConnection, RecentProject } from '@shared/types'

interface Settings {
  recentProjects: RecentProject[]
  windowBounds?: { x: number; y: number; width: number; height: number }
  theme: 'dark' | 'light'
  mac?: MacConnection
  simulatorUdid?: string
}

const defaults: Settings = { recentProjects: [], theme: 'dark' }

function file(): string {
  return join(app.getPath('userData'), 'settings.json')
}

let state: Settings | undefined

export function load(): Settings {
  if (state) return state
  try {
    if (existsSync(file())) {
      // Tolerate a UTF-8 BOM (Windows PowerShell 5.1 adds one when editing the file by hand).
      const loaded: Settings = { ...defaults, ...JSON.parse(readFileSync(file(), 'utf8').replace(/^﻿/, '')) }
      state = loaded
      return loaded
    }
  } catch {
    /* corrupt settings — start fresh */
  }
  const fresh: Settings = { ...defaults }
  state = fresh
  return fresh
}

export async function save(patch: Partial<Settings>): Promise<Settings> {
  state = { ...load(), ...patch }
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(file(), JSON.stringify(state, null, 2), 'utf8')
  return state
}

export async function addRecent(path: string, name: string): Promise<RecentProject[]> {
  const list = load().recentProjects.filter((r) => r.path !== path)
  list.unshift({ path, name, openedAt: Date.now() })
  await save({ recentProjects: list.slice(0, 12) })
  return load().recentProjects
}
