# inner-loop-workflow — Workflow orchestration (ready-set, BoundaryResult)

**Status:** shipped (v1 ADR-0029 mechanics; rewritten by the v2 taming,
ADR-0036/0038).

## What it is

`workflows/inner-loop.js` — the deterministic engine. No filesystem, no imports;
`agent`/`log`/`args`/`budget` arrive as harness globals; the completion channel is a
bare top-level `return` of the BoundaryResult (the shim tests transform the script
the same way the harness does).

- **Input**: the `the-loop launch` snapshot as `args` — `{target, scope, probe, models,
  spine, features: {id → {title, acceptance, depends_on, designDoc, branch,
  branchHead, plan|null, builtTasks}}}`.
- **Scheduling**: a generic ready-set walk (`readySetRun`) used at both levels —
  features across the scoped subgraph, tasks across a plan's DAG. Only a dependency
  that *landed* unblocks dependents; a halt stops the walk without mislabeling the
  un-started remainder.
- **Kernels pushed** (ADR-0036): plan/validate prompts carry the feature design doc;
  build prompts carry the task contract + a fetch menu. 29-byte prompts are dead.
- **Lanes**: plan's return picks small (one build spawn, no plan artifact) or
  standard (task DAG). Already-built tasks (from `builtTasks`) are skipped — resume
  is free.
- **Validate lock**: validators serialize on a promise-chain mutex — merges hit the
  target one at a time.
- **Model routing**: every spawn passes model/effort from `models[role]`
  (`build.<tier>`, drive via `drive.<via>` → `drive`); unbound roles fall back to
  the session model with one visible `model-selection —` log line.

## Contract: BoundaryResult

```
{ completed: [feature-id],
  blocked:   [{feature, reason, options}],   # human decisions at the boundary
  stalled:   [{feature, agent, note}],        # agent/infra error; re-run next pass
  halted?:   {reason: budget-exhausted|environment-blocked, detail},
  budget:    {spent, remaining} }
```
