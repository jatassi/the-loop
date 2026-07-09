# fix-environment-halt-accounting — a task-level environment block halts the run and silently erases its feature from the summary

**Date:** 2026-07-08 · **Affects:** execution-pipeline (drive.md contributes) · **Class:** contract-drift (halt taxonomy premise falsified) + accounting hole · **Cause established by:** reproduced
**Environment:** the-loop v0.4.6 (installed cache byte-identical to checkout `7ad60ba`), run `wf_a53a5f81-dbb` in `~/Git/j45`, engine under the Claude Code Workflow harness; reproduced standalone with `test/execution-pipeline-harness.js` · **Determinism:** always, given the trigger (any `blocked/kind=environment` return in a multi-feature run); the trigger itself is intermittent (executor cut off mid-work) · **Regressed since:** never worked — the halt leg has behaved this way since it landed (ADR-0029, taming v2); its tests only ever exercised single-feature runs

## Symptom as reported

"Validate agents don't spawn until all build agents complete" — a perceived global
Build→Validate barrier when running multiple features. **The barrier does not exist.**
In the observed run, manual-timer's validate spawned 6 seconds after its own final
build ended, exactly as ADR-0038 ready-set scheduling promises. What the reporter saw
was a different defect wearing a barrier costume: plan-editing showed 5/5 build agents
"done" in the UI with no validate ever spawning — because its fifth build had returned
`blocked/kind=environment`, which halted the run and erased the feature.

## Steps to reproduce

1. In a checkout of the-loop, script a two-feature run through
   `test/execution-pipeline-harness.js`: `pfeat` and `mfeat`, both small-path.
2. Reply to `build:pfeat/feature` with
   `{ result: 'blocked', task: 'pfeat/feature', kind: 'environment', detail: '…' }`.
3. Reply to `build:mfeat/feature` with `{ result: 'built', … }` wrapped in a ~50 ms
   delayed Promise (mfeat is mid-flight when pfeat's block lands), and to
   `validate:mfeat` with `{ result: 'validated', feature: 'mfeat' }`.
4. Run the script and inspect the returned summary.

Observed (red): `{"completed":["mfeat"],"blocked":[],"stalled":[],"halted":{"reason":"environment-blocked","detail":"…"}}` —
pfeat appears in **no** bucket, and the spawn log shows `validate:mfeat` spawning
*after* the halt flag was set.

## Expected result

ADR-0029's own contract: `stalled` exists "so the run never silently swallows a dead
agent" — every in-scope feature's outcome must land in exactly one summary bucket.
ADR-0038: features pipeline independently; a run that claims to have halted should
not keep opening new work.

## Actual result

In run `wf_a53a5f81-dbb` (three features: manual-timer 6 tasks, plan-editing 5,
exercise-library 7 planned):

- 48.9m — `plan-editing/e2e-authoring` (drive via grok) returned
  `{result: 'blocked', kind: 'environment', detail: 'See detail field above; no commit was created.'}`
  — its grok executor was cut off mid-edit; the real narrative was in `summary`,
  which the engine never reads. `spawn()` promoted this to a run-level halt.
- plan-editing (4 of 5 tasks landed on their branches) vanished: absent from
  `completed`, `blocked`, and `stalled`; `halted.detail` was the self-referential
  garbage string above. The state file's human-facing summary read
  "plan-editing, exercise-library, manual-timer → main", status `completed`.
- 51.4m — manual-timer's validate spawned **2.5 minutes after the halt**, ran 9 more
  minutes, and landed commit `aef1c52` on main. The halt neither stopped the run nor
  was the environment actually broken — falsifying ADR-0029's premise that an
  environment block "would fail every subsequent feature identically".

## Root cause(s)

Trigger — the drive agent classified "my executor was cut off mid-work" as
`kind: environment`. `plugin/agents/drive.md:25-26` ("an executor auth/availability
failure is kind `environment`") invites this reading, and nothing requires `detail`
to be self-contained even though `detail` is the only field the halt path surfaces.
By the engine's own taxonomy this situation is a **stall** (transient infra, retried
by the next pass), not an environment block.

Underlying cause A — `spawn()` (`plugin/workflows/execution-pipeline.js:88-90`)
promotes any single agent's `blocked/kind=environment` to a run-level halt with no
corroboration. One task's misclassified transient stopped scheduling for a feature
whose other four tasks had all landed.

Underlying cause B — the halt path books nothing: `runFeature` returning `'halt'`
records the feature in no bucket (`execution-pipeline.js:380,389`), and
`result.halted` carries `{reason, detail}` with no feature attribution
(`execution-pipeline.js:405-406`). The feature's outcome is silently lost —
precisely what `stalled` was invented to prevent (ADR-0029).

Underlying cause C — a halt is not a halt: the top-level scheduler breaks, but
`Promise.allSettled(running.values())` (`execution-pipeline.js:212`) drains sibling
`runFeature` chains that continue to spawn *new* agents (manual-timer's validate,
post-halt) because nothing downstream of the break consults `halted` before spawning.

Why nothing caught it: `test/execution-pipeline-halt.test.js:52-63` pins the
environment halt for a **single-feature** run only; no test ever ran the halt leg
with a concurrent sibling feature, so the vanishing feature and post-halt spawns
were never specified. The perceived "barrier" is a contributing display effect: the
workflow UI marks a build agent "done" whether its task landed or returned blocked,
so a blocked final task reads as "feature fully built, validate refusing to start".

## Evidence

- Run journal `~/.claude/projects/-Users-jatassi-Git-j45/5f7ec9fa-…/subagents/workflows/wf_a53a5f81-dbb/journal.jsonl`:
  per-agent returns — 5/5 plan-editing builds "done", the fifth returning
  `blocked/environment`; manual-timer validate returning `validated`.
- State file `workflows/wf_a53a5f81-dbb.json` `workflowProgress` timeline
  (queuedAt/startedAt per agent): manual-timer validate queued at +51.4m, 6 s after
  its own last build (+51.3m) and 2.5 m after the halt (+48.9m) — disproving the
  barrier and proving the post-halt spawn.
- Red repro (recipe in Steps above) against the unmodified engine: pfeat absent from
  every summary bucket while mfeat completes post-halt.

## Fix design

Demote, don't halt. Run-level halts remain only for budget exhaustion (the one
harness-verified signal); an agent-reported environment block becomes a feature-level
**stall** — the retry lane, which is semantically exact for "executor cut off, no
commit created, nothing booked, rerun next pass":

- `spawn()` (`execution-pipeline.js:79-92`): replace the `blocked/kind=environment →
  halted` promotion with `{ stalled: { feature, agent, note: detail } }`. This fixes
  A (blast radius), B (stalls carry the feature id — accounting restored), and moots
  C for this class (no halt, so no post-halt incoherence; the budget halt that
  remains is enforced by the harness itself, which refuses further `agent()` calls).
- `test/execution-pipeline-halt.test.js`: rewrite the environment case to pin the
  stall (single-feature), and add the two-feature regression (below).
- `plugin/agents/drive.md`: require `detail` to be self-contained — it is the only
  field the engine surfaces; "see above" narrations are useless downstream. Note that
  an executor cut off mid-run is a retryable infrastructure failure.
- Prose sweep: `plugin/commands/the-loop.md` ("halted — budget or environment") and
  ADR-0029's halt taxonomy get a correcting amendment: environment blocks stall the
  feature; the "fails every subsequent feature identically" premise was falsified in
  the field (this run's post-halt validate succeeded).

Constraint for the builder: the engine file has no imports and no filesystem — the
fix stays inside the existing harness-global idiom, proven via
`test/execution-pipeline-harness.js` against the shipped script itself.

## Regression

1. Given a two-feature run where P's build returns `blocked/kind=environment` while
   M's build is mid-flight, when the run summary returns, then P appears in
   `stalled` carrying the block detail, M completes (its validate still spawns), and
   `halted` is absent.
2. Given a single-feature run whose build returns `blocked/kind=environment`, when
   the run ends, then the feature is in `stalled` (retry lane) and the run is not
   halted — the inverse of the current pinned behavior.
3. Given any engine test's summary, every in-scope feature id appears in exactly one
   of `completed` / `blocked` / `stalled` (halted-remainder features excepted only
   for budget halts, where `halted` explains them).

## Runbook

`docs/runbooks/worktree-parallelism/runbook.md` gains one exercise step: run the
two-feature environment-block scenario (Regression 1) and confirm the summary
accounts for both features — no standalone runbook for the fix.
