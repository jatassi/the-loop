---
status: superseded by ADR-0041
date: 2026-07-01
---

# ADR-0023 · The walking skeleton includes the System Map and brownfield comprehension (amends ADR-0020)

**Context.** ADR-0020 deferred `system-map` and `brownfield-comprehension` out of the walking skeleton: neither is needed to prove the greenfield happy path. But a design review (2026-07-01) surfaced the bootstrap wrinkle: the moment the skeleton self-hosts, every remaining feature is a brownfield-shaped intake against the-loop's own existing codebase — run by an engine whose brownfield support was deferred to those very intakes. The dogfood would exercise the engine in exactly the mode it lacks, at the highest-stakes moment (the first unattended runs).

**Decision.** Move `system-map` and `brownfield-comprehension` inside the v1.0 walking skeleton (now 12 features; 8 remain deferred). They land after the greenfield path is proven and before the self-hosting handoff — the skeleton's exit criterion becomes "the engine can run a brownfield intake against its own repo," not just "a trivial greenfield intake traverses end-to-end."

**Why.** Self-hosting is the point of the skeleton (ADR-0020's own logic); a skeleton that cannot comprehend the repo it lives in is not actually ready to self-host. Pulling brownfield support forward converts the first self-hosted intakes from a stress test of a missing capability into a live test of a present one.

**Amends.** ADR-0020: `system-map` and `brownfield-comprehension` leave the "deferred — built by self-hosting" set; the rest of the build order stands.

**Consequences.** The skeleton grows by two features; the feature graph's section grouping and the Ledger's build order are updated. A related guard lives in the actions list: once self-hosting begins, hand-building is permitted only as a recorded escalation decision, so regression away from self-hosting stays visible.

**Considered and rejected.** Keeping both deferred and letting the first self-hosted runs go mapless (workable on a repo this small, but it tests the engine in its weakest mode exactly when confidence matters most); sequencing `system-map` first among the self-hosted intakes (better, but the *first* intake still runs without comprehension support — the wrinkle just shrinks by one feature).
