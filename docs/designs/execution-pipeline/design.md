# execution-pipeline — Workflow orchestration (concurrency policy, run summary)

**Status:** shipped (v1 ADR-0029 mechanics; rewritten by the v2 taming,
ADR-0036/0038).

## What it is

`workflows/execution-pipeline.js` — the deterministic engine. No filesystem, no
imports; `agent`/`log`/`args`/`budget` arrive as harness globals; the completion
channel is a bare top-level `return` of the run summary (the shim tests transform
the script the same way the harness does).

- **Input**: the `the-loop prepare-execution-context` execution context as `args` —
  `{target, scope, probe, models, spine, features: {id → {title, acceptance,
  depends_on, designDoc, branch, branchHead, plan|null, builtTasks}}}`.
- **Scheduling**: a generic concurrency policy (`concurrencyPolicyRun`) used at both
  levels — features across the scoped subgraph, tasks across a plan's DAG. Only a
  dependency that *landed* unblocks dependents; a halt stops the walk without
  mislabeling the un-started remainder.
- **Task briefs pushed** (ADR-0036): plan/validate prompts carry the feature design
  doc; build prompts carry the task contract + a resource guide. 29-byte prompts are
  dead.
- **Workflow paths**: plan's return picks small (one build spawn, no plan artifact)
  or standard (task DAG). Already-built tasks (from `builtTasks`) are skipped —
  resume is free.
- **Validate lock**: validators serialize on a promise-chain mutex — merges hit the
  target one at a time.
- **Model routing**: every spawn passes model/effort from `models[role]`
  (`build.<judgment_level>`, `drive.<executor>` → `drive`); unbound roles fall back to
  the session model with one visible `model-selection —` log line.

## Contract: run summary

```
{ completed: [feature-id],
  blocked:   [{feature, reason, options}],   # human decisions at the boundary
  stalled:   [{feature, agent, note}],        # agent/infra error; re-run next pass
  halted?:   {reason: budget-exhausted|environment-blocked, detail},
  budget:    {spent, remaining} }
```
