# Release v0.5.1 — 2026-07-22

- **Tag:** `v0.5.1` (bump commit `2e8778b`, the released tip)
- **Features shipped:** none — the graph's `validated` set was empty at gate time.
  No status flips, no pruned `fix-` nodes. This is a maintenance patch cut on the
  human's explicit designation, not a feature release.
- **Also released:** `8579021` — stale `docs/feature-graph.md` references corrected
  to `docs/feature-graph.json` across four shipped plugin surfaces
  (`skills/design`, `skills/diagnose`, `skills/onboard`, `agents/validate`) and the
  README. Docs-only riders carried along: the `cli-upgrade` brief, the `cli-upgrade`
  and `begin-version-handshake` design docs, ADR-0053, the `v0.5.0` report, the
  `competitive-eval` brief and CC workflow-framework survey (`09f14ad`, integrated
  from the remote before the gate), and the two `designed`-status graph entries.
- **Outcome:** deployed. Marketplace update 0.5.0 → 0.5.1 healthy; binaries
  published by the tag-triggered cargo-dist workflow (run 29978431674, all five
  targets) and `the-loop 0.5.1` verified installed from the real release — isolated
  install and the PATH binary both, each through the installer's own checksum
  verification via the private-repo local-server path.
- **Operational notes:**
  - Ready checks at the released tip: `npm test` 208/208, `npm run check` OK
    (44 features, 0 errors/warnings), `cargo test` 232/232.
  - The human made approval conditional on integrating remote changes first. One
    remote commit (`09f14ad`, docs-only) was rebased under the local bump, moving
    the tip; step 1 was re-run in full at the new tip per the skill, and the gate
    was not re-litigated.
  - **No procedure replay was possible: `docs/validation/` does not exist in this
    repo.** The runbook's ready-check clause names it, but there are no recorded
    procedures to replay — for this release or any. Worth closing that gap before
    the next feature release.
  - The known cli unit-test flake surfaced once more on the cold first run
    (`worktree::tests::process_missing_branch_arg_exits_1`, this time a temp-fixture
    `git init` template-hooks copy collision rather than v0.5.0's `index.lock`
    race). Passed in isolation and 3/3 on full re-runs. Third consecutive release
    to hit it — still an open diagnose-intake candidate, now with two distinct
    failure signatures pointing at the same shared-tempdir setup.
- **Rollback:** previous tag `v0.5.0`; plugin rollback per runbook.
