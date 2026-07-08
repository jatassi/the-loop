# Brief — build-agent-title-progress: task-position prefix on build agent titles

## Intent

When a feature's work is divided across several tasks, the execution-pipeline
workflow spawns one build agent per task, each titled `<feature>/<task>` in the
progress tree. Watching a run, you can't tell at a glance how much of a divided
feature is in flight — three sibling agents read as three unrelated lines. This
feature prefixes each divided-feature build title with its position in the plan,
so `<feature>/<task>` becomes `(2/3) <feature>/<task>`: the title itself tells
you this is task 2 of a 3-way split. A cosmetic, at-a-glance legibility win for
the operator watching the workflow — nothing about how work is scheduled or run
changes.

## Users

The-loop operator watching the execution-pipeline progress tree (Jackson today).
One reader; the change is purely what that reader sees in an agent's title.

## Scope envelope

- **In:** the build-agent title in `workflows/execution-pipeline.js` — the normal
  build spawn label and the `... via <executor>` drive-path label — gains an
  `(i/N)` prefix when, and only when, the feature built as 2+ tasks.
- **Out:** the Plan and Validate agent titles (they stay `<feature>`); branch
  names, commit subjects, merge order, and any other functional identifier (those
  derive from `f.id`/`task.id`, never from the display label); any live/dynamic
  progress counting; any change to scheduling or concurrency.
- **Later:** none noted.

## Decided

- **The number is a fixed ordinal, not a live counter.** `(2/3)` is the task's
  fixed slot in the plan; a given task reads the same `(i/N)` no matter when it
  starts or finishes. Rejected the running-tally reading — tasks build
  concurrently, so a live count would make the same task show a different number
  run-to-run, which is noise, not progress.
- **The ordinal is the task's 1-based position in the plan's task list** (the
  order the plan declares its tasks), and `N` is the total task count. Not parsed
  from the task ID: IDs are free-form (`parser`, `validator`, …), so number and
  ID can legitimately diverge — the 2nd-listed task reads `(2/3)` even if its ID
  is `parser`.
- **The prefix appears only when the feature built as 2+ tasks.** The small
  workflow path (feature built whole, one agent) and a standard plan that returns
  a single task both keep today's bare label — a lone `(1/1)` never appears,
  matching "if the plan agent elected to divide up the work."
- **The drive path carries the same prefix.** A task routed to a non-agent
  executor is still one of the N divided tasks, so its title reads
  `(2/3) <feature>/<task> via <executor>` — the prefix rule is uniform across
  every divided task, agent-run or executor-run.
- **Format is the prefix prepended verbatim to the existing label:**
  `(2/3) cool-feature/parser` and `(2/3) cool-feature/parser via codex`.
- **Re-run consequence (decided by the two rules above):** on a relaunch where
  some tasks already landed, the remaining agents still show their fixed
  full-plan ordinals — a 3-task feature with task-1 already built spawns
  `(2/3)` and `(3/3)`, never a re-based `(1/2)`.

## Deferred

- Nothing foundational. Where the task index and total are threaded to the
  label-construction site, and whether that construction is factored into a
  testable helper, are implementation shape — Plan's call.

## Assumptions

- The agent `label` is display-only: it feeds the workflow progress tree and is
  never parsed or used as a functional key. Confirmed by a grep of `workflows/` —
  `label` is only passed into `agent()` opts and never read back — so changing it
  cannot affect branch names, merges, or run outcomes.
- The plan's task-array order is the meaningful "plan-declared order": the Plan
  agent returns the task contracts verbatim in the order it writes them to
  `plan.md`, and the workflow already iterates that same array.

## Constraints

- Change is confined to `workflows/execution-pipeline.js` label construction (the
  build site at line 251 and the drive-path override at line 262). No schema,
  scheduler, or prompt changes.
- Must not touch any functional identifier — branch names (`taskBranch`), commit
  subjects, and merge order all derive from `f.id`/`task.id`, and must be
  byte-identical before and after.
- Plain ESM JS, no build, `node:test`. The existing
  `test/execution-pipeline-harness.js` records `opts.label` per spawn, so every
  criterion below is directly assertable against captured labels.

## Done looks like

1. A feature built as N≥2 tasks: each build agent's title is prefixed
   `(<pos>/<N>) ` where `<pos>` is the task's 1-based position in the plan's task
   list and `<N>` is the total task count — the 2nd-listed task of 3 reads
   `(2/3) <feature>/<task>`.
2. A drive-routed task in a divided feature shows the same prefix ahead of its
   `... via <executor>` title.
3. A feature built via the small path, or a standard plan with exactly one task,
   shows no prefix — today's bare title, unchanged. `(1/1)` never appears.
4. Branch names, commit subjects, and merge order are byte-for-byte unchanged.
