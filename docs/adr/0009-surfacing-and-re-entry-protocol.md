---
status: accepted
date: 2026-06-29
---

# ADR-0009 · Surfacing + re-entry protocol: the feature graph is the state machine, runs are stateless passes

**Context.** ADR-0008 fixed what one run does and that it returns a `BoundaryResult`. We needed the protocol *around* the run: how results surface to the human, how decisions fold back, how the next run continues, and how all this survives a crash (resumability, §8).

**Decision — spine.** The **feature graph is the durable state machine; every [[autonomous run]] is a stateless pass over it.** A run holds no durable state of its own; it reads the graph, does the dependency-ready work, commits what it learned, and returns.

**Lifecycle.**
1. **Return** — workflow completes → task-notification → the session wakes with the `BoundaryResult`.
2. **Persist** — the session writes results into the durable artifacts: validated slices → `status: validated` (+ System Map nodes + fingerprints), parked slices → `status: parked`; re-render the Ledger.
3. **Surface** — present parked escalations with recommendation menus (+ completed slices, breaker status); push if away.
4. **Decide** — the human picks per escalation (the Adjust decision).
5. **Fold back** — apply each decision to the graph (amend-design → edit `design.md` + ADR + drift-stamp; fix-in-place → queue a fix; …).
6. **Next run** — `/the-loop` invokes a **fresh** run over the updated graph; a stateless pass naturally continues the drain (not a replay).

**Resumability (§8).** "Resume" = re-run over the graph. **Workflow `runId`/`resume` is reserved for crash-recovery of a single *interrupted* run** (replay cached agent results), never the between-runs mechanism. The **resumable unit is the [[feature]]**: a crash costs at most the one in-flight feature, re-derived from the last clean commit. (Finer per-task commit granularity is a Build detail, branch 3.)

**Escalation records are ephemeral.** A parked feature's verbose detail lives in `escalations/<feature-id>.md` while *open* (surviving across sessions so `/the-loop` can re-surface it) and is **deleted on resolution**. Git history is the archive — deletion keeps the working tree lean without losing recoverability. No mandatory calibration distillation (consistent with v1 capture-by-hand, ADR-0007); the [[orchestrator]] **may**, at its discretion, note a resolution heuristic into per-project [[Calibration Memory]].

**Why.** Putting durable state in git-versioned files (not in the workflow) makes surfacing, re-entry, and crash-recovery the *same* mechanism — a fresh stateless pass over the graph — instead of three bespoke ones. Ephemeral escalation records keep the working tree honest: the graph holds live status, calibration holds distilled signal, git holds history; nothing is hoarded.

**Considered and rejected.** Stateful runs that resume via workflow internals between human decisions (the graph changed under them — you want a fresh pass, not a replay); persistent escalation archives (clutter; git already archives).
