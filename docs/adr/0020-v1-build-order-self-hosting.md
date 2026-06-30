---
status: accepted
date: 2026-06-29
---

# ADR-0020 · v1 build order: thinnest end-to-end engine first, then self-host

**Context.** The full engine is designed (ADR-0001–0019). The remaining Design output is the feature breakdown + ordering — for the-loop itself.

**Decision.** Build order follows one principle: **the thinnest end-to-end greenfield engine first, then let the-loop build the rest of the-loop.** Once a trivial intake can traverse Frame → Design → inner-loop → Ship, hand-building stops and the-loop's remaining features are fed through the-loop as intakes.

**Walking skeleton (v1.0) — the minimal self-hosting core:**
- `/the-loop` entry + minimal cold-start onboarding
- Frame (grilling → Brief); Design (→ `design.md` + feature graph + Ledger + Dictionary seed)
- The inner-loop Workflow: Plan (sizing gate) → Build → Validate (independent validator)
- Surfacing / re-entry (run boundary → fold-back; park-and-drain)
- Ship (human-gated, minimal evidence package)
- The artifact spine + injection underneath

**Deferred — built *by* self-hosting:** brownfield comprehension + System Map seeding; Operate; Evolve; calibration capture; full ports/adapter swapping (skeleton runs on baked-in defaults); research tiers (skeleton uses inline search); the full configure step; optionally worktree parallelism (skeleton may build tasks sequentially first, earning parallelism as feature #1).

**Ordering:** artifact spine → minimal inner-loop Workflow → minimal Frame/Design → reach self-hosting → feed it everything else.

**Why.** Reaching self-hosting earliest is the fastest path to improving the-loop, and makes every deferred feature a live test of the engine that builds it. Deferring everything non-essential to end-to-end keeps the skeleton genuinely thin.

**Considered and rejected.** Building the full engine before any dogfooding (slower feedback; no self-test); including brownfield / Operate / Evolve in the skeleton (not needed to prove the greenfield happy path end-to-end).
