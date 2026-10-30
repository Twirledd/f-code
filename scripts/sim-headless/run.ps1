<#
  One command from the Windows PC: push the helpers to the Mac, boot the simulator headless
  (no Simulator.app window), start the frame stream and open the viewer.

    .\run.ps1 -MacName my-mac.local -User me -Udid <UDID>
    .\run.ps1 -MacName my-mac.local -User me -Udid <UDID> -MacIp 192.168.1.50 -Workers 3 -MaxFps 8

  Find the simulator id on the Mac with:  xcrun simctl list devices booted

  Run it AFTER the build (F-Code's Ctrl+B / Ctrl+R) so the app is already installed.
  No tunnels or open ports: frames ride inside the SSH connection; the page is on 127.0.0.1.
#>
param(
  [Parameter(Mandatory)][string]$MacName,    # the Mac's host name, e.g. my-mac.local
  [string]$MacIp   = '',                     # optional fallback when Windows can't resolve the .local name
  [Parameter(Mandatory)][string]$User,       # your user name on the Mac
  [Parameter(Mandatory)][string]$Udid,       # simulator id (xcrun simctl list devices)
  [string]$Key     = "$env:USERPROFILE\.ssh\xcode_ed25519",
  [int]$Workers    = 2,
  [double]$MaxFps  = 6,
  [int]$Port       = 9100,
  [switch]$NoInput,      # view-only screenshots instead of WebDriverAgent (touch + typing + faster video)
  [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# Pick how to reach the Mac. An IP is only used with the host key saved for the NAME, strictly.
$byName = $true
try { [void][System.Net.Dns]::GetHostAddresses($MacName) } catch { $byName = $false }
if (-not $byName -and -not $MacIp) { throw "Can't resolve $MacName and no -MacIp was given." }
$target = if ($byName) { $MacName } else { Write-Host "Can't resolve $MacName; using $MacIp (host key still checked)."; $MacIp }
$sshOpts = @('-i', $Key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8')
if ($byName) { $sshOpts += @('-o', 'StrictHostKeyChecking=accept-new') }
else         { $sshOpts += @('-o', "HostKeyAlias=$($MacName.ToLower())", '-o', 'StrictHostKeyChecking=yes') }
$dest = "$User@$target"

Write-Host '1/4 Pushing helper scripts to the Mac...'
ssh @sshOpts $dest 'mkdir -p ~/tomcode-sim'
scp @sshOpts "$here\mac_frames.py" "$here\mac_headless.sh" "$here\mac_wda.sh" "${dest}:tomcode-sim/"

Write-Host '2/4 Booting the simulator headless (no Simulator.app)...'
ssh @sshOpts $dest "bash ~/tomcode-sim/mac_headless.sh boot $Udid"

Write-Host '3/4 Checking the Mac is not already overloaded...'
$load = (ssh @sshOpts $dest "sysctl -n vm.loadavg | awk '{print `$2}'")
if ([double]$load -gt 8) { Write-Warning "Mac load average is $load (4 logical CPUs). Frames will be throttled to ~1 fps until it settles." }

Write-Host '4/4 Starting the viewer (touch + typing needs WebDriverAgent: first start after a boot can take a few minutes)...'
$viewerArgs = @("$here\win_viewer.py", '--host', $target, '--user', $User, '--udid', $Udid, '--key', $Key,
                '--port', $Port, '--workers', $Workers, '--max-fps', $MaxFps)
if ($NoInput) { $viewerArgs += @('--mode', 'screenshots') }
if (-not $byName) { $viewerArgs += @('--alias', $MacName) }
if ($NoBrowser)   { $viewerArgs += '--no-browser' }
python @viewerArgs
