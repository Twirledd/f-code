#!/usr/bin/env python3
"""Mac side: stream a booted iOS Simulator's screen as JPEG frames on stdout (Python 3.9, stdlib only).

Framing, per frame:  b"XCF <n>\\n" followed by n bytes of JPEG  (same as F-Code's own stream).

Measured on the 2015 MacBook Air: one `simctl io screenshot` takes ~420-580 ms, of which ~250 ms is
just starting the simctl process, so a single serial loop tops out near 2.7 fps. This keeps
--workers captures in flight at once (staggered to --max-fps) so frames overlap, and drops any
frame that finishes after a newer one. A load guard throttles capture to 1 fps while the Mac is
already overloaded, so the stream never makes a busy machine worse (it slows down, never stops).

It cannot take the Simulator off the Mac's CPU/GPU: the Simulator itself renders there. This
only changes how often we read its screen.
"""
import argparse
import os
import subprocess
import sys
import threading
import time


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("udid")
    ap.add_argument("--workers", type=int, default=2, help="captures in flight at once (default 2)")
    ap.add_argument("--max-fps", type=float, default=6.0, help="upper bound on frame rate (default 6)")
    ap.add_argument("--load-limit", type=float, default=8.0,
                    help="while the 1-minute load average is above this, throttle to 1 fps; 0 = off")
    ap.add_argument("--duration", type=float, default=0, help="stop after N seconds (default: run until closed)")
    ap.add_argument("--stats", action="store_true", help="print a summary to stderr at exit")
    a = ap.parse_args()

    simctl = subprocess.check_output(["xcrun", "-f", "simctl"]).decode().strip()
    out = sys.stdout.buffer
    lock = threading.Lock()  # guards stdout, the slot clock and the counters
    stop = threading.Event()
    interval = 1.0 / a.max_fps
    t_end = time.time() + a.duration if a.duration else None
    st = {"next_slot": time.time(), "last_started": 0.0, "sent": 0, "dropped": 0,
          "fails": 0, "lat": 0.0, "paused": 0, "first": None, "bad": False}

    def worker():
        while not stop.is_set():
            if t_end and time.time() > t_end:
                stop.set()
                break
            overloaded = bool(a.load_limit) and os.getloadavg()[0] > a.load_limit
            with lock:  # claim the next time slot so workers stay staggered
                if overloaded:
                    st["paused"] += 1
                slot = max(time.time(), st["next_slot"])
                st["next_slot"] = slot + (max(interval, 1.0) if overloaded else interval)
            if stop.wait(max(0.0, slot - time.time())):
                break
            started = time.time()
            try:
                p = subprocess.run([simctl, "io", a.udid, "screenshot", "--type=jpeg", "-"],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
                ok = p.returncode == 0 and p.stdout[:2] == b"\xff\xd8"
                err = p.stderr.decode("utf-8", "replace").strip()
            except subprocess.TimeoutExpired:
                p, ok, err = None, False, "screenshot timed out after 30 s"
            with lock:
                if not ok:
                    st["fails"] += 1
                    if st["fails"] == 1 or st["fails"] % 4 == 0:
                        print("capture failed: %s" % (err or "unknown error"), file=sys.stderr, flush=True)
                    if st["fails"] >= 8:
                        st["bad"] = True
                        stop.set()
                    continue
                st["fails"] = 0
                if started < st["last_started"]:
                    st["dropped"] += 1  # an older capture finished after a newer one
                    continue
                st["last_started"] = started
                try:
                    out.write(b"XCF %d\n" % len(p.stdout))
                    out.write(p.stdout)
                    out.flush()
                except (BrokenPipeError, OSError):
                    stop.set()  # the reader went away
                    continue
                st["sent"] += 1
                st["lat"] += time.time() - started
                if st["first"] is None:
                    st["first"] = time.time()

    t0 = time.time()
    threads = [threading.Thread(target=worker, daemon=True) for _ in range(max(1, a.workers))]
    for t in threads:
        t.start()
    try:
        while not stop.wait(0.25):
            pass
    except KeyboardInterrupt:
        stop.set()
    for t in threads:
        t.join(timeout=35)
    if a.stats:
        span = max(0.001, time.time() - (st["first"] or t0))
        n = st["sent"]
        print("frames=%d dropped=%d throttled-slots=%d fps=%.2f avg-latency=%.0fms workers=%d" %
              (n, st["dropped"], st["paused"], n / span, 1000 * st["lat"] / max(1, n), a.workers),
              file=sys.stderr)
    sys.exit(3 if st["bad"] else 0)


if __name__ == "__main__":
    main()
