# v0.4.11 — worktree-setup hook family and three friction-sweep fixes

- **Date:** 2026-07-10
- **Tag:** `v0.4.11` (tip `917f726`, the plugin-version-bump commit — the deployed
  tip; the record commit lands after the tag, as with `v0.4.5`–`v0.4.10`).
- **Features:** the full `validated` set at release time — one graph feature flipped
  to shipped, three `fix-<slug>` diagnose nodes **pruned from the feature graph on
  release** per ADR-0039 (RCAs survive at `docs/bugs/<id>.md`):
  - `worktree-setup` — the `worktreeSetup` hook family: one project-supplied
    provisioning command run in every fresh worktree after checkout, loud
    teardown-on-failure, `linkNodeModules` symlink deleted (unbound = no
    provisioning), configure/onboard detection table, agent-surface timeout lines,
    self-binding `npm ci` at the project layer.
  - `fix-plan-commit-gate-blind-spot` — Plan now orders registration-hub edits with
    their implementers so every task's single commit passes a whole-project
    pre-commit gate standalone (pruned).
  - `fix-drive-executor-lifecycle` — drive.md quantifies executor timeouts
    (120000/600000ms), proactive blocked-environment returns with worktree-adoption
    notes, and a stalled-vs-working gate before relaunch (pruned).
  - `fix-null-return-stall-opaque` — null/transient spawn failures get one
    log-announced respawn and label-bearing stall notes; budget-exhausted halts
    are never retried (pruned).
- **Run provenance:** built/validated on `main` by execution-pipeline run
  `wf_2b64c7ba-975` (3 completed, worktree-setup blocked on criterion 8). The block
  was a design-sequencing bug: the criterion demanded self-binding
  `npm ci && cargo fetch`, but `cargo fetch` exits 101 with no root `Cargo.toml` —
  a failing setup command would have deadlocked every future worktree-create.
  Amended (`f9fdeb8`): binding is `npm ci` until `rust-crate-scaffold` lands the
  workspace and widens it. Re-validation run `wf_b5cb4216-1ea` was stopped mid-run
  on the human's instruction ("change was minor"); its completed integration
  assembly was landed manually after re-running the landing checks (299/299,
  eslint clean) and confirming the binding matches the amended criterion.
- **Ready evidence:** at the pinned tip — `npm test` **299/299**, `npm run check`
  **OK 44 features** pre-prune (41 post-prune) + eslint clean. Procedure replays:
  drive-executor-lifecycle pinning tests 4/4; execution-pipeline-halt harness
  scenarios 8/8; plan-commit-gate pins 3/3 (no standalone procedure — suite-pinned
  prompt fix). worktree-setup exercised live end-to-end against a fixture repo
  (unbound/bound-success/created:false/failure-teardown/clean-retry — all met) and
  the procedure recorded at `docs/validation/worktree-setup/procedure.md`
  (`784ad7b`, rides this release).
- **Deploy:** recorded marketplace chain run verbatim from the repo root; the
  update leg upgraded **0.4.10 → 0.4.11**. Health check **green** (installed
  0.4.11, enabled, `details` resolve). Restart required for a live session.
- **Outcome:** deployed
- **Rollback pointer:** `v0.4.10` (code); `claude plugin uninstall the-loop@the-loop
  --scope user` (plugin).
- **Approval:** Jackson Atassi, 2026-07-10 — standing approval given in-session
  ("once all 4 features are validated, /release — skip the gate"), reaffirmed after
  the criterion-8 amendment ("change was minor - stop the workflow and proceed to
  /release").
