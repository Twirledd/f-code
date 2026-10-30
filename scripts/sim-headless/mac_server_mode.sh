#!/bin/bash
# Run ON THE MAC, in Terminal, as yourself (not as root):
#   bash ~/tomcode-sim/mac_server_mode.sh status    # read-only: shows what is running and what apply would change
#   bash ~/tomcode-sim/mac_server_mode.sh apply     # quiet the Mac for use as a headless simulator host
#   bash ~/tomcode-sim/mac_server_mode.sh revert    # put everything back from the saved backup
#
# The system-wide parts run through `sudo -n` (never prompts, never reuses a cached password), so they only work
# once you have installed the narrow sudoers rule below. If it is missing the script stops loudly instead of asking:
#   bash ~/tomcode-sim/mac_server_mode.sh install-sudoers   # one time; this one command asks for your password
#   bash ~/tomcode-sim/mac_server_mode.sh remove-sudoers    # take the rule away again
# The rule lets YOUR user run exactly the mdutil / pmset / softwareupdate forms this script uses, nothing else.
# Nothing is deleted. Every change is reversible, and `apply` first saves the current values to
# ~/tomcode-sim/server-mode.backup (private to you; revert refuses a backup that anyone else could have edited).
#
# What it does NOT touch: SIP, the firewall, FileVault, networking/Remote Login, OpenCore Legacy
# Patcher's agent (needed for this Mac to run macOS 13), Xcode/CoreSimulator, crash reporting
# (ReportCrash — you want crash logs from the app under test), iCloud/Messages/Mail agents.
set -u
umask 077
ACTION="${1:-status}"
UIDN="$(id -u)"; GUI="gui/$UIDN"
BK="$HOME/tomcode-sim/server-mode.backup"
SUDOERS_FILE="/etc/sudoers.d/tomcode-server-mode"
mkdir -p "$HOME/tomcode-sim"

# User-level background agents that do nothing useful on a headless build server and showed
# up consuming CPU. Only ones that actually exist on this Mac are touched.
AGENTS=(
  com.apple.photoanalysisd com.apple.photolibraryd com.apple.mediaanalysisd   # Photos analysis (saw 17-33% CPU)
  com.apple.suggestd com.apple.parsecd com.apple.knowledge-agent              # Siri/Spotlight suggestions
  com.apple.assistantd com.apple.assistant_service com.apple.Siri.agent
  com.apple.siriknowledged com.apple.siriinferenced com.apple.SiriSearchFeedback
)

die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
# Root commands: non-interactive, no cached credentials, loud failure with the fix.
sudo_n() { sudo -n "$@" || die "'sudo -n $*' failed (exit $?). If sudo asked for a password, install the scoped rule once: bash $0 install-sudoers"; }
say()  { printf '\n== %s\n' "$*"; }
have() { launchctl print "$GUI/$1" >/dev/null 2>&1; }
ac()   { pmset -g custom | awk -v k="$1" '/^AC Power:/{f=1;next} /^[A-Za-z]/{f=0} f && $1==k {print $2; exit}'; }

status() {
  say "load / memory"; uptime | sed 's/.*load/load/'; memory_pressure 2>/dev/null | grep "free percentage"; sysctl -n vm.swapusage
  say "Spotlight"; mdutil -s / 2>/dev/null | tail -1
  say "power on AC (sleep minutes: 0 = never)"; for k in sleep displaysleep disksleep powernap standby; do printf '  %-12s %s\n' "$k" "$(ac $k)"; done
  say "background agents this script would stop"
  for l in "${AGENTS[@]}"; do have "$l" && echo "  present   $l" || echo "  absent    $l"; done
  say "top CPU right now"; top -l 2 -s 3 -n 8 -o cpu -stats command,cpu 2>/dev/null | tail -9
}

apply() {
  echo "This will: turn Spotlight indexing off, stop display/disk sleep fighting the simulator,"
  echo "turn Photos/Siri analysis agents off, switch off automatic software update checks and"
  echo "window animations. Backup goes to $BK. Continue? [y/N]"; read -r a; [ "$a" = y ] || { echo aborted; exit 1; }
  sudo -n true 2>/dev/null || die "passwordless sudo for this script is not set up. Run once: bash $0 install-sudoers"
  say "saving current settings"
  {
    echo "# saved $(date)"
    for k in sleep displaysleep disksleep powernap standby; do echo "AC_$k=$(ac $k)"; done
    echo "SPOTLIGHT=$(mdutil -s / 2>/dev/null | grep -qi 'enabled' && echo on || echo off)"
    echo "SWUPDATE=$(softwareupdate --schedule 2>/dev/null | grep -qi 'is on' && echo on || echo off)"
    echo "DOCK_LAUNCHANIM=$(defaults read com.apple.dock launchanim 2>/dev/null || echo unset)"
    echo "WINANIM=$(defaults read NSGlobalDomain NSAutomaticWindowAnimationsEnabled 2>/dev/null || echo unset)"
    launchctl print-disabled "$GUI" 2>/dev/null | sed 's/^/DISABLED_BEFORE /'
  } > "$BK"; chmod 600 "$BK"; echo "  saved"

  say "Spotlight indexing off (stops mds/mdworker re-indexing every build)"; sudo_n /usr/bin/mdutil -a -i off
  say "power: never sleep on AC, display sleeps after 1 min (idle display = no compositing work)"
  sudo_n /usr/bin/pmset -c sleep 0 disksleep 0 displaysleep 1 powernap 0 standby 0
  say "automatic software-update checks off"; sudo_n /usr/sbin/softwareupdate --schedule off
  say "stopping background agents"
  for l in "${AGENTS[@]}"; do
    if have "$l"; then launchctl disable "$GUI/$l"; launchctl bootout "$GUI/$l" 2>/dev/null; echo "  stopped   $l"; else echo "  absent    $l"; fi
  done
  say "window animations off"
  defaults write com.apple.dock launchanim -bool false; defaults write NSGlobalDomain NSAutomaticWindowAnimationsEnabled -bool false
  say "done"; echo "Log out and back in (or restart) once so everything settles. Undo any time: bash $0 revert"
}

# Read the backup WITHOUT executing it: only whitelisted KEY=VALUE lines with strictly-shaped values are accepted.
# (This file used to be `eval`-ed, so anyone able to edit it could run commands, and the next lines run as root.)
load_backup() {
  [ -f "$BK" ] || die "no backup at $BK; nothing to revert"
  [ "$(stat -f '%u' "$BK")" = "$UIDN" ] || die "$BK is not owned by you; refusing to read it"
  case "$(stat -f '%Lp' "$BK")" in 600|400) ;; *) die "$BK is accessible by other users (mode $(stat -f '%Lp' "$BK")); refusing to read it" ;; esac
  AC_sleep=1; AC_disksleep=10; AC_displaysleep=10; AC_powernap=1; AC_standby=1; SPOTLIGHT=on; SWUPDATE=on; DOCK_LAUNCHANIM=unset; WINANIM=unset
  local k v
  while IFS='=' read -r k v; do
    case "$k" in
      AC_sleep|AC_displaysleep|AC_disksleep|AC_powernap|AC_standby) [[ "$v" =~ ^[0-9]{1,5}$ ]] && printf -v "$k" '%s' "$v" ;;
      SPOTLIGHT|SWUPDATE)                                             [[ "$v" =~ ^(on|off)$ ]] && printf -v "$k" '%s' "$v" ;;
      DOCK_LAUNCHANIM|WINANIM)                                        [[ "$v" =~ ^(0|1|true|false|unset)$ ]] && printf -v "$k" '%s' "$v" ;;
    esac
  done < "$BK"
}

revert() {
  load_backup
  sudo -n true 2>/dev/null || die "passwordless sudo for this script is not set up. Run once: bash $0 install-sudoers"
  say "power"; sudo_n /usr/bin/pmset -c sleep "$AC_sleep" disksleep "$AC_disksleep" displaysleep "$AC_displaysleep" powernap "$AC_powernap" standby "$AC_standby"
  [ "$SPOTLIGHT" = on ] && { say "Spotlight on"; sudo_n /usr/bin/mdutil -a -i on; }
  [ "$SWUPDATE" = on ] && { say "software-update checks on"; sudo_n /usr/sbin/softwareupdate --schedule on; }
  say "background agents"
  for l in "${AGENTS[@]}"; do launchctl enable "$GUI/$l" 2>/dev/null && echo "  enabled   $l"; done
  say "animations"
  [ "${DOCK_LAUNCHANIM:-unset}" = unset ] && defaults delete com.apple.dock launchanim 2>/dev/null || defaults write com.apple.dock launchanim -bool "$( [ "$DOCK_LAUNCHANIM" = 0 ] && echo false || echo true )"
  [ "${WINANIM:-unset}" = unset ] && defaults delete NSGlobalDomain NSAutomaticWindowAnimationsEnabled 2>/dev/null || defaults write NSGlobalDomain NSAutomaticWindowAnimationsEnabled -bool "$( [ "$WINANIM" = 0 ] && echo false || echo true )"
  say "reverted"; echo "Log out and back in (or restart) once so the agents start again."
}

# One narrow rule, written through visudo's syntax check. Interactive on purpose: this is the one place a password is typed.
install_sudoers() {
  local me; me="$(id -un)"
  [[ "$me" =~ ^[A-Za-z_][A-Za-z0-9_.-]{0,31}$ ]] || die "unexpected user name '$me'"
  local tmp; tmp="$(mktemp)"
  cat > "$tmp" <<RULE
# F-Code server mode: exactly the privileged commands mac_server_mode.sh runs, for one user, no password, no cached credentials.
Cmnd_Alias TOMCODE_SERVER_MODE =   /usr/bin/mdutil -a -i off, /usr/bin/mdutil -a -i on,   /usr/bin/pmset -c sleep [0-9]* disksleep [0-9]* displaysleep [0-9]* powernap [0-9]* standby [0-9]*,   /usr/sbin/softwareupdate --schedule off, /usr/sbin/softwareupdate --schedule on
Defaults!TOMCODE_SERVER_MODE timestamp_timeout=0, tty_tickets
$me ALL=(root) NOPASSWD: TOMCODE_SERVER_MODE
RULE
  sudo /usr/sbin/visudo -cf "$tmp" >/dev/null || { rm -f "$tmp"; die "generated sudoers rule failed visudo's check; nothing installed"; }
  sudo /usr/sbin/chown root:wheel "$tmp" && sudo /bin/chmod 440 "$tmp" && sudo /bin/mv "$tmp" "$SUDOERS_FILE" || { rm -f "$tmp"; die "could not install $SUDOERS_FILE"; }
  echo "installed $SUDOERS_FILE (remove with: bash $0 remove-sudoers)"
}
remove_sudoers() { sudo /bin/rm -f "$SUDOERS_FILE" && echo "removed $SUDOERS_FILE"; }

case "$ACTION" in status) status ;; apply) apply ;; revert) revert ;; install-sudoers) install_sudoers ;; remove-sudoers) remove_sudoers ;; *) echo "usage: $0 status|apply|revert|install-sudoers|remove-sudoers"; exit 2 ;; esac
