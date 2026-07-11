# Release v0.4.13 — 2026-07-10

- **Tag:** `v0.4.13` (bump commit `a1408b6`, released tip `f34b0a3` — the
  json-cutover landing)
- **Features shipped:** json-cutover
- **Outcome:** deployed — the first plugin version whose surfaces call the bare
  `the-loop` binary. Marketplace update 0.4.12 → 0.4.13 healthy; binaries
  published by the tag-triggered cargo-dist workflow (16 assets) and `the-loop
  0.4.13` installed from the release. The rust replatform (ADR-0051) is complete:
  the JS CLI and its YAML artifacts are gone from the tree, durable artifacts are
  tool-owned JSON (`docs/feature-graph.json`, `docs/plans/<id>/plan.json`,
  `docs/calibration/runs/<stamp>.json`), and the oracle corpus (54 cases, zero
  pending) stands as the Rust binary's black-box regression suite. This record's
  own status flip was written by the Rust binary — the loop's first post-flip
  artifact writes.
- **Operational notes:** the cutover landed as its designed human-gated session
  (never via the execution pipeline). Known pre-existing flake, diagnose-intake
  candidate: cli unit tests race on process-global HOME/cwd under parallel
  `cargo test` (`models_list`/`hooks_list`).
- **Rollback:** previous tag `v0.4.12`; plugin rollback per runbook. Note a code
  rollback past this release restores the JS-CLI era wholesale (the swap is
  atomic by design).
