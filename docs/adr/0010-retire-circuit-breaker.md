---
status: accepted
date: 2026-06-29
---

# ADR-0010 · Retire the circuit breaker as a subsystem; rely on structural bounds + an optional ad-hoc cost cap

**Context.** Decisions §2 specified a two-scope circuit breaker (global $/time/feature-count + per-task convergence) as the secondary backstop for unattended autonomy. Operationalizing it revealed it to be mostly redundant with mechanisms already decided, and the one residual axis — a cost ceiling — has no formula the loop can compute well.

**Decision.** Retire the circuit breaker as a loop-managed subsystem. An [[autonomous run]] is bounded by:
- **[[scope envelope]]** — what the run is allowed to attempt (primary).
- **[[park-and-drain]] frontier-exhaustion** — a run ends when the dependency-ready frontier is empty; it structurally cannot run forever.
- **[[sizing gate]]** — ≤50%-of-256k tasks can't thrash expensively (this already subsumes the per-task convergence breaker).
- **The harness's hard 1000-agent cap** — the pathological worst-case backstop, free and built into the substrate.

A **tighter cost cap is opt-in and ad hoc**: the human passes a budget at launch (the native `+budget`-style directive) when they want one for a particular unattended run. The loop never auto-calculates a ceiling — a meaningful number depends on the human's risk tolerance for that run, which only they know.

**Why.** Auto-calculating a ceiling is a trap (too low kills runs mid-feature and wastes work; too high is theater). "No ceiling" is not "unbounded" — for a run to approach the 1000-agent cap it must keep *succeeding* (legitimately building what you scoped), while genuine thrash is caught earlier by sizing + the agent's self-governed iteration budget + bounded retries. The structural bounds are the real safety; the cost cap was always a knob bolted on top. Dropping the subsystem honors "earns its context."

**Supersedes.** The two-scope circuit breaker of decisions §2, and the wall-time / feature-count / per-task-convergence machinery sketched while answering it.

**Considered and rejected.** A loop-calculated ceiling from scope × calibration × margin (real machinery and friction for a number the human is better placed to set); keeping the per-task convergence breaker (redundant with sizing); going to literal zero with no opt-in cap at all (the native directive is free to leave available, so no reason to forbid it).
