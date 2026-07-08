feature: run-presentation · task: labels — prefix-free spawn labels
commit subject: "run-presentation/labels: prefix-free spawn labels"

task acceptance (each criterion gets a red-then-green test):
1. no spawn label in the workflow carries a phase or agentType prefix — plan and validate labels are the bare feature id, build labels are <feature>/<task>, drive labels are <feature>/<task> via <executor>

footprint (the lease — stay inside it): workflows/execution-pipeline.js, test/execution-pipeline-happy.test.js, test/execution-pipeline-drive.test.js, test/execution-pipeline-harness.js
wiring: the spawn labels are assembled in workflows/execution-pipeline.js. Dropping the agentType prefix means a bare label alone no longer tells plan from validate on the same feature, so the harness's byLabel reply router (test/execution-pipeline-harness.js) must key replies by agent type + label rather than by label alone.

Fetch more only if needed:
- feature design doc: docs/designs/run-presentation/design.md
- system design (architecture, cross-feature contracts): docs/architecture.md
