# Escalation — executor-delegation (parked at validate)

The independent validator judged the built feature `deviation` (validations entry
`0fcad572050c500ba491ce056523dbb0cc7360fc`, 2026-07-03): readiness clean,
forensics and conformance both PASS on a fresh, independent re-exercise of every
task (not taken on the completion reports' word) — including a real, unscripted
end-to-end run of `claude -p --agent drive` (agents/drive.md's own body) against
the real `grok` CLI on a throwaway fixture, which reproduced criterion 1's exact
shape: one driver-authored `<feature-id>/<task-id>: <title>` commit on the
feature branch, a disposed isolated worktree, and a completion-report summary
opening "Driven via grok/grok-build — ".

**The full test suite is not green, for a reason this diff itself introduces.**
`test/spine-cli.test.js:224` ("spine models merges an overridden defaults file
with project < local settings overrides ... carrying a bound via through
untouched") is model-selection's own acceptance-criterion-1 test. Its fixture
binds `drive` via the placeholder value "my-executor" — never meant to be a real
executor, only used to prove an arbitrary `via` value survives settings-layer
merges untouched. Task t4 wires `validateBindings` unconditionally into `spine
models`, so that placeholder now trips the new `unregistered-executor` hard
error, and `spine models` exits 1 with no table, breaking every assertion in the
test. Confirmed not pre-existing: the identical test passes cleanly (121/121) at
the integration target's pre-diff tip (`worktree-executor-delegation`, commit
`8aae8c6`), reproduced in an isolated worktree; it only fails (152/153) once
executor-delegation's diff lands, reproduced consistently across two full-suite
runs, not flaky. `npm run lint` and `node bin/spine.js check` both stay clean.
The same underlying failure also breaks the "full suite green" pinned
observation replayed from two existing probe-pack entries
(`docs/probes/inner-loop-workflow.md` and
`docs/probes/ledger-title-preservation.md`), recorded as its own runtime-leg
finding since no clause of executor-delegation's own contract supersedes
model-selection's via-pass-through behavior.

Four completion reports (t4, t5, t6, t7, t8) each recorded this exact failure —
fixture, error text, file:line all accurate — but characterized it as
"pre-existing, unrelated" and left it red under the no-unrelated-fixes rule. The
"pre-existing" framing does not hold: the target-tip delta-proof above confirms
this diff's own t4 introduces the regression into an already-validated feature's
acceptance criterion; the no-unrelated-fixes rule protects a footprint from
someone else's pre-existing failure, not from a regression the diff itself
causes elsewhere.

Every one of executor-delegation's own four acceptance criteria was
independently exercised: the resolver/registry hard-fail and warn cases against
fresh fixtures; the real grok CLI's availability and auth-smoke commands,
confirmed genuinely functional in this environment; a live, unscripted
end-to-end drive run, delta-proved against the integration target's pre-diff tip
(the entire driven-execution capability — `agents/drive.md`,
`executors/grok.md`, `protocols/branch-and-booking.md`, and
`workflows/inner-loop.js`'s routing — is confirmed absent there and fully
functional on the merged tree).

## Escalation

```yaml
feature: executor-delegation
phase: validate
kind: feature
deviation: >-
  One contract-breaking acceptance-leg finding, propagating identically into the
  runtime leg's pack replay: t4 wires validateBindings unconditionally into spine
  models, and test/spine-cli.test.js:224 (model-selection's own
  acceptance-criterion-1 test) uses a fixture binding drive via the placeholder
  value "my-executor" — never a registered executor, used only to prove that an
  arbitrary via value survives settings-layer merges untouched. That via now
  trips the new unregistered-executor hard error, so spine models exits 1 with no
  table, breaking the test's every assertion. Confirmed not pre-existing: the
  identical test passes cleanly (121/121) at the integration target's pre-diff
  tip (worktree-executor-delegation, commit 8aae8c6); it only fails (152/153)
  once executor-delegation's diff lands, reproduced consistently across two
  full-suite runs, not flaky. The same failure also breaks the "full suite green"
  pinned observation replayed from two existing probe-pack entries
  (docs/probes/inner-loop-workflow.md and docs/probes/ledger-title-preservation.md),
  recorded as its own runtime-leg finding since no clause of
  executor-delegation's own contract supersedes model-selection's via-pass-through
  behavior. Four completion reports (t4, t5, t6, t7, t8) each characterize the
  failure as "pre-existing, unrelated" and leave it red under the
  no-unrelated-fixes rule — the quoted facts are accurate, but "pre-existing" is
  not: it is this diff's own regression into an already-validated feature's
  acceptance criterion. All other legs are clean: forensics found zero confirmed
  hits (one dismissed, prose-only); conformance found zero findings on either
  axis, with every criterion independently re-exercised live against fresh
  fixtures, including a real, unscripted end-to-end claude -p --agent drive run
  against the real grok CLI, reproducing criterion 1's exact shape.
menu:
  - fix-in-place — append a task updating test/spine-cli.test.js:224's fixture to
    bind drive via either the literal agent (or no via) or a real registered
    executor id instead of the placeholder "my-executor" (preserving the test's
    actual point — via rides through merges untouched — without tripping the new
    hard-validation), build it on the branch, re-validate
  - waive — merge on human authority, recording the one red model-selection
    acceptance-criterion-1 regression as an accepted transitional gap until a
    separate commit updates the stale fixture
  - re-plan — route t4 back to Plan to scope spine models's new hard-validation
    (e.g. an explicit opt-in flag, or a documented one-time fixture update
    alongside the wiring change) so a pre-existing, already-validated feature's
    test fixture isn't broken by a later feature's unconditional CLI change, then
    rebuild and re-validate
branch: loop/executor-delegation
```
