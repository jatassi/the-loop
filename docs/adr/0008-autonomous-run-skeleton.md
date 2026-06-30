---
status: accepted
date: 2026-06-29
---

# ADR-0008 · Autonomous run skeleton: sequential features, parallel tasks, park-and-drain

**Context.** ADR-0001 fixed the inner loop as a Workflow; we needed the control-flow shape of one run — how features and tasks are ordered and how deviations are handled mid-run.

**Decision.** One run iterates the [[feature graph]] in dependency order and, per feature, runs Plan → Build → Validate, returning a `BoundaryResult` at the [[run boundary]]:
- **Features are processed sequentially; tasks run in parallel within a feature** ("sequence the slices, parallelize within").
- **Plan** decomposes the feature ([[sizing gate]]; an overflow that won't decompose parks the feature as a re-slice signal).
- **Build** executes the feature's tasks concurrently (coordination mechanism — branch 3).
- **Validate** runs the [[independent validator]] against contract + acceptance; perfect → `validated` (onto the [[shippable frontier]]), otherwise **[[park-and-drain]]**: park the feature with its deviation + recommendation menu, skip its dependents this run, continue with other dependency-ready features.
- The **[[circuit breaker]]** is checked each iteration (global backstop).
- The run returns a **`BoundaryResult`**: completed slices, parked escalations (each with a recommendation menu), and breaker status.

**Why sequential features — by design, not as a simplification.**
- **Trustworthy runtime Validate requires a stable tree.** Validate's runtime-observation leg observes a coherent working tree; concurrent feature builds keep the tree perpetually mid-mutation, undermining it.
- **Collision safety.** Plan *constructs* task independence within a feature, so those tasks parallelize safely; cross-feature independence is constructed by nothing, so concurrent features risk colliding on shared code.
- **Predictability.** A sequential feature loop is far easier to reason about, resume, and validate — the same predictability-over-improvisation logic as ADR-0001.
- **Marginal upside anyway.** Within-feature parallelism already extracts the safe concurrency; dependent features can't run concurrently regardless; the breaker bounds wall-time. Concurrent features would buy little for real coordination cost.

**Considered and rejected.** Concurrent independent features (throughput at the cost of tree coherence, collision risk, and resumability complexity); halting the whole run on the first park (simpler, but wastes the independent frontier the run could still drain).

**Note.** "Parallel execution coordination" (§8) is now narrowed to *within-feature task* parallelism (branch 3, Build) — it no longer has to solve cross-feature concurrency.
