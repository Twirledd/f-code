#!/bin/bash
# Run ON THE MAC, in Terminal, as yourself. One command for the whole "quiet, always-on simulator host" setup.
#
#   bash ~/tomcode-sim/mac_ultra_mode.sh status [UDID]
#   bash ~/tomcode-sim/mac_ultra_mode.sh apply [safe|max] [UDID]     # default tier: safe
#   bash ~/tomcode-sim/mac_ultra_mode.sh revert [UDID]
#
# apply does, in order (each step is also a script you can run alone):
#   1. mac_server_mode.sh apply     macOS side: Spotlight/Photos/Siri agents off, never sleep on AC.   [asks for sudo; skipped if already applied]
#   2. mac_sim_trim.sh apply TIER   simulated iOS: disables ~60 background services; verifies no log storm follows.
#                                   (Runtime-only: the keep-alive re-applies it after every simulator boot.)
#   3. mac_persistent_sim.sh install   a LaunchAgent that boots the simulator at login and keeps it + WebDriverAgent up.
# revert undoes 3, 2 and 1.
#
# What was measured (2015 MacBook Air, iOS 17.2 simulator): one simulated service (apsd) caused 74% of all log lines
# and most of the idle CPU; trimming it took the Mac from 20.9% busy to 7.0% busy at idle. The macOS side has
# little left to give: its remaining top processes (launchd, tccd, trustd, WindowServer, logd) are core and untouchable.
set -u
ROOT="$HOME/tomcode-sim"
cmd="${1:-status}"
case "$cmd" in apply) tier="${2:-safe}"; U="${3:-}" ;; *) tier=""; U="${2:-}" ;; esac
[ -z "$U" ] && [ -f "$ROOT/persistent.udid" ] && U="$(cat "$ROOT/persistent.udid")"
[ -z "$U" ] && U="$(xcrun simctl list devices booted | grep -oE '[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}' | head -1)"
[ -z "$U" ] && { echo "boot a simulator first, or pass its UDID (xcrun simctl list devices available)"; exit 2; }
# Independent re-validation (the caller already checks, but this script must not trust its caller): a simulator
# UDID is 8-4-4-4-12 hex digits and nothing else, so it can never carry shell syntax into xcodebuild / simctl.
valid_udid() { [[ "${1:-}" =~ ^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$ ]]; }
need_udid()  { valid_udid "${1:-}" || { echo "invalid simulator UDID" >&2; exit 2; }; }
need_udid "$U"
B() { /bin/bash "$ROOT/$1" "${@:2}"; }

case "$cmd" in
  status)
    echo "################ simulator $U"; B mac_sim_trim.sh status "$U"
    echo; echo "################ always-on"; B mac_persistent_sim.sh status
    echo; echo "################ macOS side"; B mac_server_mode.sh status 2>&1 | sed -n '1,12p' ;;
  apply)
    case "$tier" in safe|max) ;; *) echo "tier must be safe or max"; exit 2 ;; esac
    echo "== 1/3 macOS side"
    if [ -f "$ROOT/server-mode.backup" ]; then echo "already applied (backup exists); skipping"; else B mac_server_mode.sh apply || exit 1; fi
    echo; echo "== 2/3 simulated iOS ($tier tier)"
    xcrun simctl list devices | grep "$U" | grep -q '(Booted)' || { B mac_headless.sh boot "$U"; echo "waiting 60 s for the boot storm to settle"; sleep 60; }
    B mac_sim_trim.sh apply "$tier" "$U" || exit 1
    echo "$tier" > "$ROOT/trim.tier"   # the trim is lost at every simulator boot; the keep-alive re-applies this tier each time
    echo; echo "== 3/3 always-on simulator"; B mac_persistent_sim.sh install "$U"
    echo; echo "Done. One manual step for unattended restarts: System Settings > Users & Groups > Automatic login."
    echo "Then check everything with: bash $0 status" ;;
  revert)
    B mac_persistent_sim.sh uninstall; B mac_sim_trim.sh revert "$U"
    [ -f "$ROOT/server-mode.backup" ] && B mac_server_mode.sh revert
    echo "reverted. Services inside the simulator return at its next boot." ;;
  *) echo "usage: $0 status [UDID] | apply [safe|max] [UDID] | revert [UDID]"; exit 2 ;;
esac
