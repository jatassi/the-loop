# run-presentation — scope-derived workflow description + prefix-free spawn labels

**Status:** designed (2026-07-05 amendment).

## What it is

Two fixes to how a run reads in the workflow UI:

1. The engine's `meta.description` is static — every run shows "One autonomous
   pass over the scoped feature graph…" in the permission dialog and workflow
   list, so runs are indistinguishable. The description should carry the run's
   scope and target.
2. Spawn labels carry an agentType prefix (`build:alpha/t1`) that duplicates the
   phase box (`Build`) the spawn already sits in (workflow-phase-grouping).

## The harness constraint that shapes the design

The harness takes a workflow's description **only** from the script's `meta`
block — the Workflow tool's `description` parameter is ignored — and `meta` must
be a pure literal: no variables, no interpolation from `args`. A per-run
description therefore cannot be computed inside the canonical script; it
requires a **per-run script copy** whose meta literal is spliced before launch
and passed as `scriptPath`.

## Mechanism: the splice leg on prepare-execution-context

`the-loop prepare-execution-context` gains one flag:

```
--script-out <path>   also write the launch-ready per-run workflow script
```

With the flag, after the existing gates pass, the command reads the canonical
`PLUGIN_ROOT/workflows/execution-pipeline.js`, splices the scope-derived
description into the meta line, and writes the copy to `<path>`. Stdout (the
execution context JSON) and all gate behavior are unchanged; without the flag,
nothing is written.

Splice contract (pure core in `src/`, I/O at the bin edge, matching the
existing split):

- **Description shape**: `<id>, <id> → <target>` — every in-scope
  feature id in scope order; past 5 ids, the first 5 then `+<k> more`.
- **Quote safety**: the description value lands JSON-stringified into the
  literal (feature ids are schema-pinned kebab-case, but the target branch is
  arbitrary user input).
- **Shape gate**: if the canonical script's one-line meta doesn't match the
  expected `description: '…'` shape, exit 1 with nothing written — never
  silently hand back an unspliced script.
- **One-line meta survives**: the eslint preprocessor and the test shim's regex
  pin meta to one physical line (workflow-phase-grouping); the splice must
  preserve that.

**Launch leg** (`commands/the-loop.md`): the prepare-execution-context step
passes `--script-out` with a session-scratch path, and the Workflow call's
`scriptPath` becomes that path — the canonical `workflows/` file is never
launched directly. The scratch copy is session-managed (the harness persists
each invocation's script for resume anyway), so no repo pollution and no
teardown burden.

**Rejected alternatives**:

- *Main-agent edit surgery per run* — an unguided string edit where a
  deterministic, tested CLI leg can exist; rote mechanics route through the
  spine.
- *A separate subcommand* — duplicates scope parsing and the gates; the launch
  leg's one-call shape (gate + assemble in one refusal-capable call) is
  load-bearing.
- *Changing `meta.name` too* — the name is the workflow's stable identity in
  the UI; only the description varies per run.

## Labels: drop the agentType prefix

The four label sites in `workflows/execution-pipeline.js` today:

```
label: `plan:${f.id}`
label: `build:${f.id}/${task.id}`
label: `drive:${f.id}/${task.id} via ${binding.executor}`
label: `validate:${f.id}`
```

become:

- plan, validate → `${f.id}`
- build → `${f.id}/${task.id}`
- drive → `${f.id}/${task.id} via ${executor}` — the suffix keeps drive
  visually distinct inside the Build box

*(Amended by build-agent-title-progress: build and drive additionally gain a
leading `(<pos>/<N>) ` — the task's 1-based position in the plan's task array,
out of the array's total length — whenever the feature built as 2+ tasks. A
small-workflow build or a standard plan that returned exactly one task keeps
the bare shape above; `(1/1)` never appears. Plan and validate stay per-feature
and uncounted.)*

Accepted consequences:

- Labels are unique only within a phase box — a feature's plan and validate
  spawns both read `<feature>`; the box disambiguates. Test fixtures that
  dispatch stub replies by label must re-key on agentType + label.
- `docs/designs/workflow-phase-grouping/design.md`'s label-format line
  (`agentType:feature-id[/task-id]`) is amended by this build — until then it
  describes shipped reality.
- The run summary's `stalled` entries still carry `agent` (the agentType), so
  the drive-vs-build diagnostic survives unchanged.

## Footprint

- `src/` splice pure core + unit tests
- `bin/cli-commands.js` (`--script-out` on `prepareExecutionContextCommand`) +
  the usage text in `bin/the-loop.js`
- `workflows/execution-pipeline.js` label sites +
  `test/execution-pipeline-*.test.js` re-keying
- `commands/the-loop.md` launch leg
- `docs/designs/workflow-phase-grouping/design.md` label-format line
