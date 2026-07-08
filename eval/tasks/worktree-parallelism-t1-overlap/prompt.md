feature: worktree-parallelism · task: overlap — relax the unordered-overlap plan-check lint
commit subject: "worktree-parallelism/overlap: drop the unordered-overlap plan-check lint"

Footprint disjointness stops being a plan-check lint law: with worktrees everywhere and
compose-and-prove at every merge point, two tasks sharing a footprint file no longer need
a declared ordering edge. A shared file is resolved at the merge point, not forbidden at
plan time.

task acceptance (each criterion gets a red-then-green test):
1. a plan whose unordered tasks share a footprint file passes plan check clean

footprint (the lease — stay inside it): src/plan.js, test/plan.test.js
wiring: the enforcement is the `unordered-overlap` error raised in validatePlan (src/plan.js) when two tasks share a footprint file with no ordering path between them — relax it so that shared footprint no longer errors.

Fetch more only if needed:
- feature design doc: docs/design/features/worktree-parallelism.md
- system design (architecture, cross-feature contracts): docs/design/design.md
