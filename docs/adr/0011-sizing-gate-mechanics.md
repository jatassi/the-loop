---
status: superseded by ADR-0038
date: 2026-06-29
---

# ADR-0011 · Sizing-gate mechanics: over-decompose until comfortably-small, soft proxy estimation

**Context.** The [[sizing gate]] (§5) requires every task fit ≤50% of a 256k window, but a task's context cost can't be measured before it runs. We needed a concrete check.

**Decision.** The gate does not precisely estimate; it **biases hard to over-decompose until each task is *comfortably* small**, which converts precise estimation into a loose threshold check.
- The **Plan agent proposes a decomposition + a per-task size estimate** from observable proxies: **files / read-size** (the injected slice + code the task touches), **number of interface contracts** involved (coupling), and **expected diff size** (write cost); reasoning complexity is the agent's judgment on top.
- **The gate verifies each task is comfortably under budget.** Unclear or over → split again. **Irreducible** (a task that genuinely can't drop below budget) → **bounce up to re-slice the [[feature]]** — a design signal, not a planning retry.
- **Calibration sharpens the proxies over time** ([[Calibration Memory]], per-project): actual-vs-estimated cost recalibrates the heuristics to the codebase. v1 runs on heuristics + agent estimate + the over-decompose bias.

**Why.** A priori context estimation is inherently soft, but over-decomposition makes "soft" safe: the bias-to-split means a wrong-but-conservative estimate yields slightly-too-small tasks (cheap) rather than too-big ones (the actual failure mode). The asymmetry runs in our favor, so a precise estimator isn't worth building.

**Considered and rejected.** A precise context estimator (high effort for a number the over-decompose bias makes unnecessary); estimating from a single proxy like LOC (misses coupling and read-cost, the larger drivers).
