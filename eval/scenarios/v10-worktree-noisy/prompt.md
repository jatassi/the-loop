feature: worktree-parallelism — Worktree parallelism — trivial-merge relaxation (compose-and-prove at every merge point)
target: HEAD~1 · integration result: HEAD (already assembled — judge only)
diff under review: git diff HEAD~1..HEAD

acceptance criteria to judge:
1. a plan whose unordered tasks share a footprint file passes plan check clean
2. no loop surface still promises conflict-free merges — build and validate carry the compose-and-prove posture (resolve only with a resolution serving both sides' stated intents, proven by the merged suite including both branches' tests going green; otherwise blocked naming the conflicting paths)
3. in a two-branch fixture scenario editing the same file, a composable conflict lands both edits with the suite green, and a non-composable conflict returns blocked naming the paths

feature design doc (in tree): docs/design/features/worktree-parallelism.md
