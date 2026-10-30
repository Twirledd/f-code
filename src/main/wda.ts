import http from 'http'
import net from 'net'

/**
 * Client for Appium's WebDriverAgent running inside the Mac's Simulator, reached through an SSH
 * tunnel on 127.0.0.1. WDA gives us touch / swipe / typing (HTTP) and an MJPEG screen stream.
 * Endpoint names were read from the pinned v5.15.9 source and exercised against iOS 17.2.
 */

function request(port: number, token: string, method: string, path: string, body?: unknown, timeoutMs = 20000): Promise<{ value?: unknown; sessionId?: string }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : Buffer.from(JSON.stringify(body))
    const req = http.request(
      {
        host: '127.0.0.1',
        localAddress: '127.0.0.1',
        port,
        method,
        path,
        timeout: timeoutMs,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(data ? { 'Content-Length': data.length } : {}) }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          let json: { value?: { message?: string; error?: string } | unknown; sessionId?: string } = {}
          try {
            json = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
          } catch {
            /* non-JSON body: treat as empty */
          }
          if ((res.statusCode ?? 200) >= 400) {
            const v = json.value as { message?: string; error?: string } | undefined
            reject(new Error(v?.message ?? v?.error ?? `HTTP ${res.statusCode}`))
          } else resolve(json as { value?: unknown; sessionId?: string })
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('WebDriverAgent request timed out')))
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

export interface WdaPoints {
  width: number
  height: number
}

export class WdaClient {
  private sid: string | undefined
  constructor(
    private port: number,
    private token: string
  ) {}

  /** A session with no bundle id attaches to whatever app is in front, so `simctl launch --console` keeps working. */
  async createSession(): Promise<void> {
    const r = await request(this.port, this.token, 'POST', '/session', { capabilities: {} })
    this.sid = r.sessionId ?? (r.value as { sessionId?: string } | undefined)?.sessionId
    if (!this.sid) throw new Error('WebDriverAgent returned no session')
    // Don't wait for the app to go idle or animations to finish: that is where WDA spends its time and CPU.
    await request(this.port, this.token, 'POST', `/session/${this.sid}/appium/settings`, {
      settings: {
        waitForIdleTimeout: 0,
        animationCoolOffTimeout: 0,
        mjpegScalingFactor: 50,
        mjpegServerFramerate: 20,
        mjpegServerScreenshotQuality: 40
      }
    })
  }

  async windowSize(): Promise<WdaPoints> {
    const r = await request(this.port, this.token, 'GET', `/session/${this.sid}/window/size`)
    const v = r.value as WdaPoints
    if (!v?.width || !v?.height) throw new Error('WebDriverAgent reported no window size')
    return v
  }

  /** Run `fn` with the live session; if WDA says the session is gone, make a new one and retry once. */
  private async withSession<T>(fn: (sid: string) => Promise<T>): Promise<T> {
    if (!this.sid) await this.createSession()
    try {
      return await fn(this.sid!)
    } catch (e) {
      if (!/session/i.test((e as Error).message)) throw e
      this.sid = undefined
      await this.createSession()
      return fn(this.sid!)
    }
  }

  tap(x: number, y: number): Promise<unknown> {
    return this.withSession((s) => request(this.port, this.token, 'POST', `/session/${s}/wda/tap/0`, { x, y }))
  }

  swipe(fromX: number, fromY: number, toX: number, toY: number, duration: number): Promise<unknown> {
    return this.withSession((s) => request(this.port, this.token, 'POST', `/session/${s}/wda/dragfromtoforduration`, { fromX, fromY, toX, toY, duration }))
  }

  keys(chars: string[]): Promise<unknown> {
    return this.withSession((s) => request(this.port, this.token, 'POST', `/session/${s}/wda/keys`, { value: chars }))
  }

  button(name: string): Promise<unknown> {
    return this.withSession((s) => request(this.port, this.token, 'POST', `/session/${s}/wda/pressButton`, { name }))
  }

  async close(): Promise<void> {
    const s = this.sid
    this.sid = undefined
    if (s) await request(this.port, this.token, 'DELETE', `/session/${s}`, undefined, 3000).catch(() => undefined)
  }
}

/**
 * Read WDA's MJPEG stream: multipart parts of `Content-Length: N\r\n\r\n<N bytes of JPEG>`.
 * Returns a handle to stop it; `onEnd` fires once when the stream ends or fails.
 */
export function readMjpeg(port: number, token: string, onFrame: (jpeg: Buffer) => void, onEnd: (err?: Error) => void): { close: () => void } {
  let ended = false
  const end = (err?: Error): void => {
    if (ended) return
    ended = true
    onEnd(err)
  }
  const req = http.get({ host: '127.0.0.1', localAddress: '127.0.0.1', port, path: '/', headers: { Authorization: `Bearer ${token}` } }, (res) => {
    if ((res.statusCode ?? 200) !== 200) {
      res.resume()
      return end(new Error(`MJPEG stream refused: HTTP ${res.statusCode}`))
    }
    let buf = Buffer.alloc(0)
    res.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk])
      for (;;) {
        const h = buf.indexOf('Content-Length:')
        if (h < 0) {
          if (buf.length > 1 << 20) buf = buf.subarray(buf.length - 64) // never grow without bound
          return
        }
        const eol = buf.indexOf('\r\n\r\n', h)
        if (eol < 0) return
        const len = parseInt(buf.subarray(h + 15, eol).toString('ascii'), 10)
        const start = eol + 4
        if (!Number.isFinite(len) || len <= 0) {
          buf = buf.subarray(start)
          continue
        }
        if (buf.length < start + len) return
        onFrame(buf.subarray(start, start + len))
        buf = buf.subarray(start + len)
      }
    })
    res.on('end', () => end())
    res.on('error', (e) => end(e))
  })
  req.on('error', (e) => end(e))
  return { close: () => req.destroy() }
}

/**
 * A free TCP port on 127.0.0.1. Inherently racy (the port is released before the caller binds it), so every
 * caller must bind with a retry loop (see `withFreePorts`) and treat a bind failure as "pick again".
 */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo
      s.close(() => resolve(port))
    })
  })
}

/** Resolve once something accepts connections on the port, or reject after `ms`. */
export async function waitPort(port: number, ms: number): Promise<void> {
  const until = Date.now() + ms
  for (;;) {
    const ok = await new Promise<boolean>((res) => {
      const c = net.connect({ port, host: '127.0.0.1', localAddress: '127.0.0.1' })
      c.once('connect', () => {
        c.destroy()
        res(true)
      })
      c.once('error', () => res(false))
    })
    if (ok) return
    if (Date.now() > until) throw new Error(`Nothing is listening on 127.0.0.1:${port}`)
    await new Promise((r) => setTimeout(r, 250))
  }
}

/**
 * Run `attempt(ports)` with `count` fresh loopback ports; if it throws a retryable error (the port was taken
 * between freePort() and the real bind) pick new ports and try again, up to `tries` times.
 */
export async function withFreePorts<T>(count: number, attempt: (ports: number[]) => Promise<T>, tries = 5): Promise<T> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    const ports: number[] = []
    while (ports.length < count) {
      const p = await freePort()
      if (!ports.includes(p)) ports.push(p)
    }
    try {
      return await attempt(ports)
    } catch (e) {
      last = e
      if (!(e instanceof PortTakenError)) throw e
    }
  }
  throw new Error(`Couldn't bind a free loopback port after ${tries} tries: ${(last as Error)?.message ?? last}`)
}

/** Thrown by an `attempt` when its bind lost the race for a port: the signal for withFreePorts to retry. */
export class PortTakenError extends Error {}
