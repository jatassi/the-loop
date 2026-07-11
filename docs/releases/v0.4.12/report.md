# Release v0.4.12 — 2026-07-10

- **Tag:** `v0.4.12` (bump commit `d751667`, released tip `418492b` merge of the
  rust-replatform stream)
- **Features shipped:** rust-crate-scaffold, parity-oracle, graph-commands-rust,
  config-commands-rust, binary-distribution, plan-commands-rust, run-commands-rust
- **Outcome:** deployed — marketplace update 0.4.11 → 0.4.12 healthy; first
  binary release published by the tag-triggered cargo-dist workflow (five targets,
  sha256 checksums, shell + powershell installers); `the-loop 0.4.12` installed
  from the release and verified on PATH. The Rust CLI stands at full oracle parity
  (54 pass / 0 fail / 0 pending on both targets); json-cutover (the flip) follows
  as its designed human-gated session, not part of this release.
- **Operational notes:** the cli crate version moved 0.1.0 → 0.4.12 and stays in
  lockstep with the plugin version from here (cargo-dist requires tag ≡ crate
  version). The repo is private, so the README's anonymous installer one-liner
  404s — install rides authenticated `gh release download` + the real installer
  with `THE_LOOP_DOWNLOAD_URL` pointed at the downloaded assets (runbook updated).
- **Rollback:** previous tag `v0.4.11`; plugin rollback per runbook
  (`claude plugin uninstall the-loop@the-loop --scope user`).
