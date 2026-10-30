#!/bin/bash
# Mac side. Keeps ONE simulator booted (headless, no Simulator.app) and its WebDriverAgent running, forever.
# Run by launchd as the LaunchAgent dev.tomcode.simhost (see mac_persistent_sim.sh), so after a login the Mac
# boots the simulator once and F-Code only ever *attaches* to it: no cold-boot storm on every Run.
#
#   mac_keepalive.sh UDID
#
# Also keeps the Mac awake for as long as it runs (caffeinate -i -d -s, bound to this script's lifetime), so no
# separate manual `caffeinate` is needed. Everything is logged to ~/tomcode-sim/keepalive.log.
#
# The simulator trim (mac_sim_trim.sh) is RUNTIME-ONLY: it is lost whenever the simulator boots (measured: after a
# reboot 0 of 62 disabled services were still disabled). So if ~/tomcode-sim/trim.tier exists, this script re-applies
# that tier after every boot and whenever it notices the trim is gone.
set -u
U="${1:?usage: mac_keepalive.sh UDID}"
# Independent re-validation (the caller already checks, but this script must not trust its caller): a simulator
# UDID is 8-4-4-4-12 hex digits and nothing else, so it can never carry shell syntax into xcodebuild / simctl.
valid_udid() { [[ "${1:-}" =~ ^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$ ]]; }
need_udid()  { valid_udid "${1:-}" || { echo "invalid simulator UDID" >&2; exit 2; }; }
need_udid "$U"
ROOT="$HOME/tomcode-sim"
LOG="$ROOT/keepalive.log"
SIMCTL="$(/usr/bin/xcrun -f simctl)"
log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

/usr/bin/caffeinate -i -d -s -w $$ &   # exits by itself when this script exits
trap 'kill $! 2>/dev/null' EXIT

wda_up()  { /usr/bin/curl -s -m 3 http://127.0.0.1:8100/status 2>/dev/null | /usr/bin/grep -q '"ready" : true'; }
booted()  { "$SIMCTL" list devices 2>/dev/null | /usr/bin/grep "$U" | /usr/bin/grep -q '(Booted)'; }
trimmed() { [ "$("$SIMCTL" spawn "$U" launchctl print-disabled system 2>/dev/null | /usr/bin/grep -c '=> disabled')" -ge 5 ]; }
apply_trim() {
  [ -f "$ROOT/trim.tier" ] || return 0
  log "applying simulator trim tier '$(cat "$ROOT/trim.tier")'"
  TOMCODE_NO_CENSUS=1 /bin/bash "$ROOT/mac_sim_trim.sh" apply "$(cat "$ROOT/trim.tier")" "$U" >> "$LOG" 2>&1
}
# Run a command with a hard time limit (a stuck xcodebuild must never wedge this loop).
limited() { local secs="$1"; shift; /usr/bin/perl -e 'alarm shift; exec @ARGV' "$secs" "$@"; }

# Wait until the cold-boot storm is over (1-minute load average < 5 twice in a row, capped at 15 min).
# Measured: starting xcodebuild's test run while the freshly booted simulator is still in its storm makes the
# simulated userland RESTART (SpringBoard uptime reset every ~95 s, agent never up); on a settled simulator the same
# start works first try in ~37 s with no restart.
settle() {
  local ok=0 waited=0 l
  while [ "$waited" -lt 900 ]; do
    l="$(/usr/sbin/sysctl -n vm.loadavg | /usr/bin/awk '{print $2}')"
    if /usr/bin/awk -v l="$l" 'BEGIN{exit !(l<5)}'; then ok=$((ok+1)); else ok=0; fi
    [ "$ok" -ge 2 ] && return 0
    sleep 10; waited=$((waited+10))
  done
  log "load still high after 15 min; continuing anyway"
}

log "keepalive started for $U"
while :; do
  if ! booted; then
    log "simulator is not booted: booting it headless"
    "$SIMCTL" boot "$U" >> "$LOG" 2>&1
    "$SIMCTL" bootstatus "$U" -b >/dev/null 2>&1
    log "simulator booted; short pause, then trim (it shortens the storm), then wait for it to settle"
    sleep 30
    apply_trim
    settle
  elif [ -f "$ROOT/trim.tier" ] && ! trimmed; then
    log "simulator is up but the trim is gone (it restarted?)"
    apply_trim
  fi
  if ! wda_up; then
    settle
    log "WebDriverAgent is not answering: starting it"
    # Output goes to the log file, not through a pipe; capped at 5 minutes.
    limited 300 /bin/bash "$ROOT/mac_wda.sh" start "$U" >> "$LOG" 2>&1
    wda_up && log "WebDriverAgent ready" || { log "WebDriverAgent still not ready; retrying in 60 s"; sleep 60; continue; }
  fi
  sleep 30
done
