# v0.4.10 — args-transport and record-prompt fixes

- **Date:** 2026-07-10
- **Tag:** `v0.4.10` (tip `d69b130`, the plugin-version-bump commit — the deployed
  tip; the record commit lands after the tag, as with `v0.4.5`–`v0.4.9`).
- **Features:** two `fix-<slug>` diagnose nodes — **pruned from the feature graph on
  release** per ADR-0039, not flipped to shipped; their RCAs survive at
  `docs/bugs/<id>.md`. They were the entire `validated` set at release time.
  - `fix-execution-context-args-transport` — the Workflow `args` channel (model
    token stream) corrupted large escaped execution-context JSON, killing runs
    before any agent spawned. Fix: `prepare-execution-context --script-out` splices
    the context into the script as an `EMBEDDED_CONTEXT` literal (shape-gated like
    the meta splice), the pipeline prefers it over `args`, and the begin skill's
    launch leg passes `scriptPath` only. The in-process `args` path (object and
    JSON-string) survives for the harness suite.
  - `fix-record-prompt-cli` — the Record spawn's prompt never named the CLI
    invocation, so the record agent fell back to bare `the-loop`, found nothing on
    PATH, and every installed-plugin run silently lost its calibration record. Fix:
    the record prompt gains a deterministic `cli:` trailer outside the transcribed
    payload (byte-identical pinned YAML preserved); `record.md` uses the trailer
    with a bare `the-loop` fallback.
- **Run provenance:** both fixes were diagnosed on `main` (`a7e5b63`,
  design_version 27) and built/validated by execution-pipeline run
  `wf_52877d81-b9c` targeting `main` directly (2 completed, 0 blocked, 0 stalled;
  7 agents), launched from a scratch worktree because the operator session's
  checkout was on `rust-replatform`. That run's calibration record (`045460e`)
  landed from a non-PATH `cli` binding — live corroboration of the record-prompt
  fix.
- **Ready evidence:** at the pinned tip — `npm test` **277/277**, `npm run check`
  **OK 42 features** pre-prune (40 post-prune) + eslint clean. Procedure replays:
  argless-launch (begin-front-door-rename procedure step 6 idiom) — spliced script
  with nested-`\"` design doc loaded with no `args` deep-equals the assembled
  context; record-prompt — the Record spawn's prompt ends with the non-PATH `cli:`
  trailer under the real harness, pinned record tests 8/8. The
  calibration-capture procedure gained the exercise step the fix's validator had
  omitted (rides this release's record commit).
- **Deploy:** recorded marketplace chain run verbatim from the repo root (primary
  checkout switched to `main` for the deploy, back to `rust-replatform` after);
  the update leg upgraded **0.4.9 → 0.4.10**. Health check **green** (installed
  0.4.10, enabled, `details` resolve). Restart required for a live session.
- **Outcome:** deployed
- **Rollback pointer:** `v0.4.9` (code); `claude plugin uninstall the-loop@the-loop
  --scope user` (plugin).
- **Approval:** Jackson Atassi, 2026-07-10 — release gate approved in-session
  (deploy path: brief primary-checkout switch; procedure-gap fix folded into the
  record commit).
