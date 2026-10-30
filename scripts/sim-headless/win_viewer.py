#!/usr/bin/env python3
"""Windows side: show the Mac's iOS Simulator in a browser, with touch and typing (stdlib only).

    python win_viewer.py --host <mac-ip> --alias <mac-name.local> --user <mac-user> --udid <UDID>

Opens http://127.0.0.1:9100/ . Nothing listens on the LAN: video and input travel inside SSH
tunnels, and the page is served on 127.0.0.1 only.

Modes
  wda          (default) Appium WebDriverAgent runs inside the Simulator. Gives ~10-18 fps video plus
               click = tap, drag = swipe, wheel = scroll, keyboard/paste = typing. Needs the one-time
               `mac_wda.sh setup` on the Mac (F-Code's Settings does this for you).
  screenshots  Fallback, view-only (~3-4 fps): a loop of `simctl io screenshot` on the Mac.
If WebDriverAgent isn't ready the viewer says so and falls back to screenshots.
"""
import argparse
import collections
import http.server
import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser

# What WebDriverAgent's /wda/keys treats as the delete key (verified against iOS 17.2).
BACKSPACE = "\b"

PAGE = """<!doctype html><meta charset=utf-8><title>Simulator</title>
<style>body{margin:0;background:#111;color:#bbb;font:13px system-ui;display:flex;flex-direction:column;align-items:center}
img{max-height:90vh;margin-top:8px;border-radius:24px;background:#000;outline:none;cursor:@CURSOR@;user-select:none}
#s{padding:6px}button{margin:6px 4px 0;padding:4px 14px}</style>
<div><button id=home @DIS@>Home</button></div>
<img id=i src=/stream draggable=false tabindex=0><div id=s>connecting...</div>
<script>
const W=@W@,H=@H@,INPUT=@INPUT@,i=document.getElementById('i'),s=document.getElementById('s');
const post=(p,b)=>fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})})
  .then(r=>r.ok||r.text().then(t=>s.textContent=t));
const pt=e=>{const r=i.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H}};
let d=null;
i.onmousedown=e=>{if(!INPUT||e.button!==0)return;d={...pt(e),t:Date.now()};i.focus()};
i.onmouseup=e=>{if(!d)return;const p=pt(e),a=d;d=null;
  if(Math.hypot(p.x-a.x,p.y-a.y)<8)post('/tap',{x:a.x,y:a.y});
  else post('/swipe',{x1:a.x,y1:a.y,x2:p.x,y2:p.y,d:Math.min(.8,Math.max(.1,(Date.now()-a.t)/1000))})};
i.onmouseleave=()=>{d=null};
let wy=0,wt=0;
i.onwheel=e=>{if(!INPUT)return;e.preventDefault();const p=pt(e),r=i.getBoundingClientRect();wy+=e.deltaY*W/r.width;
  clearTimeout(wt);wt=setTimeout(()=>{const dd=Math.max(-H*.6,Math.min(H*.6,wy));wy=0;
  if(Math.abs(dd)>4)post('/swipe',{x1:p.x,y1:p.y+dd/2,x2:p.x,y2:p.y-dd/2,d:.25})},90)};
i.onkeydown=e=>{if(!INPUT||e.ctrlKey||e.metaKey||e.altKey)return;
  const k={Enter:'enter',Backspace:'backspace',Tab:'tab'}[e.key];
  if(k){e.preventDefault();post('/keys',{key:k})}else if([...e.key].length===1){e.preventDefault();post('/keys',{text:e.key})}};
document.addEventListener('paste',e=>{if(INPUT&&document.activeElement===i){const t=e.clipboardData.getData('text');
  if(t){e.preventDefault();post('/keys',{text:t})}}});
document.getElementById('home').onclick=()=>post('/button',{name:'home'});
setInterval(()=>fetch('/status').then(r=>r.json()).then(j=>s.textContent=j.fps.toFixed(1)+' fps, '+j.frames+' frames'
  +(j.input?' - click, drag, scroll, type':' - view only')),1000);
</script>"""


class Hub:
    def __init__(self):
        self.cond = threading.Condition()
        self.frame = None
        self.seq = 0
        self.t0 = time.time()
        self.alive = True

    def push(self, data):
        with self.cond:
            self.frame, self.seq = data, self.seq + 1
            self.cond.notify_all()

    def end(self):
        with self.cond:
            self.alive = False
            self.cond.notify_all()


hub = Hub()


class InputQueue:
    """Input must reach WebDriverAgent strictly in order (concurrent requests get reordered: typing
    'tomcode' arrived as 'tcmeodo'), so HTTP handlers only enqueue and one worker thread delivers."""

    def __init__(self):
        self.q = collections.deque()
        self.cv = threading.Condition()

    def put(self, item):
        with self.cv:
            self.q.append(item)
            self.cv.notify()

    def get(self):
        with self.cv:
            while not self.q:
                self.cv.wait()
            return self.q.popleft()

    def take_text(self):
        """Pop consecutive text items waiting at the head of the queue and join them."""
        out = ""
        with self.cv:
            while self.q and self.q[0][0] == "text":
                out += self.q.popleft()[1]["text"]
        return out


def input_worker(wda, iq):
    keys = {"enter": "\n", "tab": "\t", "backspace": BACKSPACE}
    while True:
        kind, b = iq.get()
        try:
            if kind == "text":
                time.sleep(0.03)  # let fast typing pile up, then send it as one request
                wda.keys(list(b["text"] + iq.take_text()))
            elif kind == "key":
                wda.keys([keys[b["key"]]])
            elif kind == "tap":
                wda.tap(b["x"], b["y"])
            elif kind == "swipe":
                wda.swipe(b["x1"], b["y1"], b["x2"], b["y2"], b.get("d", 0.3))
            elif kind == "button":
                wda.button(b.get("name", "home"))
        except Exception as e:
            print("%s failed: %s" % (kind, e), file=sys.stderr, flush=True)


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def wait_port(port, seconds):
    end = time.time() + seconds
    while time.time() < end:
        try:
            socket.create_connection(("127.0.0.1", port), timeout=1).close()
            return True
        except OSError:
            time.sleep(0.25)
    return False


class Wda:
    """Minimal WebDriverAgent client over the SSH tunnel."""

    def __init__(self, port):
        self.base = "http://127.0.0.1:%d" % port
        self.sid = None

    def call(self, method, path, body=None, timeout=30):
        req = urllib.request.Request(self.base + path, method=method, headers={"Content-Type": "application/json"},
                                     data=json.dumps(body).encode() if body is not None else None)
        try:
            return json.loads(urllib.request.urlopen(req, timeout=timeout).read() or b"{}")
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read() or b"{}").get("value", {}).get("message", str(e))
            except ValueError:
                msg = str(e)
            raise RuntimeError(msg)

    def session(self):
        r = self.call("POST", "/session", {"capabilities": {}})
        self.sid = r.get("sessionId") or (r.get("value") or {}).get("sessionId")
        if not self.sid:
            raise RuntimeError("WebDriverAgent returned no session")
        # Don't wait for idle/animations (that is where WDA burns time and CPU); stream at half size.
        self.call("POST", "/session/%s/appium/settings" % self.sid, {"settings": {
            "waitForIdleTimeout": 0, "animationCoolOffTimeout": 0,
            "mjpegScalingFactor": 50, "mjpegServerFramerate": 20, "mjpegServerScreenshotQuality": 40}})
        return self.call("GET", "/session/%s/window/size" % self.sid)["value"]

    def _do(self, method, path, body=None):
        try:
            return self.call(method, "/session/%s%s" % (self.sid, path), body)
        except RuntimeError as e:
            if "session" not in str(e).lower():
                raise
            self.session()  # session went stale: make a new one and retry once
            return self.call(method, "/session/%s%s" % (self.sid, path), body)

    def tap(self, x, y):
        return self._do("POST", "/wda/tap/0", {"x": round(x), "y": round(y)})

    def swipe(self, x1, y1, x2, y2, d):
        return self._do("POST", "/wda/dragfromtoforduration",
                        {"fromX": round(x1), "fromY": round(y1), "toX": round(x2), "toY": round(y2), "duration": d})

    def keys(self, chars):
        return self._do("POST", "/wda/keys", {"value": chars})

    def button(self, name):
        return self._do("POST", "/wda/pressButton", {"name": name})

    def close(self):
        if self.sid:
            try:
                self.call("DELETE", "/session/%s" % self.sid, timeout=3)
            except Exception:
                pass


def read_screenshot_frames(proc):
    out = proc.stdout
    while True:
        header = out.readline()
        if not header:
            break
        if not header.startswith(b"XCF "):
            continue
        n = int(header[4:])
        data = out.read(n)
        if len(data) < n:
            break
        hub.push(data)
    hub.end()


def read_mjpeg(port):
    """Parse WebDriverAgent's multipart stream: 'Content-Length: N' headers followed by N JPEG bytes."""
    try:
        resp = urllib.request.urlopen("http://127.0.0.1:%d/" % port, timeout=30)
        buf = b""
        while True:
            chunk = resp.read(65536)
            if not chunk:
                break
            buf += chunk
            while True:
                h = buf.find(b"Content-Length:")
                if h < 0:
                    buf = buf[-64:] if len(buf) > (1 << 20) else buf
                    break
                eol = buf.find(b"\r\n\r\n", h)
                if eol < 0:
                    break
                try:
                    n = int(buf[h + 15:eol])
                except ValueError:
                    buf = buf[eol + 4:]
                    continue
                if len(buf) < eol + 4 + n:
                    break
                hub.push(buf[eol + 4:eol + 4 + n])
                buf = buf[eol + 4 + n:]
    except Exception as e:
        print("video stream ended: %s" % e, file=sys.stderr)
    hub.end()


def make_handler(args, wda, size, iq):
    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code, body, ctype="text/plain"):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == "/":
                page = (PAGE.replace("@W@", str(size[0])).replace("@H@", str(size[1]))
                        .replace("@INPUT@", "true" if wda else "false")
                        .replace("@CURSOR@", "pointer" if wda else "default").replace("@DIS@", "" if wda else "disabled"))
                self._send(200, page.encode(), "text/html")
            elif self.path == "/frame.jpg":
                with hub.cond:
                    f = hub.frame
                self._send(200, f, "image/jpeg") if f else self._send(503, b"no frame yet")
            elif self.path == "/status":
                with hub.cond:
                    n, up = hub.seq, max(0.001, time.time() - hub.t0)
                self._send(200, json.dumps({"frames": n, "fps": n / up, "input": bool(wda)}).encode(), "application/json")
            elif self.path == "/stream":
                self.send_response(200)
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=f")
                self.end_headers()
                seen = 0
                try:
                    while True:
                        with hub.cond:
                            hub.cond.wait_for(lambda: hub.seq != seen or not hub.alive, timeout=5)
                            if not hub.alive:
                                return
                            f, seen = hub.frame, hub.seq
                        if f:
                            self.wfile.write(b"--f\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n" % len(f))
                            self.wfile.write(f + b"\r\n")
                except (BrokenPipeError, ConnectionResetError, OSError):
                    return
            else:
                self._send(404, b"not found")

        def do_POST(self):
            if not wda:
                return self._send(501, b"View only: touch needs WebDriverAgent (run mac_wda.sh setup on the Mac).")
            try:
                n = int(self.headers.get("Content-Length") or 0)
                b = json.loads(self.rfile.read(n) or b"{}")
                if self.path == "/tap":
                    item = ("tap", {"x": float(b["x"]), "y": float(b["y"])})
                elif self.path == "/swipe":
                    item = ("swipe", {k: float(b[k]) for k in ("x1", "y1", "x2", "y2")} | {"d": float(b.get("d", 0.3))})
                elif self.path == "/keys" and "key" in b and b["key"] in ("enter", "tab", "backspace"):
                    item = ("key", {"key": b["key"]})
                elif self.path == "/keys" and isinstance(b.get("text"), str):
                    item = ("text", {"text": b["text"]})
                elif self.path == "/button":
                    item = ("button", {"name": str(b.get("name", "home"))})
                else:
                    return self._send(404, b"not found")
                iq.put(item)  # delivered in order by the worker thread; errors are logged there
                self._send(200, b"ok")
            except (KeyError, ValueError, TypeError):
                self._send(400, b"bad request")

    return H


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--host", required=True, help="Mac address (name or IP)")
    ap.add_argument("--alias", help="host name whose saved SSH key to check when --host is an IP")
    ap.add_argument("--user", required=True)
    ap.add_argument("--udid", required=True)
    ap.add_argument("--key", default=os.path.expanduser("~/.ssh/xcode_ed25519"))
    ap.add_argument("--mode", choices=["wda", "screenshots"], default="wda")
    ap.add_argument("--port", type=int, default=9100, help="local viewer port")
    ap.add_argument("--workers", type=int, default=2, help="screenshots mode: captures in flight")
    ap.add_argument("--max-fps", type=float, default=6.0, help="screenshots mode: frame cap")
    ap.add_argument("--load-limit", type=float, default=8.0, help="screenshots mode: Mac load above which capture throttles to 1 fps; 0 = off")
    ap.add_argument("--width", type=int, default=393, help="screenshots mode: device width in points")
    ap.add_argument("--height", type=int, default=852)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    opts = ["-i", args.key, "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "ServerAliveInterval=15"]
    if args.alias:  # dialling an IP: still verify against the key saved for the name, strictly
        opts += ["-o", "HostKeyAlias=" + args.alias.lower(), "-o", "StrictHostKeyChecking=yes"]
    else:
        opts += ["-o", "StrictHostKeyChecking=accept-new"]
    target = "%s@%s" % (args.user, args.host)
    ssh = ["ssh"] + opts + [target]

    procs, wda, size, mode = [], None, (args.width, args.height), args.mode

    if mode == "wda":
        print("starting WebDriverAgent in the Simulator (a cold boot can take a few minutes)...", flush=True)
        try:
            r = subprocess.run(ssh + ["bash ~/tomcode-sim/mac_wda.sh start %s" % args.udid], capture_output=True, text=True, timeout=330)
            if "READY" not in r.stdout:
                raise RuntimeError((r.stdout + r.stderr).strip() or "not ready")
            api, video = free_port(), free_port()
            tunnel = subprocess.Popen(["ssh", "-N", "-o", "ExitOnForwardFailure=yes",
                                       "-L", "127.0.0.1:%d:127.0.0.1:8100" % api, "-L", "127.0.0.1:%d:127.0.0.1:9100" % video] + opts + [target])
            procs.append(tunnel)
            if not wait_port(api, 15):
                raise RuntimeError("SSH tunnel did not come up")
            wda = Wda(api)
            w = wda.session()
            size = (w["width"], w["height"])
            threading.Thread(target=read_mjpeg, args=(video,), daemon=True).start()
        except Exception as e:
            print("touch input unavailable (%s); falling back to view-only screenshots" % e, file=sys.stderr)
            wda, mode = None, "screenshots"

    if mode == "screenshots":
        remote = "python3 -u ~/tomcode-sim/mac_frames.py %s --workers %d --max-fps %s --load-limit %s" % (
            args.udid, args.workers, args.max_fps, args.load_limit)
        p = subprocess.Popen(ssh + [remote], stdout=subprocess.PIPE, stderr=sys.stderr)
        procs.append(p)
        threading.Thread(target=read_screenshot_frames, args=(p,), daemon=True).start()

    iq = InputQueue()
    if wda:
        threading.Thread(target=input_worker, args=(wda, iq), daemon=True).start()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(args, wda, size, iq))
    url = "http://127.0.0.1:%d/" % args.port
    print("viewer: %s   (%s)   Ctrl+C to stop" % (url, "touch + typing" if wda else "view only"), flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        while hub.alive:
            time.sleep(0.5)
        print("stream ended", file=sys.stderr)
    except KeyboardInterrupt:
        pass
    finally:
        if wda:
            wda.close()
        for p in procs:
            p.terminate()
        srv.shutdown()


if __name__ == "__main__":
    main()
