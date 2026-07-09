# binary-distribution — cargo-dist release matrix: checksummed binaries + installers on GitHub Releases

**Status:** designed 2026-07-09 from `docs/briefs/rust-cli-replatform.md` (ADR-0051).
Distribution model chosen at the design interview: **beads-literal / user-managed
PATH** — the human installs once via the generated installer one-liner; every loop
surface invokes bare `the-loop`; a missing binary fails with the install one-liner as
its stated remedy. No auto-fetch, no shim, no session-start network dependency.

## Shape

`cargo-dist` configured in the workspace (the "GoReleaser for Rust" the brief chose),
publishing on git tag to GitHub Releases at `jatassi/the-loop`:

- **Targets (interview-decided, all five)**: `aarch64-apple-darwin`,
  `x86_64-apple-darwin`, `x86_64-unknown-linux-musl`, `aarch64-unknown-linux-musl`
  (musl = static, no glibc floor), `x86_64-pc-windows-msvc`.
- **Artifacts per release**: per-target archives, a checksum manifest, and the
  generated installers — `the-loop-installer.sh` (POSIX shell) and
  `the-loop-installer.ps1` (Windows). The fetched artifact is checksum-verified
  before use; if the cargo-dist version in use does not verify by default, the
  builder adds verification rather than shipping without it — the checksum is the
  brief's point, not a nicety.
- **Install one-liner** (the string every missing-binary message carries):

  ```sh
  curl -LsSf https://github.com/jatassi/the-loop/releases/latest/download/the-loop-installer.sh | sh
  ```

- **CI**: the cargo-dist-generated GitHub Actions release workflow, triggered by
  version tags. This is the repo's first CI surface; it builds releases only — the
  local `cargo fmt/clippy/test` gate (rust-crate-scaffold) remains the dev gate.
  Windows target: built and checksummed by CI; no Windows machine exists to
  hand-verify — that asymmetry is accepted and recorded here, not hidden.
- **No committed blobs**: the git tree carries cargo-dist *configuration*; binaries
  exist only as release assets.

## The missing-binary posture

With PATH distribution, "plugin installed but binary absent" is a reachable state.
The posture: any surface that shells to `the-loop` and gets command-not-found treats
it as an environment-shaped halt (never a silent fallback), and the remedy — the
install one-liner — is recorded where the failure surfaces: the repo README's install
section and the begin skill's orientation text (the front door is where a fresh
environment first shells to the CLI). No preflight probe ritual: fail loudly at first
use, name the fix — the same stance as executor auth failures (ADR-0030).

Version skew (plugin newer than installed binary) is handled the same way at this
stage: commands the binary lacks fail loudly; the remedy is re-running the installer.
A version handshake is deliberately not built — single-user tool, no evidence it
earns its complexity yet.

## Touched surfaces

| Surface | Change |
|---|---|
| workspace `Cargo.toml` / dist config | cargo-dist targets + installer settings |
| `.github/workflows/` (generated) | the release workflow, committed as generated |
| `README.md` | install section with the one-liner |
| `plugin/skills/begin/SKILL.md` | missing-binary posture line (takes effect for users at json-cutover; harmless before) |

## What a builder would otherwise guess

- Release cadence stays the release skill's: the loop's Release phase bumps versions
  and tags; this feature only makes a tag *produce* binaries. The Release runbook
  gains the tag-push step at json-cutover, not here.
- Verify the end-state claim honestly: run the shell installer in a container with no
  `node`/`bun` on PATH (e.g. a bare `debian:stable-slim`) and assert
  `the-loop --version` succeeds — that is the brief's "Done looks like" made a test.
- Do not add non-Claude host manifests (Codex/Copilot) — explicitly a later intake.
- macOS Gatekeeper: unsigned binaries fetched via `curl | sh` (not a browser) carry
  no quarantine attribute; signing/notarization is out of scope and recorded as such.

## Acceptance (from the feature graph)

1. A tagged release publishes archives + sha256 checksums for all five targets plus
   shell/powershell installers, from committed cargo-dist config; no compiled
   artifact in the git tree.
2. On a machine/container with no JS runtime, the installer one-liner yields a
   working `the-loop --version`, checksum-verified before use.
3. The install one-liner is recorded where a missing binary surfaces (README + begin
   skill posture).
