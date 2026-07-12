# cli-upgrade — `the-loop upgrade` subcommand

## What this is

A subcommand that replaces the installed `the-loop` binary with the latest GitHub
release, by re-running the release's own generated installer. It exists so the /begin
version handshake (feature `begin-version-handshake`) has something to auto-run when
the binary is older than the plugin — and so a human can update by typing one command
instead of finding the curl one-liner. Brief: `docs/briefs/cli-upgrade.md`.

## How it fits

The CLI is the compiled Rust crate at `cli/` (clap dispatch in `cli/src/lib.rs`,
command bodies under `cli/src/commands/`). Releases are cargo-dist: five target
archives, per-archive `.sha256` sidecars, and generated `the-loop-installer.sh` /
`the-loop-installer.ps1` on GitHub Releases; the installers verify the archive
checksum before installing (observed and recorded in the Release runbook). The
installers write an install receipt — this machine's real one:

```json
{"binaries":["the-loop"],"install_layout":"cargo-home","install_prefix":"/Users/jatassi/.cargo",
 "provider":{"source":"cargo-dist","version":"0.32.0"},
 "source":{"app_name":"the-loop","name":"the-loop","owner":"jatassi","release_type":"github"},
 "version":"0.5.0"}
```

at `~/.config/the-loop/the-loop-receipt.json` (unix/mac) or
`%LOCALAPPDATA%\the-loop\the-loop-receipt.json` (Windows).

`upgrade` is deliberately thin: **it contains no download-verification or layout
logic of its own** — the release's installer owns both. The binary gains zero new
Rust dependencies (the crate stays clap + serde + serde_json); network and archive
work happen in shelled-out platform tools, consistent with how the crate already
shells out to git.

## Decided mechanism

1. **Feature gate.** Cargo feature `upgrade`, default off. Dist release builds enable
   it via committed cargo-dist config (`features` in `dist-workspace.toml`). A build
   without the feature still parses the subcommand but refuses (exit 1) with the
   manual install one-liner as the stated remedy — same remedy text the begin skill's
   missing-binary posture carries.
2. **Receipt precondition.** Read the receipt at the platform path above. Missing or
   unparseable receipt → refusal naming the one-liner (this binary isn't
   installer-managed — a dev build or a future package-manager install). No fetch, no
   swap.
3. **Fetch.** Download the platform installer from
   `https://github.com/jatassi/the-loop/releases/latest/download/the-loop-installer.sh`
   (`.ps1` on Windows) — `curl -LsSf` on unix, `Invoke-WebRequest` via `powershell`
   on Windows; the same tools the documented install one-liner already requires on
   PATH. **Assumes the repo is public** (decided at design): while it is private the
   fetch 404s and surfaces as an ordinary upgrade failure with the same remedy
   message.
4. **Override seam.** The `THE_LOOP_DOWNLOAD_URL` environment variable the installer
   already honors is passed through, and when set, the installer is fetched from
   `$THE_LOOP_DOWNLOAD_URL/the-loop-installer.{sh,ps1}` too. This is the fixture-test
   seam — no test-only flags on the command surface.
5. **Windows rename-aside.** Before executing the installer, rename the running
   `the-loop.exe` to `the-loop.exe.old` beside itself (Windows can rename but not
   overwrite a mapped exe). On installer failure, rename it back. Any stale
   `.old` from a previous run is swept at the start of the next `upgrade`. Unix needs
   no rename: the installer's own move/unlink semantics replace a running binary
   safely.
6. **Execute the installer**, which downloads the target archive, verifies its
   sha256, and installs into the receipt's layout — the integrity check rides inside.
7. **Post-check.** Run the installed binary with `--version`; refuse to report
   success unless it exits 0. Success payload on stdout (io contract below):
   `{"from":"0.5.0","to":"0.6.0","updated":true}` — `updated:false` with `from == to`
   when already at latest (the installer run is idempotent; no version pre-check
   network call exists, latest-only by brief).

## Interfaces touched

- `Command` enum in `cli/src/lib.rs` gains a unit variant (no arguments, no flags):

  ```rust
  /// Replace this binary with the latest GitHub release (re-runs the installer).
  Upgrade,
  ```

  dispatched to `commands::upgrade::run()` following the existing convention:
  success prints JSON via `io::out` and returns; a refusal exits 1 via `io::fail`
  (stderr message, stdout empty).
- Existing subcommands are untouched; **no subcommand other than `upgrade` may
  perform network access** (standing constraint, not just this feature's).
- `.github/workflows/` gains a job (see testing) and the Release runbook's ready
  checks gain one line naming it — both in this feature's footprint.
- The begin skill is NOT touched here — that is `begin-version-handshake`.

## Testing

An integration test (cargo test, compiled under the `upgrade` feature) builds a
**fixture release**: a directory served by a local HTTP server holding a generated
installer, a current-platform archive containing a distinguishable "newer" build,
and its `.sha256` sidecar. The test installs an older build via the fixture
installer (producing a real receipt in an isolated HOME/LOCALAPPDATA), then
exercises `the-loop upgrade` with `THE_LOOP_DOWNLOAD_URL` pointed at the fixture:
happy swap (version changes, payload correct), corrupt archive (checksum mismatch →
nonzero exit, original binary intact and runnable), missing receipt (refusal, no
fetch). The stub refusal is a plain unit/integration case without the feature.

The same exercise runs on `windows-latest` in a committed GitHub Actions workflow —
the real rename-aside swap executed in CI, since Windows has no local machine. The
validator runs the fixture exercise locally (macOS) and verifies the workflow is
committed and wired; Windows greenness is a release-gate ready check
(`gh run watch`), not a validate-time assertion.

## Constraints

- Zero new entries in `[dependencies]` — refusal-worthy in review.
- Naming law: composed-from-standard-words only (`upgrade`, `receipt`, `installer`).
- Failure posture: fail closed and loudly — any step failing leaves the installed
  binary functional and exits nonzero with the failing step named; partial states
  (renamed-aside exe without a successful install) are restored, never left.
- stdout-is-JSON contract: progress/diagnostics go to stderr only.
