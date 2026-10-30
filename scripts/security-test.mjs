// Bundle scripts/security.test.ts with esbuild (already a dependency of electron-vite) and run it under node.
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const out = join(mkdtempSync(join(tmpdir(), 'fcode-sec-')), 'security.test.mjs')
await build({
  entryPoints: ['scripts/security.test.ts'],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'error'
})
const r = spawnSync(process.execPath, [out], { stdio: 'inherit' })
process.exit(r.status ?? 1)
