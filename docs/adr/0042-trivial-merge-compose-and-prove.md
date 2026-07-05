---
status: accepted
date: 2026-07-05
---

# ADR-0042 · Trivial-merge relaxation: declaration-free, compose-and-prove at every merge point

**Context.** ADR-0025's overlap serialization made footprint-disjointness constructive:
unordered footprint overlap is a plan-check error, so tasks sharing a file must be
chained via `depends_on`. That rule fails routinely on hub files — barrel exports,
route registration, shared types — where many tasks each add a line or two, forcing
chains that serialize otherwise-independent work (2026-07-01 review). ADR-0038 landed
the parallel substrate but inherited the conflicts-impossible posture: both merge
points — the build agent's sibling merge and the validator's integration merge —
treat any conflict as "the plan is wrong → blocked." And cross-feature contention
(the validator's publish-rebase onto a target another feature just moved) can never
be pre-declared by a per-feature plan, so the merge machinery needs a universal rule
regardless of what planning promises.

**Decision.**

- **Delete the `unordered-overlap` plan-check error.** Footprint disjointness becomes
  the plan agent's *bias*, not law: chain tasks whose shared-file edits genuinely
  interact; registration-shaped sharing may stay unordered and run in parallel.
- **No declaration layer.** No `hubs:` list, no shared-file field. Footprints already
  carry the contention data; a declaration would be a second source of truth plus
  lint rules to police agreement, pre-classifying what the merge point discovers
  anyway — with better evidence.
- **One universal merge posture — compose-and-prove — at all three merge points**
  (sibling merge in build, integration merge in validate, publish-rebase in
  validate). The merging agent may resolve a textual conflict only when it can state
  both sides' intents and write a resolution that serves both — then must prove it:
  both branches' tests ride the merged tree, and the resolution counts only if the
  suite goes green. Can't compose it, or tests stay red → semantic conflict →
  `blocked` (kind `feature`) naming the conflicting paths. Judgment does the
  resolving; tests do the deciding.
- **The validator resolves its own conflicts** — a bounded authoring exception to
  ADR-0026's assembly-not-authoring: resolutions are small, test-proven, and still
  sit under the validator's judgment legs over the merged tree.

The trade accepted: a genuinely colliding plan is no longer caught at lint time — it
costs the build tokens before the merge point blocks it, with precise evidence
instead of a lint-time guess.

**Amends** ADR-0025 (the overlap-serialization clause), ADR-0038 ("conflict-free by
footprint disjointness"), ADR-0026 (assembly-not-authoring gains the bounded
exception above).

**Considered and rejected.** A plan-level `hubs:` declaration waiving the lint for
listed paths (a second source of truth needing its own honesty checks, and a partial
map — cross-feature contention is undeclarable); mechanical chaining of hub-sharers
by the scheduler (removes plan-author labor, not wall-clock — the serialization is
the pain); a wiring-task convention giving hubs one owning end-task (already legal
under ADR-0025 yet the pain persisted, and leaf tasks lose the ability to prove
criteria through the public interface); a `merge=union` gitattributes driver
(silently drops real conflicts and duplicates same-line adds — union gotchas observed
in the 2026-07-04 parallel-stream work); additive-only hub edit discipline (rejected
for merge-time judgment — the tests are the oracle, not the edit shape); bouncing
validator conflicts to a merge-fix build task (an extra agent per conflict, without
the validator's view of the whole merged tree); fresh-eyes revalidation of resolved
merges (doubles validation on exactly the slowest features).
