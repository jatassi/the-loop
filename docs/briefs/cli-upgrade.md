# Brief: cli-upgrade

## Intent

The CLI has no update mechanism. The binary installs once via the cargo-dist curl
one-liner and then goes stale silently, while the companion plugin updates on its own
schedule through the marketplace. The two are versioned in lockstep but updated through
unrelated channels, so skew accumulates until a plugin skill calls a subcommand the
installed binary lacks — and the failure surfaces mid-session as a mysterious
unknown-command error instead of "your binary is old." Fix: give the binary a
`the-loop upgrade` subcommand and give /begin a version handshake that detects skew at
the front door and heals the breaking direction automatically.

## Users

The project owner and anyone who installs the plugin — but the primary *caller* of
`the-loop upgrade` is the /begin skill itself, running unattended inside a session. The
command must therefore work agent-driven (clean exit codes, parseable outcome) as well
as human-typed.

## Scope envelope

One feature against the existing CLI and begin skill.

**In scope**

- A `the-loop upgrade` subcommand in the Rust CLI.
- A plugin↔CLI version handshake in /begin, with auto-heal in the breaking direction.
- A Windows CI test that exercises the real binary swap.
- A compile-time feature gate so non-installer builds can't self-update.

**Out of scope (noted for later intakes)**

- Background or notify-only update checks in the binary (no daemon, no throttle state,
  no network on normal invocations).
- Version pinning, downgrade, or rollback (`upgrade` fetches latest only).
- Cryptographic signing / attestations (checksums only for now; cargo-dist can add
  GitHub attestations later without redesign).
- Delta/patch updates.
- Package-manager distribution (Homebrew/winget) — the feature gate is designed in now
  so those builds are safe later, but no formula/manifest work.
- Plugin-side auto-update (the marketplace owns that).

## Decided

- **Shape: self-update command + skew check** — not notify-only (leaves the last-mile
  friction in place), not full background auto-update (survey: only Claude Code does
  that, backed by dedicated infra, signed manifests, and a long Windows bug tail;
  field consensus for single-maintainer CLIs is manual command + check).
- **Name: `the-loop upgrade`** — chosen over `self-update`.
- **Handshake lives in /begin only.** /begin compares its own plugin version against
  `the-loop --version`. Offline, deterministic, zero latency added to normal CLI
  invocations — versions are already bumped in lockstep so exact compare works. Other
  skills assume /begin ran; side-door sessions skip the check (accepted: /begin is the
  documented front door).
- **Asymmetric skew response.** Binary older than plugin (the breaking direction):
  /begin auto-runs `the-loop upgrade` and reports one line — "the-loop updated to
  vX.Y.Z". Binary newer than plugin: proceed normally with a one-line nudge to update
  the plugin via the marketplace (newer binaries keep old subcommands working; this
  direction is unfixable from the CLI side).
- **Auto-run, not propose.** Contested against the loop's usual human-gate instinct;
  resolved: skew repair is mechanical convergence, not a judgment call — a gate here is
  friction without information. The one-line notice keeps it visible.
- **Latest only.** No `--version` pin. If the marketplace plugin lags the newest
  release, /begin's upgrade lands the binary ahead of the plugin and the newer-binary
  nudge covers the remainder.
- **Failure = warn + continue.** If the auto-run upgrade fails (offline, GitHub
  down/rate-limited, swap failure), /begin prints one line naming the skew, includes
  the manual installer one-liner, and proceeds on the old binary. Blocking the session
  on GitHub availability is worse than running slightly stale, and any later
  missing-subcommand error is now pre-explained.
- **Integrity: mandatory sha256 verification** against the checksums cargo-dist already
  publishes with each release, checked before any swap. This is deliberately above
  field practice (uv, rustup's own self-update, and axoupdater verify nothing beyond
  TLS) and it constrains the implementation choice — see Deferred.
- **Update pattern: receipt-based re-run-installer.** The upgrade locates the new
  release's own installer artifacts and re-runs them, rather than hand-rolling a
  byte-swap — one code path for install and update, and the installer stays the single
  source of layout truth across all five targets. This is the cargo-dist ecosystem
  answer (uv ships exactly this).
- **Windows bar: CI exercises the real swap.** A Windows CI job runs an older binary's
  `upgrade` against a real or staged release and asserts the swapped binary at the same
  path reports the new version. Windows is CI-built only with no local machine, and
  rename-aside swaps have a known kill-window failure (binary renamed, replacement
  never written), so the riskiest path gets executed — not just compiled — before
  release.
- **Compile-time feature gate now.** Builds without the gate get a stub `upgrade` that
  points at the correct update channel. Universal pattern (rustup, uv, deno, gh) and
  free to adopt before any package-manager build exists.

## Deferred

Named questions Design owns:

- **Crate/implementation choice** for the pinned pattern: axoupdater-as-library (uv's
  exact route; reads the cargo-dist install receipt, re-runs the new installer — but
  verifies nothing, so our sha256 layer goes on top; known pains: unauthenticated
  GitHub rate limits, receipt-vs-binary drift, mild maintainer-health risk) versus
  jaemk/`self_update` + `self-replace` (checksum verification built in, no axo
  dependency, but byte-swaps and duplicates layout knowledge the installer owns) versus
  hand-rolled fetch+verify+re-run-installer. See Prior art below.
- **How /begin learns its own plugin version** at runtime (read plugin.json via the
  plugin root, or bake the version into the skill at release).
- **Windows swap mechanics within the chosen crate**: rename-aside naming, leftover
  `.old.exe` cleanup strategy (delete on next run vs post-swap sweep).
- **CI test mechanics**: staged fixture release vs previous real release as the
  upgrade-from binary.
- **Rate-limit token plumbing**: whether `upgrade` accepts a GitHub token env var for
  unauthenticated-API limits.
- **Feature-gate naming and stub message wording.**
- **Post-swap sanity check** (run the new binary with `--version` before declaring
  success — deno does this; cheap, probably yes).

## Assumptions

Proceeding on these without confirmation:

- Plugin and CLI versions continue to be bumped in lockstep every release (current
  practice: one release commit bumps both to the same number).
- A newer binary remains backward compatible with an older plugin within realistic
  skew windows — subcommands aren't removed or repurposed release-to-release.
- cargo-dist v0.32.0's shell/PowerShell installers write install receipts under the
  current config (`install-updater = false` does not suppress the receipt). Verify
  early in Design; the re-run-installer pattern leans on it.
- GitHub Releases stays the sole distribution channel for the life of this feature.

## Constraints

- Rust CLI, five release targets including x86_64 Windows MSVC; Windows is CI-built
  only with no local machine to hand-verify.
- Normal CLI invocations gain no network calls and no measurable latency from this
  feature — all checking is offline or inside `upgrade` itself.
- sha256 verification is mandatory before swap (constrains crate choice).
- The feature gate must exist in the first shipped version.
- Single maintainer; minimal moving parts is the standing design frame — no update
  state files, no throttle bookkeeping, no channels.
- Touching the begin skill means the loop's surface-authoring rules apply (self-
  contained wording, write-skills pass before landing).

## Prior art (survey summary)

A verified survey of Claude Code, rustup, uv, deno, gh, axoupdater/cargo-dist, and the
npm notify-only pattern informs this brief; the load-bearing facts:

- Field consensus for single-maintainer CLIs: manual `self update` command, at most a
  throttled notify; nobody hot-swaps mid-invocation. Full auto-update is Claude Code
  only (background download, apply on next launch, GPG-signed manifest, soak channel).
- uv is the near-exact template: same installer generator, axoupdater-as-library,
  re-runs the release's own installer, `.previous.exe` rename-aside on Windows via the
  `self-replace` crate, compile-time `self-update` feature excluded from
  package-manager builds, receipt-mismatch and rate-limit errors handled with specific
  messages.
- Windows: you can rename a running exe but not overwrite it; every surveyed tool does
  a rename-aside variant. Known failure: dying between rename and write leaves no
  binary at the path.
- Checksum verification of the self-update download is *not* field standard (uv,
  rustup self-update, axoupdater: TLS only); deno's delta chain and Claude Code's
  signed manifest are the exceptions. Our checksum bar exceeds most of the field.
- The plugin↔binary handshake is the genuinely novel part — no surveyed system fully
  solves independently-updating plugin/binary pairs. Nearest fragments: uv's
  `required-version` → "run `uv self update`" hint and Claude Code's version-floor
  settings.

## Done looks like

1. On a machine with an older installer-installed binary, `the-loop upgrade` replaces
   it with the latest GitHub release and the binary at the same path reports the new
   version — on all five supported targets.
2. A corrupt or truncated download is detected before any swap; the old binary remains
   in place and functional, and the command exits nonzero with a clear message.
3. A /begin session with a binary older than the plugin upgrades the binary before any
   other CLI call and shows the human one line: the new version.
4. A /begin session with a binary newer than the plugin proceeds normally and shows a
   one-line plugin-update nudge.
5. A /begin session with a stale binary and no network warns in one line (including
   the manual installer command) and continues on the old binary.
6. A Windows CI job runs an older binary's `upgrade` end-to-end and asserts the
   swapped binary reports the new version, with no leftover artifacts that break a
   subsequent run.
7. Normal CLI invocations (graph, plan, settings subcommands) make no network calls
   and show no added latency attributable to this feature.
8. A build compiled without the update capability responds to `the-loop upgrade` with
   a message naming the correct update channel instead of attempting a swap.
