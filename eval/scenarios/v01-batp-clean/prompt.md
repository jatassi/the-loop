feature: build-agent-title-progress — Task-position prefix on divided-feature build agent titles
target: HEAD~1 · integration result: HEAD (already assembled — judge only)
diff under review: git diff HEAD~1..HEAD

acceptance criteria to judge:
1. given a feature built as 2+ tasks, each build agent's spawn label is `(<pos>/<N>) <feature>/<task>` — <pos> the task's 1-based position in the plan's task array, <N> the total — so the 2nd of 3 tasks reads `(2/3) <feature>/<task>`
2. given a task in a 2+-task feature that routes to a registered executor, its drive spawn label is `(<pos>/<N>) <feature>/<task> via <executor>`
3. given a feature built via the small workflow path, or a standard plan with exactly one task, the build spawn label carries no prefix (the bare `<feature>/feature` / `<feature>/<task>`) — `(1/1)` never appears
4. given any of the above, branch names, commit subjects, and merge order are byte-identical to before the prefix — the prefix lives only in the display label

feature design doc (in tree): docs/designs/build-agent-title-progress/design.md
