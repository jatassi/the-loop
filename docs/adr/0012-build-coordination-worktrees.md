---
status: accepted
date: 2026-06-29
---

# ADR-0012 · Build coordination: per-task worktree isolation, agent-performed sequential merge

**Context.** Within a feature, Plan exposes a parallelizable frontier of independent tasks; Build runs them concurrently. Concurrent agents mutating one working tree collide — silent file corruption, plus spurious test failures from a sibling's half-written state. This is the last §8 "parallel execution coordination" item, now narrowed to within-feature tasks (ADR-0008).

**Decision.**
- **Each concurrent task runs in its own git worktree** (the Workflow's native `isolation: 'worktree'`).
- **Plan guarantees file-disjointness** of parallelized tasks — that *is* the meaning of "independent" in the [[parallelizable frontier]] — so worktree branches **merge back conflict-free** in the normal case.
- **Build tasks produce diffs only; they do not run full-tree tests.** Testing and runtime observation belong to [[Validate]], on the merged stable tree, via the [[independent validator]]. Isolation + deferred testing means no task ever sees a sibling's half-written state.
- **A merge conflict is a surfaced [[deviation]]** (Plan mis-partitioned → re-plan signal), never silent corruption — isolation converts imperfect disjointness into a loud, safe signal (the perfection-bar posture).
- **Merge-back folds into [[Validate]]'s setup step** — no dedicated merge agent. The validator agent (spawned regardless, and needing the merged tree anyway) sequentially `git merge`s the feature's task branches as its first action, then runs its legs. Sequencing is inherent (one agent merges in order, so merges never race); a conflict is just another [[deviation]] it surfaces. Merging disjoint, already-authored branches is *assembly, not authoring*, so the validator's independence holds.

**The workflow-script constraint (why merge is an agent's job).** A Workflow script is a *pure-orchestration sandbox*: no filesystem, no shell, no git, no network — its only lever is spawning agents. This is deliberate: a side-effect-free script is what makes runs deterministic and resumable (replaying the pure script + cached agent results is safe; a script that ran `git merge` would re-apply it on resume and corrupt state). So **every repo-touching action is performed by an agent** (which has Bash/git/Read/Write), with the script as the brain that decides *what* and *in what order*. The merge is one instance of the same script=brain / agents=hands split the loop already relies on for [[injection-on-demand]] (agents read files) and the [[Project Ledger]] (agents write it).

**Why worktrees over shared-tree-with-ownership.** Shared-tree is overhead-free but fails *silently* on imperfect disjointness; worktrees fail *loudly and safely* (an explicit merge conflict). At task granularity the ~200–500ms worktree setup is noise, and sequential features bound concurrency to one feature's tasks — no worktree explosion.

**Considered and rejected.** Shared-tree with Plan-assigned file ownership (silent corruption on imperfect disjointness; mid-flight test interference); self-merging build agents (concurrent merges race); a dedicated merge agent per branch (wasteful — integration folds into the validator, which needs the merged tree anyway); running task-level tests inside Build (duplicates Validate and breaks isolation).
