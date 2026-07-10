# Validation procedure: fix-drive-executor-lifecycle

**Feature:** fix-drive-executor-lifecycle
**Surface:** `plugin/agents/drive.md` (agent guidance) + `test/drive-executor-lifecycle.test.js` (source-text pinning)
**Date of this pass:** 2026-07-10
**Mode:** judge-only validation of an assembled integration worktree (no tree mutation by the judge)

## Bring-up

This is a prose/guidance fix with no CLI surface change. The repo's general-purpose fixture-repo binding (`node bin/create-sample-repo.js` → exercise `the-loop.js` against the fixture → `rm -rf`) does not exercise a live drive-executor lifecycle run (that requires a real 120–160s CLI executor session). Per the feature's design doc: "No red/green command exists — the defect is prose guidance in an agent doc."

**Substitute bring-up (this pass):**

1. Work from the assembled integration worktree root.
2. Confirm the diff against `main` touches only:
   - `plugin/agents/drive.md`
   - `test/drive-executor-lifecycle.test.js`
3. Run:
   - `npm test` (observed: 283 pass, 0 fail)
   - `npm run lint` (observed: exit 0)
   - `node --test test/drive-executor-lifecycle.test.js` (observed: 4 pass — one per criterion plus adoption)

## Exercise

1. **Pinning suite as the in-repo bar.** `test/drive-executor-lifecycle.test.js` reads `plugin/agents/drive.md`, collapses whitespace, and asserts the exact wording each acceptance criterion requires (same technique as `merge-posture.test.js`). All four tests passed.
2. **By-eye read of `plugin/agents/drive.md`.** Confirmed the guidance is coherent and followable, not merely substring-present:
   - Step 1 names an adoption path: check for a pre-existing worktree with a finished-or-running executor before a cold start; adopt it, still verify before committing ("not a license to skip verification").
   - Step 2 names 120000ms default / 600000ms ceiling, requires an explicit `timeout`, makes background+long-wait the default for compile/suite-running tasks (not the rare exception), and instructs a proactive `blocked` kind `environment` return (the retry lane) with a self-contained worktree-adoption note — worktree path, branch, footprint, pid, and verification commands still owed — before the drive's own budget forces an ad-hoc cutoff.
   - Step 3 adds a stalled-vs-working gate before any retry/relaunch: check the pid has exited and the output/diff is not still-advancing; a live or still-advancing executor is waited on, never relaunched with a byte-identical brief; the drive records the liveness/output-growth check it made; concurrent identical briefs against the same worktree are forbidden.
3. **Integrity (tests bite).** Independently re-ran the same assertions against `git show main:plugin/agents/drive.md` (the pre-fix text): `generous timeout` is still present, `120000`/`600000` are absent, the proactive `blocked kind environment` phrase is absent, and `byte-identical brief` is absent — confirming the pinning tests genuinely require the fixed wording and are not vacuously true against the old doc. No `eslint-disable` or lint-config edit appears anywhere in the feature diff; no test was deleted or weakened.

### Not exercised in this pass

A live drive-routed executor session lasting >120s of wall time was **not** run. No live observation of: completion past the former 101–115s kill window, a proactive budget-exhaustion blocked return with an adoption note in a real transcript, or a wait (vs. byte-identical relaunch) against a live/growing executor process.

## Expected observations (this pass)

| Check | Expected | Observed |
| --- | --- | --- |
| Full suite | green | 283 pass |
| Lint | clean | exit 0 |
| Pinning tests | 4 pass | 4 pass |
| `drive.md` criterion wording | present and coherent | met by eye |
| Pin asserts vs. main (pre-fix) | fail | fail (confirmed on `generous timeout`, `120000`, `600000`, `byte-identical brief`, `blocked kind environment`) |
| Live >120s executor session | out of scope this pass | not run |

## Deferred exercise (from the feature's design doc)

From the feature design doc's own Validation procedure section:

> `docs/validation/role-agent-binding/procedure.md` gains one exercise step: after the next drive-routed run on a task that takes >120s of executor wall time, inspect the executor session and drive transcript per Steps to reproduce — the executor session must run to completion (non-empty `signals.json`, no ~101–115s death), any budget-exhaustion return must be a proactive retry-lane blocked with a worktree-adoption note, and no byte-identical relaunch may overlap a live executor.

That live inspection is the deferred real-world exercise after this guidance ships; it is not claimed as observed in this judging pass.

## Teardown

No fixture repo was created; no teardown required. Integration worktree left unaltered by the judge (read-only).
