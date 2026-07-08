# build-agent-title-progress — task-position prefix on build agent titles

**Status:** designed (2026-07-08 amendment).

## What it is

When a feature builds as several tasks, the execution-pipeline spawns one build
agent per task, each titled `<feature>/<task>` in the workflow progress tree.
Three sibling agents read as three unrelated lines — you can't see at a glance
that they're a 3-way split of one feature, or how far the split runs. This
amendment prefixes each divided-feature build title with its plan position:
`<feature>/<task>` becomes `(2/3) <feature>/<task>`. Purely what the operator
sees; scheduling, concurrency, and every functional identifier are untouched.

## How it fits

This refines the label shapes `run-presentation` established. That feature
dropped the agentType prefix, settling the current shapes:

```
build → `${f.id}/${task.id}`
drive → `${f.id}/${task.id} via ${binding.executor}`
```

This amendment prepends `(<pos>/<N>) ` to both — but only when the feature built
as 2+ tasks. The non-divided cases (small workflow path, or a standard plan that
returned a single task) keep run-presentation's bare shape exactly, so a lone
`(1/1)` never appears. Plan and validate labels are per-feature, not per-task —
there is nothing to count — so they stay the bare `${f.id}`, out of scope.

Because run-presentation's design doc carries a present-tense label-format line,
the build for this feature amends that line the same way run-presentation amended
workflow-phase-grouping's (see Footprint) — until then it describes shipped
reality. run-presentation's shipped acceptance in the feature graph is left as
the historical record of what it delivered; this feature's acceptance carries the
refined shapes.

## The interfaces it touches

Three sites in `workflows/execution-pipeline.js`, all reachable from the task's
position in the plan's task array:

```js
// the normal build spawn label
function buildSpawnOpts(f, task, binding) {
  return { agentType: agentTypeFor('build'), label: `${f.id}/${task.id}`, phase: 'Build', schema: BUILD_SCHEMA, ...modelOpts(binding) };
}

// the drive-path override inside runTask
label: `${f.id}/${task.id} via ${binding.executor}`,
```

The position and total live where the task array is in hand:

- `runBuild(f, tasks)` holds `plan.tasks` — the array the workflow already
  iterates, in plan-declared order. A task's 1-based position is its index in
  that array (`tasks.findIndex(t => t.id === id) + 1`, or a precomputed id→index
  map), and `N` is `tasks.length`. This is the sole source of the ordinal — never
  parsed from the task id, which is free-form.
- `runSmallBuild(f)` builds a synthetic `{ id: 'feature', … }` task and must pass
  **no prefix**.
- `runTask(f, task, prompt)` is shared by both build paths and applies the
  drive-path override, so whatever carries the prefix must reach `runTask` and be
  applied to both the normal and the `via <executor>` label.

**The contract, not the wiring** (the wiring — extra params vs. a precomputed
prefix string — is Plan's call): the prefix is decided where the task count is
known. `runBuild` passes `(<index+1>/<tasks.length>)` per task **only when
`tasks.length >= 2`**; `runBuild` with a single task and `runSmallBuild` pass an
empty prefix. The prefix, when present, is `(<pos>/<N>) ` prepended verbatim to
whichever label `runTask` would otherwise emit.

## Why these shapes

- **Fixed ordinal, not a live tally.** `(2/3)` is the task's permanent plan slot.
  Tasks build concurrently (`runConcurrencyPolicy`), so a running "N-th finished"
  count would make the same task show a different number run-to-run — noise, not
  progress. Consequence, already implied: a relaunch where task-1 already landed
  still spawns `(2/3)` and `(3/3)`, never a re-based `(1/2)`.
- **Position from the array, not the id.** Task ids are free-form (`parser`,
  `validator`), so `(2/3) <feature>/parser` is legal — the number tracks
  list position, which is what a human reading `plan.md` sees.
- **No `(1/1)`.** A number that is always `1/1` conveys nothing; the bare label
  is cleaner. "Divided" means 2+ tasks.

## Rejected alternatives

- *Live progress counter* — racy under concurrency (above).
- *Parse the number from the task id* — breaks on name-style ids; needs a
  fallback that reintroduces the array-position logic anyway.
- *`(1/1)` on single-task / small builds* — pure noise.
- *Prefix plan/validate titles too* — they're per-feature; there is no sequence
  to number.

## Footprint

- `workflows/execution-pipeline.js` — the prefix threading (`runBuild` computes
  position/total, `runSmallBuild` passes none, `runTask`/`buildSpawnOpts` apply
  it to both the build and drive labels).
- `test/execution-pipeline-happy.test.js`, `test/execution-pipeline-drive.test.js`
  — assert the prefixed and unprefixed labels; the harness records `opts.label`
  per spawn, so every criterion is a direct assertion.
- `docs/designs/run-presentation/design.md` — its build/drive label-format line
  gains the `(i/N)`-prefix refinement (following run-presentation's own precedent
  of amending the prior doc's line).
