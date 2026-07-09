# build-agent-title-progress — runbook record

Fixture-repo binding (this repo's own binding): the workflow surface exercised from
the outside, never in-process imports. This feature's observable — the build/drive
agent's spawn *label* in the Workflow progress tree — is computed inside
`workflows/execution-pipeline.js` and is not surfaced by any `the-loop … --json` CLI
command against a fixture repo; the only user-facing way to see it live is a full
`claude -p` Plan→Build→Validate run, which the binding designates as the first thing
shed under time pressure. So the label is exercised the way the automated harness
does: the *shipped* `workflows/execution-pipeline.js` is re-executed out-of-process
(`readFileSync` + `AsyncFunction`, never `import`), with only the `agent()` spawn
boundary stubbed to record each `opts.label` — the exact code path a live run takes
to build the label, minus the sub-agent launch. Scenarios below are fresh, distinct
from the committed tests.

## Bring-up

No target repo needed — the surface is a workflow script, driven headlessly. The
driver imports the harness helpers (`runWorkflowScript`, `byLabel` from
`test/execution-pipeline-harness.js` — test *infrastructure*, not this feature's
tests), constructs an execution context in memory, and runs the shipped script.
Replies are keyed on `agentType:label`, so a spawn whose label the code emits
differently than expected gets no reply and the feature fails to complete — the
routing itself is a label assertion.

## Exercise

1. **Criterion 1 — divided build carries `(<pos>/<N>) <feature>/<task>`, position =
   1-based slot in the plan's *declared* task array.**
   Ran a 3-task feature whose declared array order is `[c, a, b]` while the DAG
   builds `a` first (`c` and `b` both depend on `a`). Observed build labels:
   ```
   build  label="(1/3) feat/c"   ← c is declared position 1
   build  label="(2/3) feat/a"   ← a is declared position 2 (yet builds first)
   build  label="(3/3) feat/b"   ← b is declared position 3
   ```
   Position tracks the declared array slot, not DAG build order and not the
   free-form id; `N` is the array length (3).

2. **Criterion 2 — a divided task routing to a registered executor drives as
   `(<pos>/<N>) <feature>/<task> via <executor>`.**
   Ran a 3-task feature binding `build.rote → { executor: grok }`,
   `drive.grok → { model: haiku }`, with the *middle*-declared task (position 2/3)
   marked `judgment_level: rote`. Observed:
   ```
   build  label="(1/3) gizmo/first"
   drive  label="(2/3) gizmo/middle via grok"     ← prefix rides the drive label at pos 2
   build  label="(3/3) gizmo/last"
   ```
   The drive prompt led with `executor: grok · executor-model: grok-build`; the run
   returned `completed: ["gizmo"]` (every label matched what the code emits).

3. **Criterion 3 — undivided builds carry no prefix; `(1/1)` never appears.**
   - Standard plan returning exactly one task → `build label="solo/only"`.
   - Small workflow path → `build label="sm/feature"`.
   Neither starts with `(`. Independently confirmed the no-prefix path is genuinely
   tested (not vacuous): mutating `prefixFor` to always-empty left the dedicated
   single-task/small-build test green while breaking the divided-build tests.

4. **Criterion 4 — branch names, commit subjects, and merge order are byte-identical
   to before the prefix; the prefix lives only in the display label.**
   From the `(2/2) two/t2` build spawn's own prompt (a 2-task feature):
   ```
   worktree: … worktree-create loop/two--t2 --base-branch loop/two--t1
   commit subject: "two/t2: <what landed>"
   footprint (the lease — stay inside it): src/b.js
   ```
   and the Validate spawn's brief carried `merge, in order: loop/two, loop/two--t1,
   loop/two--t2`. None carries an ordinal. Across every divided-build scenario above,
   a `(\d+/\d+)` scan of the build *prompt/brief* returned false — the prefix never
   bleeds out of the label.

## Expected observations

- A feature that builds as 2+ tasks: every build agent's label is
  `(<pos>/<N>) <feature>/<task>`, `<pos>` the task's 1-based slot in the plan's
  declared task array, `<N>` the array length; a divided task routed to an executor
  reads `(<pos>/<N>) <feature>/<task> via <executor>`.
- A single-task standard plan and a small-workflow build carry the bare
  run-presentation shape (`<feature>/<task>` / `<feature>/feature`); `(1/1)` never
  appears.
- Branch names, `--base-branch` bases, commit subjects, and Validate merge order are
  untouched by the prefix; the ordinal exists only in the display label, never in the
  task brief.

## Teardown

Headless script-drive — nothing installed, no target repo, no live agents. The
in-memory driver leaves no artifacts; the scratch probe files were session scratchpad,
not the target tree, and were removed with `rm -rf`.
