# build — Build (task agents in isolated worktrees)

**Status:** shipped (v1; execution substrate reshaped by ADR-0036/0038).

## What it is

One build agent (agents/build.md) executes exactly one task contract, test-first,
in its own worktree, and lands exactly one commit.

- **Kernel pushed**: the prompt carries the whole contract (criteria, footprint,
  branch, commit subject) plus a menu of fetchable context — the agent fetches
  nothing to start and reads only its footprint code.
- **Worktree**: `the-loop worktree create loop/<feature>--<task> --from <base>` where
  base is the first dependency's branch (or the feature branch); additional dep
  branches merge in first — clean by footprint-disjointness; a real conflict means
  the plan is wrong (feature-shaped block).
- **Commit**: subject `"<feature>/<task>: …"` — this IS the durable task state;
  `the-loop launch` derives built-ness from it on re-runs.
- **Integrity lines** (the craft distillation, ADR-0036): red-then-green per
  criterion, roughly one test each; never weaken/skip/delete a test or suppress a
  lint rule to get green; the implementation never knows it's being tested; the
  footprint is a lease — record excursions as deviations; no TODOs or stubs.
- **Small lane**: the same agent takes a whole feature as one task on `loop/<id>`
  with subject `"<id>/feature: …"`.

## Return

`{result: built, task, summary, deviations[]}` or
`{result: blocked, kind: feature|environment, detail, options[]}` — machine-readable
JSON as the agent's final message, schema-validated at the spawn.
