---
status: accepted
date: 2026-07-11
---

# ADR-0053 · `the-loop upgrade` re-runs the release installer; the binary carries no HTTP stack

**Context.** The binary installs once via cargo-dist's curl one-liner and never
updates, while the plugin updates independently through the marketplace — lockstep
versions, unrelated channels, so skew surfaces as unknown-subcommand failures
mid-session (brief `docs/briefs/cli-upgrade.md`). A 2026-07-11 survey of the field
(Claude Code, rustup, uv, deno, gh, axoupdater) found the cargo-dist ecosystem
answer is receipt-based re-run-the-installer (uv ships exactly this via axoupdater
as a library), and that checksum verification of self-update downloads is not field
standard. The crate has three dependencies (clap, serde, serde_json) and already
shells out for git; axoupdater would bring reqwest + tokio.

**Decision.** `the-loop upgrade` (cargo feature `upgrade`, off by default, enabled
for dist release builds) is a thin orchestration with no download, verification, or
layout logic of its own: check the install receipt, fetch the latest release's own
installer with shelled-out platform tools (`curl` on unix, PowerShell on Windows —
the tools the documented one-liner already requires), rename the running exe aside
on Windows, execute the installer, post-check `--version`. Integrity is the
installer's own sha256 verification of the archive it downloads. No new Rust
dependencies. Anonymous fetch only — the repo is assumed to go public; while
private, upgrade fails as an ordinary error whose remedy message is the same
one-liner.

**Trade-off accepted.** The unverified link is the installer script itself (TLS to
github.com only — the same trust as the original curl-pipe-sh install, and the same
gap uv/rustup/axoupdater ship with). Upgrade depends on curl/PowerShell being
present, is broken while the repo stays private, and re-running the installer does
marginally more work than a byte-swap. In exchange: zero dependency growth, one
source of layout truth (the installer), no maintained fork of download/verify/extract
logic across five targets, and no axo maintenance-risk exposure.

**Reversal path.** If the trust bar rises (signature verification) or shelling out
proves brittle, the seam is `commands::upgrade` — swap its body for a native
fetch+verify+swap (ureq + sha2 + self-replace) without touching the command surface,
the receipt precondition, or the /begin handshake.
