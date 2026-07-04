---
status: accepted
date: 2026-07-04
---

# ADR-0038 · Execution substrate: worktrees everywhere, ready-set scheduling, three lanes

**Context.** Everything ran serially (tasks in a for-loop, features in a for-loop —
146 minutes for one 15-agent run) despite plans mandating file-disjoint footprints
precisely to enable parallelism. Agents time-shared the main checkout, which is what
created the dirty-tree pathology: clean-tree gates copy-pasted across six surfaces and
563 `git status` calls in four days. Every feature paid the identical eight-agent
pipeline regardless of size — a 97-insertion rename cost the same shape as the largest
feature in the repo.

**Decision.**

- **Worktrees everywhere; the main checkout is the human's and is never touched.**
  Feature worktrees branch from the integration target; task worktrees branch from the
  feature branch; merges happen serially in a dedicated integration worktree (a natural
  mutex, refs-only for everyone else). Worktree lifecycle (create/setup/prune) is owned
  by tooling, never by agent prose. The dirty-tree gate taxonomy retires with the
  sharing that caused it.
- **Ready-set scheduling.** The workflow walks the scoped subgraph: launch every
  feature whose `depends_on` are satisfied; as each validates and merges, launch the
  newly ready. Hard dependencies never run concurrently by construction. A soft
  coupling ("B designs better knowing A's final shape") is recorded as an ordinary
  dependency edge at Design or at the scope handshake — one edge type, two reasons to
  draw it. Task-level concurrency within a feature runs where the plan marks a group
  parallel-safe, each task in its own worktree, folding one commit back (conflict-free
  by footprint disjointness); unmarked stays serial.
- **Three lanes, chosen at existing judgment points.** *Small*: the plan agent may
  return "single task = the feature" and write no plan artifact — pipeline is one build
  agent + one validate. *Standard*: real decomposition, parallel builds, one validate.
  *Bypass*: trivial maintenance never enters the loop — the human or session just
  commits it (this legitimizes and replaces the hand-building-as-recorded-escalation
  policy). Validation depth rides the same dial (ADR-0035).

**Supersedes** ADR-0011 (the sizing gate becomes the lane decision). **Amends**
ADR-0012 (worktrees go from coordination option to universal substrate), ADR-0026
(branch strategy unchanged; checkout discipline replaced), ADR-0029 (serial drain
replaced by ready-set scheduling).
