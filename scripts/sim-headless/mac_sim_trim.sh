#!/bin/bash
# Mac side. Trim the services running INSIDE the simulated iOS, so a headless simulator host idles quietly.
#   mac_sim_trim.sh status [UDID]
#   mac_sim_trim.sh apply  core|safe|max [UDID]
#   mac_sim_trim.sh revert [UDID]
# UDID defaults to the persistent simulator (~/tomcode-sim/persistent.udid), else the first booted one.
#
# This edits the simulated device's own launchd (`simctl spawn <udid> launchctl disable|bootout`), not macOS.
#
# IMPORTANT: the trim is RUNTIME-ONLY. It is lost every time the simulator boots (measured: after a shutdown and
# reboot 0 of 62 disabled services were still disabled, and no disabled.plist is written). That is why
# mac_keepalive.sh re-applies it after every boot when ~/tomcode-sim/trim.tier exists (mac_ultra_mode.sh writes it).
# `revert` re-enables everything and removes trim.tier.
#
# Why it exists (measured on a 2015 MacBook Air, iOS 17.2 simulator, idle, nothing running):
#   the simulated push daemon `apsd` retries forever (no Apple push credentials) and wrote 74% of ALL log lines
#   (10,580 of 14,274 in 12 s = ~1,200 lines/s), which kept the logging daemon busy. Disabling just apsd cut
#   log volume 93% and host CPU from 20.9% busy to 7.0% busy.
set -u
cmd="${1:-status}"
case "$cmd" in apply) tier="${2:-safe}"; U="${3:-}" ;; *) tier=""; U="${2:-}" ;; esac
[ -z "$U" ] && [ -f "$HOME/tomcode-sim/persistent.udid" ] && U="$(cat "$HOME/tomcode-sim/persistent.udid")"
[ -z "$U" ] && U="$(xcrun simctl list devices booted | grep -oE '[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}' | head -1)"
[ -z "$U" ] && { echo "no simulator UDID (pass one, or boot a simulator)"; exit 2; }
# Independent re-validation (the caller already checks, but this script must not trust its caller): a simulator
# UDID is 8-4-4-4-12 hex digits and nothing else, so it can never carry shell syntax into xcodebuild / simctl.
valid_udid() { [[ "${1:-}" =~ ^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$ ]]; }
need_udid()  { valid_udid "${1:-}" || { echo "invalid simulator UDID" >&2; exit 2; }; }
need_udid "$U"
S() { xcrun simctl spawn "$U" "$@"; }

# core: proven. The push daemon cannot work in a simulator and floods the log while it retries.
CORE=(com.apple.apsd)

# safe: services with no job on a headless build/test simulator (Siri, suggestions, Photos analysis, Health,
# News/Weather/Maps/Tips, iCloud and account sync, Wallet, Family, telemetry experiments).
SAFE=(
  com.apple.assistant_cdmd com.apple.assistant_service com.apple.assistantd com.apple.parsec-fbf com.apple.parsecd
  com.apple.siri-distributed-evaluation com.apple.siri.acousticsignature com.apple.siri.context.service
  com.apple.siriactionsd com.apple.siriinferenced com.apple.siriknowledged com.apple.sirittsd com.apple.suggestd
  com.apple.searchd com.apple.spotlightknowledged com.apple.knowledgeconstructiond com.apple.synapse.contentlinkingd
  com.apple.routined
  com.apple.mediaanalysisd com.apple.mediaanalysisd.service com.apple.photoanalysisd com.apple.cloudphotod
  com.apple.photos.ImageConversionService com.apple.photos.VideoConversionService
  com.apple.healthd com.apple.healthappd com.apple.healthrecordsd
  com.apple.newsd com.apple.nanonewscd com.apple.weatherd com.apple.tipsd com.apple.Maps.mapspushd
  com.apple.Maps.mapssyncd com.apple.maps.destinationd com.apple.nanomapscd com.apple.geoanalyticsd
  com.apple.bird com.apple.cloudd com.apple.homed com.apple.itunescloudd com.apple.familycircled
  com.apple.familynotification com.apple.activitysharingd com.apple.pairedsyncd com.apple.appconduitd
  com.apple.eventkitsyncd com.apple.WebBookmarks.webbookmarksd com.apple.NPKCompanionAgent com.apple.passd
  com.apple.findmy.findmylocated com.apple.devicemanagementclient.mdmd com.apple.dmd com.apple.gamed
  com.apple.telephonyutilities.callservicesd com.apple.imdpersistence.IMDPersistenceAgent
  com.apple.triald com.apple.biomed com.apple.devicecheckd
  com.apple.chronod
)

# max: also the simulator's sound server. Measured: the Mac's coreaudiod sat at a constant 3.5-3.9% CPU because of it;
# switching it off took coreaudiod to 0.0% and idle host CPU from 6.9% to 4.7% busy. Cost: no audio from the simulator.
# (Wallpaper, splash screen, sharing/rapport daemons were considered and left out: no measured gain, some risk.)
MAX=(com.apple.audio.systemsoundserver-simd)

labels() { case "$1" in core) printf '%s\n' "${CORE[@]}" ;; safe) printf '%s\n' "${CORE[@]}" "${SAFE[@]}" ;;
           max) printf '%s\n' "${CORE[@]}" "${SAFE[@]}" "${MAX[@]}" ;; esac; }
present() { S launchctl list 2>/dev/null | awk 'NR>1{print $3}' | sort -u; }
# Log census: how many lines/s the simulated iOS writes and who writes them. A runaway source means something it
# depends on was disabled (it retries in a loop). Measured: disabling navd made the Maps widget log 2,686 lines/s.
census() {
  local f; f="$(mktemp -t simcensus)"
  perl -e 'alarm 10; exec @ARGV' xcrun simctl spawn "$U" log stream --style compact --level debug > "$f" 2>/dev/null
  local n; n=$(wc -l < "$f" | tr -d ' '); echo "log volume: ~$(( n / 10 )) lines/s (untrimmed iOS 17.2 idles at ~1,200)"
  grep -oE '[A-Za-z0-9_.+-]+\[[0-9]+:[0-9a-f]+\]' "$f" | sed -E 's/\[.*//' | sort | uniq -c | sort -rn | head -3 \
    | awk '{printf "  %-6s %s\n", $1, $2}'
  local top; top=$(grep -oE '[A-Za-z0-9_.+-]+\[[0-9]+:[0-9a-f]+\]' "$f" | sed -E 's/\[.*//' | sort | uniq -c | sort -rn | head -1)
  local c=${top%% *}; c=${c:-0}
  if [ "$c" -gt 1500 ]; then
    echo "WARNING: $(echo "$top" | awk '{print $2}') wrote ~$(( c / 10 )) lines/s. Something it needs was probably disabled and it is"
    echo "         retrying in a loop. Run '$0 revert' (or apply a lower tier) and tell the maintainer which process it was."
  else echo "OK: no runaway log source."; fi
  rm -f "$f"
}
state()   { [ "$(xcrun simctl list devices | grep "$U" | grep -c Booted)" = 1 ] && echo Booted || echo "NOT booted"; }

case "$cmd" in
  status)
    echo "simulator $U: $(state)"
    echo "services running inside it: $(present | grep -vc '^UIKitApplication')   processes: $(ps -Ao comm | grep -c simruntime)"
    echo "disabled in its launchd: $(S launchctl print-disabled system 2>/dev/null | grep -c '=> disabled')"
    census
    echo "host CPU: $(top -l 2 -s 3 -n 0 2>/dev/null | grep 'CPU usage' | tail -1)" ;;
  apply)
    case "$tier" in core|safe|max) ;; *) echo "tier must be core, safe or max"; exit 2 ;; esac
    [ "$(state)" = Booted ] || { echo "boot the simulator first (mac_headless.sh boot $U)"; exit 1; }
    have="$(present)"; done_n=0; skip_n=0
    while read -r l; do
      [ -z "$l" ] && continue
      S launchctl disable "system/$l" >/dev/null 2>&1
      if grep -qx "$l" <<<"$have"; then S launchctl bootout "system/$l" >/dev/null 2>&1; done_n=$((done_n+1)); else skip_n=$((skip_n+1)); fi
    done < <(labels "$tier")
    echo "tier '$tier': disabled all listed services; stopped $done_n that were running ($skip_n not present). Lasts until the simulator next boots."
    # The keep-alive applies the trim mid boot storm, when every log source is loud: a census then is a false alarm.
    if [ -n "${TOMCODE_NO_CENSUS:-}" ]; then echo "(census skipped)"; else echo "verifying (20 s settle, then a 10 s log census)..."; sleep 20; census; fi ;;
  revert)
    for l in "${CORE[@]}" "${SAFE[@]}" "${MAX[@]}"; do S launchctl enable "system/$l" >/dev/null 2>&1; done
    rm -f "$HOME/tomcode-sim/trim.tier"
    echo "re-enabled every service this script can disable and removed trim.tier (so the keep-alive stops re-applying it). They start again at the simulator's next boot." ;;
  *) echo "usage: $0 status [UDID] | apply core|safe|max [UDID] | revert [UDID]"; exit 2 ;;
esac
