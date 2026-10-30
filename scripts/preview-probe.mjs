// Drives a shim-built app over the preview protocol without the IDE: prints the first
// tree, sends a tap to the first button, and verifies a second tree arrives.
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

const dir = process.argv[2]
const product = process.argv[3]
const exe = [
  join(dir, '.build', 'out', 'Products', 'Debug-windows-x86_64', `${product}.exe`),
  join(dir, '.build', 'debug', `${product}.exe`),
  join(dir, '.build', 'x86_64-unknown-windows-msvc', 'debug', `${product}.exe`)
].find(existsSync)
if (!exe) {
  console.log('exe not found')
  process.exit(2)
}
console.log('exe:', exe)
const proc = spawn(exe, [], { cwd: dir, env: process.env })
const PREFIX = '\u0001XC'
let buf = ''
let trees = 0
let firstButton
const summarize = (n, depth = 0, out = []) => {
  if (depth > 3 || out.length > 40) return out
  out.push(`${'  '.repeat(depth)}${n.t}${n.id ? ` #${n.id.slice(-30)}` : ''}${n.m ? ` [${n.m.map((m) => m.k).join(',')}]` : ''}${n.t === 'text' ? ` "${n.p.runs.map((r) => r.s).join('')}"` : ''}`)
  for (const c of n.c ?? []) summarize(c, depth + 1, out)
  return out
}
const findButton = (n) => {
  if (n.t === 'button' && n.id) return n.id
  for (const c of n.c ?? []) {
    const f = findButton(c)
    if (f) return f
  }
  return undefined
}
proc.stdout.on('data', (d) => {
  buf += d.toString('utf8')
  const lines = buf.split(/\r?\n/)
  buf = lines.pop()
  for (const line of lines) {
    if (!line.startsWith(PREFIX)) {
      console.log('[app]', line)
      continue
    }
    const msg = JSON.parse(line.slice(PREFIX.length))
    if (msg.type === 'ready') {
      console.log('ready, protocol', msg.protocol)
      proc.stdin.write(JSON.stringify({ type: 'env', colorScheme: 'dark', width: 402, height: 874 }) + '\n')
    } else if (msg.type === 'tree') {
      trees++
      const counter = (function find(n) {
        if (n.t === 'text' && /^\d+$/.test(n.p?.runs?.[0]?.s ?? '')) return n.p.runs[0].s
        for (const c of n.c ?? []) { const f = find(c); if (f !== undefined) return f }
      })(msg.root)
      console.log(`--- tree #${trees} (${line.length} bytes) selected=${msg.root.p?.selected} counter=${counter} ---`)
      if (trees === 1) {
        console.log(summarize(msg.root).join('\n'))
        firstButton = findButton(msg.root)
        console.log('tapping', firstButton)
        proc.stdin.write(JSON.stringify({ type: 'event', id: firstButton, kind: 'tap' }) + '\n')
        // Also switch to tab 1 and bump the counter.
        setTimeout(() => proc.stdin.write(JSON.stringify({ type: 'event', id: msg.root.id, kind: 'select', value: 1 }) + '\n'), 300)
      } else if (trees === 3) {
        const inc = (function find(n) {
          if (n.t === 'button' && n.c?.[0]?.p?.runs?.[0]?.s === '+') return n.id
          for (const c of n.c ?? []) { const f = find(c); if (f) return f }
        })(msg.root)
        console.log('counter tab shown; tapping +', inc)
        proc.stdin.write(JSON.stringify({ type: 'event', id: inc, kind: 'tap' }) + '\n')
      } else if (trees === 4) {
        const num = (function find(n) {
          if (n.t === 'text' && /^\d+$/.test(n.p?.runs?.[0]?.s ?? '')) return n.p.runs[0].s
          for (const c of n.c ?? []) { const f = find(c); if (f) return f }
        })(msg.root)
        console.log('counter value after tap:', num)
        setTimeout(() => proc.stdin.write(JSON.stringify({ type: 'quit' }) + '\n'), 700)
      }
    } else {
      console.log('msg', msg.type, msg.text ?? '')
    }
  }
})
proc.stderr.on('data', (d) => console.log('[stderr]', d.toString()))
proc.on('close', (code) => {
  console.log('exit', code, 'trees', trees)
  process.exit(trees >= 4 ? 0 : 1)
})
setTimeout(() => {
  console.log('timeout')
  proc.kill()
}, 15000)
