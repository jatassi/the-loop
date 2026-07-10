# Validation procedure: fix-null-return-stall-opaque

**Feature:** fix-null-return-stall-opaque
**Surface:** `plugin/workflows/execution-pipeline.js` (`spawn` choke point) + `test/execution-pipeline-halt.test.js` (rewritten/added harness tests) + one-line drive guidance in `plugin/agents/drive.md`
**Date of this pass:** 2026-07-10
**Mode:** judge-only validation of an assembled integration worktree (`integrate--fix-null-return-stall-opaque` merged from `loop/fix-null-return-stall-opaque` onto `main`)

## Bring-up

This feature is an internal workflow-engine surface. The design doc's Validation procedure section states there is no standalone live-agent procedure for the fix: exercise rides the same harness-driven path used for environment-block regressions under `docs/validation/worktree-parallelism/`. The binding sanctions driving the harness from outside as the "outside" driver; there is no separate live-agent bring-up for this surface.

**Substitute bring-up (this pass):**

1. Work from the assembled integration worktree root.
2. Confirm the diff against `main` touches only:
   - `plugin/workflows/execution-pipeline.js`
   - `test/execution-pipeline-halt.test.js`
   - `plugin/agents/drive.md` (one guidance line)
3. Run:
   - `npm test` (observed: 289 pass, 0 fail)
   - `npm run lint` (observed: exit 0)
   - `node --test test/execution-pipeline-halt.test.js` (observed: 8 pass)

## Exercise

Harness exercise against the shipped script `plugin/workflows/execution-pipeline.js` via `test/execution-pipeline-harness.js` (and the same scenarios encoded in `test/execution-pipeline-halt.test.js`). Direct one-shot harness invocations were also run to record concrete summary payloads (not only pass/fail).

### Criterion 1 — null return yields label-bearing ambiguity stall note (not opaque literal)

- Scripted no reply (`byLabel({})`) so `agent()` returns null every call.
- **Observed:** `spawns.length === 2` (plan:alpha twice); log line `spawn retry 1/1 — alpha: agent returned null`; stall note exactly:
  `alpha: no result — user-skip or terminal API failure after harness retries; rerun to retry`
- Note carries `opts.label` (`alpha`), names user-skip vs terminal API failure ambiguity, and is **not** the bare literal `agent returned null`.

### Criterion 2 — classified-transient throw: one respawn; success lands; second failure stalls with label + message

- First plan throw: `API Error: Server error mid-response. The response above may be incomplete.`; second plan returns planned; build/validate succeed.
  - **Observed:** two plan spawns with identical prompt/opts; log `spawn retry 1/1 — alpha: …`; `completed: ['alpha']`; `stalled: []`; no halt.
- Same throw on every plan call.
  - **Observed:** `spawns.length === 2`; retry log present; stall note `alpha: API Error: Server error mid-response. The response above may be incomplete.` (label + final `error.message`).

### Criterion 3 — null return also gets exactly one log-announced respawn before stall

- Covered by the null-return exercise above: exactly one respawn, log-announced as `retry 1/1`, then stall booked.

### Criterion 4 — budget-exhausted is not retried; halt taxonomy preserved

- Plan succeeds; build throws `BudgetExceededError('spend cap reached')`.
- **Observed:** spawn agentTypes `['plan', 'build']` — exactly one build spawn; no retry log; `halted: { reason: 'budget-exhausted', detail: 'spend cap reached' }`; `stalled: []`.

### Classifier negative control (ordinary non-transient)

- Plan throws `api hiccup` (must not match transient classifier).
- **Observed:** single spawn; no retry log; stall note bare `api hiccup`.

### Integrity

- `git diff main...HEAD` contains **no** `eslint-disable` and does not touch `eslint.config.js`.
- Old test on `main` (`a null agent return stalls the feature with the pinned note`) asserted `note: 'agent returned null'` with no spawn-count/retry check — that pin is gone.
- Rewrite asserts: `spawns.length === 2`, same prompt/label, `/retry 1\/1/` log with label, note includes label + user-skip/API ambiguity phrasing, and `assert.notEqual(note, 'agent returned null')`. That is a strict flip of the bug-enshrining assertion, not a relaxed pass.
- No tests deleted; ordinary-error coverage retained and strengthened (single-feature non-retry bare-note sibling added).

## Expected observations (this pass)

| Check | Expected | Observed |
| --- | --- | --- |
| Full suite | green | 289 pass |
| Lint | clean | exit 0 |
| Halt tests | 8 pass | 8 pass |
| Null stall note | label + ambiguity; not opaque literal | met (see Exercise) |
| Null / transient respawn | exactly one, log-announced | met |
| Transient then success | completed, no stall | met |
| Transient fail twice | stall with label + message | met |
| Budget-exhausted | halt, no retry | met |
| Integrity (opaque pin flipped) | rewritten tests bite | met |
| eslint-disable / lint-config | none in feature diff | none |

## Teardown

No fixture repo was created (`create-sample-repo.js` not required for this harness-only surface); no teardown required. Integration worktree left otherwise unaltered by the judge except this procedure artifact.
