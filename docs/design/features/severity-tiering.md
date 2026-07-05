# severity-tiering — the sev-1 hotfix express lane

**Status:** designed. Renamed from `evolve-severity-tiering` 2026-07-05 with the
evolve → diagnose rename (ADR-0043).

A sev-1 production intake takes an expedited, still-gated path through the diagnose
door — faster than the standard bug intake without shedding the human gate on the
fix design or the deploy. Aligns naturally with the lane model: the express lane is
a rigor dial on the diagnose flow, not a separate engine.

## Acceptance

- A sev-1 intake takes an expedited, still-gated path.
