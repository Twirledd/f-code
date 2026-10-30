#!/bin/bash
# Run ON THE MAC, in Terminal, as yourself (no sudo). Installs a per-user LaunchAgent that, at every login,
# boots one simulator headless and keeps it (and WebDriverAgent) running. F-Code then just attaches.
#
#   bash ~/tomcode-sim/mac_persistent_sim.sh install [UDID]
#   bash ~/tomcode-sim/mac_persistent_sim.sh status | restart | logs | uninstall
#
# It only works while the user is LOGGED IN (a LaunchAgent runs in the login session). For an unattended
# server turn on automatic login: System Settings > Users & Groups > Automatic login (FileVault must be off;
# `status` checks both). Nothing here touches macOS settings.
set -u
LABEL="dev.tomcode.simhost"
ROOT="$HOME/tomcode-sim"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
GUI="gui/$(id -u)"
cmd="${1:-status}"
# Independent re-validation (the caller already checks, but this script must not trust its caller): a simulator
# UDID is 8-4-4-4-12 hex digits and nothing else, so it can never carry shell syntax into xcodebuild / simctl.
valid_udid() { [[ "${1:-}" =~ ^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$ ]]; }
need_udid()  { valid_udid "${1:-}" || { echo "invalid simulator UDID" >&2; exit 2; }; }

pick_udid() {
  local u="${1:-}"
  [ -z "$u" ] && [ -f "$ROOT/persistent.udid" ] && u="$(cat "$ROOT/persistent.udid")"
  [ -z "$u" ] && u="$(xcrun simctl list devices booted | grep -oE '[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}' | head -1)"
  echo "$u"
}

case "$cmd" in
  install)
    U="$(pick_udid "${2:-}")"
    [ -z "$U" ] && { echo "pass a simulator UDID: xcrun simctl list devices available"; exit 2; }
    need_udid "$U"   # it is written into the LaunchAgent plist and run at every login
    [ -f "$ROOT/mac_keepalive.sh" ] && [ -f "$ROOT/mac_wda.sh" ] || { echo "missing helper scripts in $ROOT (connect F-Code once, or copy scripts/sim-headless there)"; exit 1; }
    [ -f "$ROOT/wda-build/Build/Products/"*.xctestrun ] 2>/dev/null || echo "note: WebDriverAgent isn't built yet; run 'bash $ROOT/mac_wda.sh setup $U' (or F-Code: Settings > Mac > Enable) or touch input stays off."
    mkdir -p "$HOME/Library/LaunchAgents"
    echo "$U" > "$ROOT/persistent.udid"
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$ROOT/mac_keepalive.sh</string><string>$U</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$ROOT/keepalive.log</string>
  <key>StandardErrorPath</key><string>$ROOT/keepalive.log</string>
</dict></plist>
EOF
    launchctl bootout "$GUI/$LABEL" >/dev/null 2>&1
    launchctl bootstrap "$GUI" "$PLIST" && launchctl kickstart -k "$GUI/$LABEL"
    echo "installed for simulator $U. It boots it headless at every login and keeps the touch agent running."
    echo "Check: bash $0 status    Log: bash $0 logs" ;;
  uninstall)
    launchctl bootout "$GUI/$LABEL" >/dev/null 2>&1
    rm -f "$PLIST" "$ROOT/persistent.udid"; pkill -f mac_keepalive.sh 2>/dev/null
    echo "removed. The simulator is left booted (shut it down with: xcrun simctl shutdown <UDID>)." ;;
  restart) launchctl kickstart -k "$GUI/$LABEL" && echo restarted ;;
  logs) tail -n 40 "$ROOT/keepalive.log" 2>/dev/null || echo "no log yet" ;;
  status)
    U="$(cat "$ROOT/persistent.udid" 2>/dev/null)"
    echo "launch agent installed: $([ -f "$PLIST" ] && echo yes || echo no)   loaded: $(launchctl print "$GUI/$LABEL" >/dev/null 2>&1 && echo yes || echo no)"
    echo "keepalive running:      $(pgrep -f mac_keepalive.sh >/dev/null && echo yes || echo no)   simulator: ${U:-none}"
    [ -n "$U" ] && echo "simulator booted:       $(xcrun simctl list devices | grep "$U" | grep -q '(Booted)' && echo yes || echo no)"
    echo "WebDriverAgent ready:   $(curl -s -m 3 http://127.0.0.1:8100/status 2>/dev/null | grep -q '"ready" : true' && echo yes || echo no)"
    echo "FileVault: $(fdesetup status 2>/dev/null | head -1)   automatic login: $(defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null || echo 'NOT set (needed for unattended restarts)')" ;;
  *) echo "usage: $0 install [UDID] | status | restart | logs | uninstall"; exit 2 ;;
esac
