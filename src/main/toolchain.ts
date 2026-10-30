import { execFile } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { promisify } from 'util'
import type { ToolchainInfo } from '@shared/types'

const execFileAsync = promisify(execFile)

function which(cmd: string): string | undefined {
  const exts = ['.exe', '.cmd', '.bat', '']
  for (const dir of (process.env.PATH ?? '').split(';')) {
    if (!dir) continue
    for (const ext of exts) {
      const p = join(dir, cmd + ext)
      if (existsSync(p)) return p
    }
  }
  return undefined
}

/** Known install roots for the swift.org Windows toolchain. */
function candidateRoots(): string[] {
  const roots: string[] = []
  const local = process.env.LOCALAPPDATA
  if (local) roots.push(join(local, 'Programs', 'Swift'))
  roots.push('C:\\Program Files\\Swift')
  const sysDrive = process.env.SystemDrive ?? 'C:'
  roots.push(join(sysDrive, 'Library', 'Developer', 'Toolchains'))
  return roots.filter(existsSync)
}

/** Find `<root>/Toolchains/<ver>/usr/bin` or `<root>/<ver>.xctoolchain/usr/bin`. */
function findToolchainBin(root: string): string | undefined {
  const direct = join(root, 'usr', 'bin')
  if (existsSync(join(direct, 'swift.exe'))) return direct
  const toolchains = existsSync(join(root, 'Toolchains')) ? join(root, 'Toolchains') : root
  try {
    const entries = readdirSync(toolchains).sort().reverse()
    for (const e of entries) {
      const bin = join(toolchains, e, 'usr', 'bin')
      if (existsSync(join(bin, 'swift.exe'))) return bin
    }
  } catch {
    /* ignore */
  }
  return undefined
}

let cached: ToolchainInfo | undefined

export async function detectToolchain(force = false): Promise<ToolchainInfo> {
  if (cached && !force) return cached
  const problems: string[] = []

  let swiftPath = which('swift')
  let bin: string | undefined = swiftPath ? dirname(swiftPath) : undefined

  if (!swiftPath) {
    for (const root of candidateRoots()) {
      const found = findToolchainBin(root)
      if (found) {
        bin = found
        swiftPath = join(found, 'swift.exe')
        break
      }
    }
  }

  if (!swiftPath || !bin) {
    cached = {
      found: false,
      problems: [
        'Swift toolchain not found. Install it from swift.org or with: winget install Swift.Toolchain',
        'The Windows toolchain also requires Visual Studio Build Tools with the "Desktop development with C++" workload and the Windows SDK.'
      ]
    }
    return cached
  }

  let swiftVersion: string | undefined
  try {
    const { stdout, stderr } = await execFileAsync(swiftPath, ['--version'], { timeout: 20000 })
    swiftVersion = (stdout || stderr).split(/\r?\n/)[0]?.trim()
  } catch (e) {
    problems.push(`swift --version failed: ${(e as Error).message}`)
  }

  const lspPath = [join(bin, 'sourcekit-lsp.exe'), which('sourcekit-lsp')].find((p) => p && existsSync(p))
  if (!lspPath) problems.push('sourcekit-lsp.exe not found next to swift.exe; code completion will be unavailable.')

  const lldbDapPath = [join(bin, 'lldb-dap.exe'), join(bin, 'lldb-vscode.exe'), which('lldb-dap')].find(
    (p) => p && existsSync(p)
  )
  if (!lldbDapPath) problems.push('lldb-dap.exe not found; debugging will be unavailable.')
  if (!findVcvars())
    problems.push(
      'Visual Studio Build Tools (C++ workload) not found — link.exe and the Windows SDK are required to build. Install with the command below.'
    )

  cached = {
    found: true,
    swiftPath,
    swiftVersion,
    lspPath,
    lldbDapPath,
    toolchainRoot: dirname(dirname(bin)),
    problems
  }
  return cached
}

// ---------------------------------------------------------------------------
// MSVC developer environment.
// SwiftPM on Windows needs link.exe, the Windows SDK and the UCRT, which are only
// on PATH/INCLUDE/LIB inside a Developer Command Prompt. We source vcvars64.bat
// once and reuse the resulting environment for every toolchain process.
// ---------------------------------------------------------------------------

let envCache: Promise<NodeJS.ProcessEnv> | undefined

function findVcvars(): string | undefined {
  const vswhere = join(
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe'
  )
  const candidates: string[] = []
  if (existsSync(vswhere)) {
    try {
      const { execFileSync } = require('child_process') as typeof import('child_process')
      const out = execFileSync(
        vswhere,
        ['-products', '*', '-latest', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'],
        { encoding: 'utf8', timeout: 15000 }
      ).trim()
      if (out) candidates.push(out)
    } catch {
      /* fall through to well-known paths */
    }
  }
  for (const edition of ['BuildTools', 'Community', 'Professional', 'Enterprise']) {
    for (const pf of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
      if (pf) candidates.push(join(pf, 'Microsoft Visual Studio', '2022', edition))
    }
  }
  for (const root of candidates) {
    const bat = join(root, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat')
    if (existsSync(bat)) return bat
  }
  return undefined
}

/** Environment for spawning swift / sourcekit-lsp / lldb-dap: MSVC dev env + toolchain bin on PATH. */
export function toolchainEnv(force = false): Promise<NodeJS.ProcessEnv> {
  if (envCache && !force) return envCache
  envCache = (async () => {
    const env: NodeJS.ProcessEnv = { ...process.env, SWIFTPM_ENABLE_SANDBOX: '0' }
    const bat = findVcvars()
    if (bat) {
      try {
        const { stdout } = await execFileAsync('cmd.exe', ['/d', '/s', '/c', `"call "${bat}" >nul 2>&1 && set"`], {
          timeout: 60000,
          maxBuffer: 4 * 1024 * 1024,
          windowsVerbatimArguments: true
        })
        for (const line of stdout.split(/\r?\n/)) {
          const i = line.indexOf('=')
          if (i > 0) env[line.slice(0, i)] = line.slice(i + 1)
        }
      } catch {
        /* without vcvars, linking will fail and the error will be shown in the console */
      }
    }
    const t = await detectToolchain()
    if (t.swiftPath) env.PATH = `${dirname(t.swiftPath)};${env.PATH ?? ''}`
    // The Swift runtime DLLs (swiftCore.dll, Foundation.dll, …) live in Programs\Swift\Runtimes\<ver>\usr\bin.
    // The installer adds that to the user PATH, which processes started earlier (like us) don't see.
    if (t.toolchainRoot) {
      const runtimes = join(dirname(dirname(t.toolchainRoot)), 'Runtimes')
      try {
        for (const v of readdirSync(runtimes).sort().reverse()) {
          const rt = join(runtimes, v, 'usr', 'bin')
          if (existsSync(join(rt, 'swiftCore.dll'))) {
            if (!(env.PATH ?? '').toLowerCase().includes(rt.toLowerCase())) env.PATH = `${rt};${env.PATH ?? ''}`
            break
          }
        }
      } catch {
        /* no Runtimes dir (e.g. toolchain in Program Files layout) */
      }
    }
    // The swift.org installer sets SDKROOT for new logins; set it ourselves if this process predates that.
    if (!env.SDKROOT && t.toolchainRoot) {
      const platforms = join(dirname(dirname(t.toolchainRoot)), 'Platforms')
      try {
        for (const v of readdirSync(platforms).sort().reverse()) {
          const sdk = join(platforms, v, 'Windows.platform', 'Developer', 'SDKs', 'Windows.sdk')
          if (existsSync(sdk)) {
            env.SDKROOT = sdk
            break
          }
        }
      } catch {
        /* no Platforms dir */
      }
    }
    return env
  })()
  return envCache
}

export function hasMsvc(): boolean {
  return !!findVcvars()
}

export function installCommands(): { title: string; command: string }[] {
  return [
    {
      title: 'Visual Studio 2022 Build Tools (C++ workload + Windows SDK)',
      command:
        'winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"'
    },
    { title: 'Swift toolchain', command: 'winget install --id Swift.Toolchain -e' }
  ]
}
