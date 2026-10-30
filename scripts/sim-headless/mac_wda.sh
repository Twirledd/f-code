#!/bin/bash
# Mac side. Manage Appium's WebDriverAgent (WDA): an agent that runs INSIDE the booted simulator and gives us
# touch / swipe / typing (HTTP :8100) and a fast MJPEG screen stream (:9100). Both bind to this Mac's
# localhost; reach them from Windows through an SSH tunnel, never open them to the network.
#
#   mac_wda.sh setup            one time: fetch the pinned release and build it (~10 min on a 2015 Air)
#   mac_wda.sh start UDID       run it; prints READY once http://127.0.0.1:8100/status answers (~45 s)
#   mac_wda.sh status | stop
#
# Pinned to v5.15.9 (31 Jan 2024): the last of the v5 line that shipped around Xcode 15.2. Newer majors
# (v16.x today) were not tried and probably need a newer Xcode than this Mac has.
set -u
TAG="v5.15.9"
ROOT="$HOME/tomcode-sim"; SRC="$ROOT/wda-src"; DD="$ROOT/wda-build"
LOG="$ROOT/wda-run.log"; PIDF="$ROOT/wda-run.pid"
cmd="${1:-status}"
# Independent re-validation (the caller already checks, but this script must not trust its caller): a simulator
# UDID is 8-4-4-4-12 hex digits and nothing else, so it can never carry shell syntax into xcodebuild / simctl.
valid_udid() { [[ "${1:-}" =~ ^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$ ]]; }
need_udid()  { valid_udid "${1:-}" || { echo "invalid simulator UDID" >&2; exit 2; }; }

up() { curl -s -m 3 http://127.0.0.1:8100/status 2>/dev/null | grep -q '"ready" : true'; }

case "$cmd" in
  setup)
    need_udid "${2:-}"
    mkdir -p "$ROOT"
    [ -d "$SRC/.git" ] || git clone --quiet --filter=blob:none --no-checkout https://github.com/appium/WebDriverAgent.git "$SRC" || exit 1
    git -C "$SRC" checkout -q "$TAG" || exit 1
    U="${2:?usage: mac_wda.sh setup UDID}"; need_udid "$U"
    ( cd "$SRC" && xcodebuild build-for-testing -project WebDriverAgent.xcodeproj -scheme WebDriverAgentRunner \
        -destination "platform=iOS Simulator,id=$U" -derivedDataPath "$DD" CODE_SIGNING_ALLOWED=NO ) > "$ROOT/wda-build.log" 2>&1
    tail -3 "$ROOT/wda-build.log" | grep -E "TEST BUILD (SUCCEEDED|FAILED)" || { echo "build failed; see $ROOT/wda-build.log"; exit 1; } ;;
  start)
    U="${2:?usage: mac_wda.sh start UDID}"; need_udid "$U"
    up && { echo READY; exit 0; }
    # xcodebuild's test run sometimes hangs silently right after a cold simulator boot (observed: 6+ minutes
    # parked in wait4 with no output). A healthy start answers in ~45 s, so give each attempt ~80 s and
    # then kill it and start over (up to 3 attempts).
    for attempt in 1 2 3; do
      pkill -f WebDriverAgentRunner 2>/dev/null; sleep 1
      ( cd "$SRC" && TEST_RUNNER_USE_PORT=8100 TEST_RUNNER_MJPEG_SERVER_PORT=9100 nohup xcodebuild test-without-building \
          -project WebDriverAgent.xcodeproj -scheme WebDriverAgentRunner -destination "platform=iOS Simulator,id=$U" \
          -derivedDataPath "$DD" > "$LOG" 2>&1 < /dev/null & echo $! > "$PIDF" )
      n=0; until up || [ $n -ge 20 ]; do sleep 4; n=$((n+1)); done
      up && { echo READY; exit 0; }
      echo "attempt $attempt: no answer after ~80 s$([ "$attempt" -lt 3 ] && echo ', restarting')" >&2
    done
    echo "not ready; see $LOG"; exit 1 ;;
  status) up && echo '{"wda":"ready","port":8100,"mjpeg":9100}' || echo '{"wda":"stopped"}' ;;
  stop) [ -f "$PIDF" ] && kill "$(cat "$PIDF")" 2>/dev/null; pkill -f WebDriverAgentRunner 2>/dev/null; sleep 1; up && echo "still running" || echo stopped ;;
  *) echo "usage: $0 setup UDID | start UDID | status | stop"; exit 2 ;;
esac
