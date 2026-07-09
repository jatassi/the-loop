# v0.4.8 — environment-block halt accounting fix

- **Date:** 2026-07-09
- **Tag:** `v0.4.8` (tip `9ebfa1e`, the plugin-version-bump commit — the deployed
  tip; the record commit lands after the tag, as with `v0.4.5`–`v0.4.7`).
- **Feature:** `fix-environment-halt-accounting` (a `fix-<slug>` diagnose node) —
  **pruned from the feature graph on release** per ADR-0039, not flipped to shipped.
  Its RCA survives at `docs/bugs/fix-environment-halt-accounting.md`. It was the sole
  member of the `validated` set at release time.
- **Change:** a task-level `blocked`/`kind=environment` return used to halt the whole
  run and silently erase its feature from the summary (read in the field as a
  Build→Validate barrier that doesn't exist). Fix: environment blocks now demote to a
  **feature stall** (the retry lane); run **halts are budget-only**.
  - `plugin/workflows/execution-pipeline.js`: env-block returns
    `{ stalled: … }` instead of `{ halted: … }`.
  - `plugin/agents/drive.md`: a blocked return's `detail` must be self-contained
    (the engine surfaces only `detail`); a mid-work executor cutoff with no
    auth/availability failure is a retryable infra failure, not a hard environment claim.
  - `plugin/skills/begin/SKILL.md`: the front-door halt taxonomy line corrected to
    "budget only".
  - `docs/glossary.md`, ADR amendment, and `test/execution-pipeline-halt.test.js`
    (+ harness) carry the corrected taxonomy and its coverage.
- **Merge provenance:** the fix was diagnosed/designed/built/validated on the
  `define/validate-pipelining` branch (`06e233d` diagnose → `a9d0e01` design →
  `0a6f071` fix), cut from `7ad60ba` — *before* v0.4.7. It was **behind main**, so it
  was integrated by merging current main into the branch (`32ac108`, clean auto-merge:
  git followed the `commands/the-loop.md → skills/begin/SKILL.md` rename and applied the
  front-door edit to the new path), verified green, then fast-forwarded to main. The
  v0.4.7 release records and the begin-rename were preserved intact through the merge.
  Validation artifacts: operator's `~/Git/j45` session.
- **Ready evidence:** at the pinned tip `9ebfa1e` — `npm test` **172/172** (the +1 vs
  v0.4.7 is `execution-pipeline-halt`'s new env-block-stalls cases), `npm run check`
  **OK 33 features** pre-prune / **32** post-prune + eslint clean. This fix's acceptance
  is engine-test-shaped (run-summary accounting), exercised directly by
  `test/execution-pipeline-halt.test.js` rather than a CLI runbook — the green suite is
  its end-to-end pass.
- **Deploy:** recorded marketplace chain run verbatim; the update leg upgraded
  **0.4.7 → 0.4.8** from the `./plugin` subdirectory source. Health check **green**
  (installed 0.4.8, enabled, `details` resolve). Restart required for a live session.
- **Outcome:** deployed
- **Rollback pointer:** `v0.4.7` (code); `claude plugin uninstall the-loop@the-loop
  --scope user` (plugin).
- **Approval:** Jackson Atassi, 2026-07-09 — standing approval to skip the synchronous
  gate for this release ("skip approval gate — you have my standing approval"), given
  after confirming the fix was validated.
