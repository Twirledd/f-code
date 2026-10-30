import http from 'http'
import net from 'net'
import { randomBytes, timingSafeEqual } from 'crypto'

/** A fresh per-session secret: 24 random bytes, URL-safe base64 (32 chars). Lives in memory only. */
export function newSessionToken(): string {
  return randomBytes(24).toString('base64url')
}

function tokenOk(header: string | undefined, token: string): boolean {
  const m = /^Bearer (\S+)$/.exec(header ?? '')
  if (!m) return false
  const a = Buffer.from(m[1])
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface AuthProxy {
  port: number
  close: () => void
}

/**
 * Loopback proxy in front of one end of the SSH tunnel. Every request must carry
 * `Authorization: Bearer <token>` (401 otherwise) and a Host header naming this proxy (421 otherwise, which
 * stops DNS-rebinding from a web page). Authorised requests are forwarded to the tunnel port on 127.0.0.1
 * with the credential stripped. Listens on port 0, so the OS hands us a free port atomically (no TOCTOU).
 *
 * Honest limit: the tunnel's own listening port is still a loopback port that any local process could
 * connect to directly; this proxy stops anything that only knows the proxy port, and web pages. A local
 * attacker who can scan loopback ports is outside what a token can protect against.
 */
export function startAuthProxy(targetPort: number, token: string): Promise<AuthProxy> {
  return new Promise((resolve, reject) => {
    const sockets = new Set<net.Socket>()
    const server = http.createServer((req, res) => {
      const reject401 = (code: number, msg: string): void => {
        res.writeHead(code, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', ...(code === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}) })
        res.end(msg)
        req.resume()
      }
      const addr = server.address() as net.AddressInfo | null
      const host = req.headers.host
      if (!addr || (host !== `127.0.0.1:${addr.port}` && host !== `localhost:${addr.port}`)) return reject401(421, 'misdirected request')
      if (!tokenOk(req.headers.authorization, token)) return reject401(401, 'missing or invalid bearer token')

      const headers = { ...req.headers, host: `127.0.0.1:${targetPort}` }
      delete headers.authorization
      const up = http.request({ host: '127.0.0.1', port: targetPort, localAddress: '127.0.0.1', method: req.method, path: req.url, headers }, (ur) => {
        res.writeHead(ur.statusCode ?? 502, ur.headers)
        ur.pipe(res)
      })
      up.on('error', () => {
        if (!res.headersSent) res.writeHead(502)
        res.end()
      })
      res.on('close', () => up.destroy())
      req.pipe(up)
    })
    server.requestTimeout = 0 // MJPEG responses never end
    server.headersTimeout = 15000
    server.on('connection', (s) => {
      sockets.add(s)
      s.once('close', () => sockets.delete(s))
    })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: (server.address() as net.AddressInfo).port,
        close: () => {
          server.close()
          for (const s of sockets) s.destroy()
        }
      })
    })
  })
}
