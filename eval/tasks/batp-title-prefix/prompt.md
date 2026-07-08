feature: build-agent-title-progress · task: feature — task-position prefix on divided-feature build agent titles
commit subject: "build-agent-title-progress/feature: task-position prefix on divided-feature build labels"

task acceptance (each criterion gets a red-then-green test):
1. given a feature built as 2+ tasks, each build agent's spawn label is `(<pos>/<N>) <feature>/<task>` — <pos> the task's 1-based position in the plan's task array, <N> the total — so the 2nd of 3 tasks reads `(2/3) <feature>/<task>`
2. given a task in a 2+-task feature that routes to a registered executor, its drive spawn label is `(<pos>/<N>) <feature>/<task> via <executor>`
3. given a feature built via the small workflow path, or a standard plan with exactly one task, the build spawn label carries no prefix (the bare `<feature>/feature` / `<feature>/<task>`) — `(1/1)` never appears
4. given any of the above, branch names, commit subjects, and merge order are byte-identical to before the prefix — the prefix lives only in the display label

footprint (the lease — stay inside it): workflows/execution-pipeline.js, test/execution-pipeline-blocked.test.js, test/execution-pipeline-drive.test.js, test/execution-pipeline-happy.test.js
wiring: the ordinal is derived in the build scheduler from each task's slot in the plan's task array, and prepended only to the build and drive spawn labels — not to branch names, commit subjects, or merge order.

Fetch more only if needed:
- feature design doc: docs/designs/build-agent-title-progress/design.md
- system design (architecture, cross-feature contracts): docs/architecture.md
