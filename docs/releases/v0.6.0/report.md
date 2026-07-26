# Release v0.6.0 — 2026-07-26

- **Tag:** `v0.6.0` (released tip `7e42556`)
- **Features shipped:** `cli-upgrade` (`the-loop upgrade` — replace the installed
  binary by re-running its installer) and `write-skills-doctrine` (write-skills covers
  agent definitions). Both flipped to `shipped`.
- **Fix nodes released and pruned** (RCA docs survive under `docs/bugs/`):
  `fix-test-fixture-tempdir-collision`, `fix-execution-pipeline-name-entrypoint`,
  `fix-landing-into-checked-out-target`, `fix-windows-fixture-psmodulepath`,
  `fix-windows-upgrade-unverified-archive`.
- **Outcome:** deployed. Marketplace update 0.5.1 → 0.6.0 healthy; cargo-dist published
  all five targets plus both installers and sha256 sidecars (run 30207497471); the real
  release was installed through the installer's own checksum verification and
  `the-loop --version` printed `the-loop 0.6.0`.
- **Rollback:** previous tag `v0.5.1`; plugin rollback per the Release runbook.

## Why this was a minor bump

`cli-upgrade` adds a new user-facing subcommand, so `v0.5.1 → v0.6.0` rather than a
patch increment. `plugin.json` and `cli/Cargo.toml` moved together in `83bbb17`, as
cargo-dist requires.

## The halt, and what it caught

The first gate attempt **failed and stopped before tagging**. The `upgrade-windows`
job — authored during `cli-upgrade`, never once executed until this release — went red
on its first run (30187625535). Diagnosis found two defects stacked behind each other:

1. **`fix-windows-fixture-psmodulepath`** (harness). The fixture spawns Windows
   PowerShell 5.1 from the cargo test process, which inherited pwsh 7's `PSModulePath`;
   5.1 autoloaded PowerShell 7's Core-only `Microsoft.PowerShell.Utility` and
   `Get-FileHash` resolved to nothing. All three fixture tests died in bring-up.
2. **`fix-windows-upgrade-unverified-archive`** (product, and the serious one). With
   the harness working, the corrupt-archive case failed for real. `upgrade` delegated
   archive integrity to the installer, but the cargo-dist-generated `.ps1` verifies
   nothing, and the Windows rename-aside ran *before* anything established the
   replacement was sound. A corrupt download left an unloadable 145,985-byte
   `the-loop.exe` (`0xC000007B STATUS_INVALID_IMAGE_FORMAT`) at the install path with
   the real 3,664,384-byte binary orphaned as `the-loop.exe.old`. `upgrade` now verifies
   the archive against its published `.sha256` sidecar before any step that displaces
   the installed binary, with a hand-rolled SHA-256 (no new crates).

Both fixes landed and the gate was re-run on the released tip: **run 30206969401, 4/4
pass**, including `corrupt_archive_leaves_the_older_binary_in_place_and_names_the_failure_on_stderr`.
This is the first release in which the Windows rename-aside swap has been proven at all.

## Operational notes

- Ready checks at the released tip: `npm test` 218/218, `the-loop check` OK 54 features,
  `cargo test --all-features` 273 passed, `cargo clippy --all-targets --all-features
  -D warnings` clean, `cargo fmt --check` clean, eslint clean.
- Procedure replays covered all seven releasing features. Notably
  `fix-test-fixture-tempdir-collision`'s 25-run contention loop at 13 threads returned
  **PASS=25 FAIL=0** against a 3/25 baseline — the flake that reddened the previous
  three release cuts is closed.
- `fix-execution-pipeline-name-entrypoint`'s criterion 1 deferred its live check to this
  gate. Verified against the installed bundle: `…/the-loop/0.6.0/` contains only
  `agents/` and `skills/` — no `workflows/`, no `.js` — so `the-loop:execution-pipeline`
  is not reachable by name from a consuming session.
- **A lint failure reached `main`.** `f5568cf` landed with `cargo fmt --check` red,
  which this project's bound `lint` hook includes; the validator passed it anyway.
  Corrected in `7e42556` with plain `cargo fmt`. No `#[rustfmt::skip]` was introduced —
  the repo has no precedent for that directive — so `SHA256_K` now takes rustfmt's
  one-constant-per-line form instead of a 7-per-row table. Worth revisiting; worth more
  is that a validator passed a tree failing the project's own lint gate.
- **Pruning required edge surgery.** Two live features carried `depends_on` edges into
  pruned fix nodes (`execute-skill` → `fix-execution-pipeline-name-entrypoint`,
  `agent-surface-trim` → `fix-landing-into-checked-out-target`). Both edges were dropped
  with the nodes, the dependency being satisfied by the fix shipping; without that,
  `check` would have failed on dangling references. Any future release that prunes a
  fix node depended on by live work needs the same step.
- The first pipeline run stalled its second build on all 6 attempts across an ~8-hour
  overnight window, with no commits reaching the branch. Measured afterwards, neither
  cold builds (cache warm, 1.7s) nor slow tests (full suite 5.5s) explain it — it was
  agent-side silence. A straight relaunch completed in ~1 hour.

## Known, not fixed here

`README.md:61` still lists `workflows/execution-pipeline.js` inside its `plugin/`
repo-layout tree. The path no longer exists; flagged at
`fix-execution-pipeline-name-entrypoint`'s validation as outside that feature's
contract, and still outstanding.
