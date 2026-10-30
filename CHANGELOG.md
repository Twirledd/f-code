# Changelog

All notable changes to F-Code are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Clone Git Repository…** on the Welcome screen and under *File ▸ Clone Repository…* (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd>): clone from GitHub or any Git host with a progress bar and Stop button, then open the project. Private repositories sign in through Git Credential Manager; F-Code never handles a password or token.
- **Source Control navigator** (<kbd>Ctrl</kbd>+<kbd>2</kbd>), replacing the placeholder: current branch with switch and New Branch, staged and unstaged changes, stage, unstage and discard (discard asks first), a diff viewer, commit, Fetch, Pull (fast-forward only), Push, history, Create Git Repository for projects without one, and Add GitHub URL for repositories without a remote.
- Git layer security tests: URL, branch, folder-name, path and commit-message validation, the status parser, and every operation against real temporary repositories including push, pull and clone from a local bare remote.
- `scripts/readme-shots.mjs` retakes the README screenshots from a neutral demo project.

### Changed
- README rewritten with screenshots, quick start from source, keyboard shortcuts, FAQ and a security summary.
- Settings: the Copy buttons are icon buttons (they no longer overflow their box); the Mac host placeholder and the `sim-headless` helper defaults no longer name a specific Mac, address or user (`run.ps1` now takes `-MacName`, `-User` and `-Udid`).

## [1.0.0] - 2026-10-30

First public release. The project was developed under the internal codename Tom-Code
(versions 0.1 to 0.2.3); 1.0.0 is the rebranded, security-audited build.

### Changed
- **Renamed to F-Code.** Product name, window title, menus, About and Welcome screens, installer,
  executable and package name, bundle identifiers for apps built on the Mac (`dev.fcode.*`), and all
  documentation.
- **FrontierFlow design theme** (Lyons Frontier brand tokens): new dark theme on void/midnight/deep surfaces with
  ice-blue accents, new light theme from the Frontier Flow app palette, matching Monaco editor themes,
  Instrument Sans for the interface and Bricolage Grotesque for headings (bundled, SIL OFL 1.1).
- **New logo and app icon**: a pale F with an ice-blue prompt chevron and cursor rule, replacing the
  development icon. Sources are in `assets/brand/`; `scripts/make-brand.cjs` regenerates the icon set.
- The version shown on the Welcome and About screens now comes from `package.json`.
- Settings saved under the old "Tom-Code" data folder (saved Mac, recent projects) are copied across on first launch.
- Mac-side names are unchanged on purpose so existing setups keep working: `~/tomcode-sim`, the
  `dev.tomcode.simhost` LaunchAgent, `~/TomCodeProjects`, `/etc/sudoers.d/tomcode-server-mode`, and on the PC
  `~/.ssh/xcode_ed25519` and `~/.ssh/tomcode_known_hosts`.

### Added
- README with architecture, prerequisites, Mac setup, `mac_server_mode.sh` usage and the security architecture.
- MIT `LICENSE`, `CHANGELOG.md`, `.gitattributes` (shell scripts stay LF so they run on the Mac).

### Security
Carried over from the 0.2.3 audit remediation, re-audited with no outstanding findings:
- Every value that reaches `ssh`, `xcrun simctl`, `xcodebuild`, `pkill` or a generated plist is validated at the
  boundary and quoted or XML-escaped at the sink; the Mac-side scripts re-validate UDIDs themselves.
- SSH private key locked to the current Windows account and checked, failing closed, before every connection;
  optional passphrase stored with Electron `safeStorage` instead of keytar.
- Host-key pinning with `StrictHostKeyChecking=yes`; unknown hosts are pinned only after the user confirms the
  fingerprints.
- Per-session bearer token and a validating loopback proxy in front of the WebDriverAgent tunnels; retry loop
  for the free-port race.
- `mac_server_mode.sh` no longer uses `eval` (whitelist backup parser), uses `sudo -n`, and ships a scoped,
  `visudo`-checked sudoers rule (`install-sudoers` / `remove-sudoers`).

## [0.2.3] - 2026-10-28
Security audit fixes (16 findings): command injection, key ACL, host pinning, authenticated tunnel, sudo handling.

## [0.2.2] - 2026-10-28
Tests run on the Mac (`xcodebuild test`) when the destination is a Mac.

## [0.2.1] - 2026-10-28
Always-on simulator: settle-gated keep-alive, attach path, simulator trim, quick start guide.

## [0.2.0] - 2026-10-28
Touch, swipe, scroll and typing in the Simulator canvas through WebDriverAgent; headless simulator toolkit and
Windows viewer; Mac server-mode script.

## [0.1.x] - 2026-10-27
Initial Xcode-style IDE for Windows: Swift toolchain integration, SourceKit-LSP, `lldb-dap` debugging, SwiftUI
shim and Simulator canvas, remote Mac build and run over SSH, single-instance window, Stop at any stage.
