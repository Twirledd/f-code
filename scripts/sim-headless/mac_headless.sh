#!/bin/bash
# Mac side. Boot / stop / inspect an iOS Simulator WITHOUT opening Simulator.app.
#   mac_headless.sh boot UDID | shutdown UDID | status UDID
# Prints one JSON line. Uses only Apple's own tools (xcrun simctl); nothing to install.
#
# Why this exists: `simctl boot` starts the device with no window. Simulator.app is a separate
# GUI that composites the screen into a window (extra WindowServer/GPU work) and, on this
# Mac, quitting it also SHUT DOWN the devices it had booted. So we never launch it, and we
# only warn if it is already running.
set -u
cmd="${1:-status}"
U="${2:?usage: mac_headless.sh boot|shutdown|status UDID}"
# Independent re-validation (the caller already checks, but this script must not trust its caller): a simulator
# UDID is 8-4-4-4-12 hex digits and nothing else, so it can never carry shell syntax into xcodebuild / simctl.
valid_udid() { [[ "${1:-}" =~ ^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$ ]]; }
need_udid()  { valid_udid "${1:-}" || { echo "invalid simulator UDID" >&2; exit 2; }; }
need_udid "$U"
SIM="$(xcrun -f simctl)"

gui() { pgrep -x Simulator >/dev/null 2>&1 && echo running || echo closed; }
state() { "$SIM" list devices 2>/dev/null | grep "$U" | grep -oE '\((Booted|Shutdown|Booting|Shutting Down)\)' | tr -d '()' | head -1; }
report() {
  printf '{"udid":"%s","state":"%s","simulator_app":"%s","load1":%s}\n' \
    "$U" "$(state)" "$(gui)" "$(sysctl -n vm.loadavg | awk '{print $2}')"
}

case "$cmd" in
  boot)
    if [ "$(state)" != "Booted" ]; then
      "$SIM" boot "$U" 2>&1 | grep -v "current state: Booted" || true
      "$SIM" bootstatus "$U" -b >/dev/null 2>&1 || true   # blocks until SpringBoard is up
    fi
    [ "$(gui)" = "running" ] && echo "note: Simulator.app is open; closing it frees CPU/GPU but also shuts down devices it booted, so close it BEFORE booting." >&2
    report ;;
  shutdown) "$SIM" shutdown "$U" >/dev/null 2>&1 || true; report ;;
  status) report ;;
  *) echo "unknown command: $cmd" >&2; exit 2 ;;
esac
