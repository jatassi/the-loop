# ports-adapters-full — swapping + capability-contract enforcement

**Status:** designed; **deliberately parked behind a second adopter** (ADR-0037).

v1 maintained a typed port inventory (`docs/ports/ports.md`, ADR-0016/0024:
capability contracts, guarantee flags, tiered required/optional). The v2 taming
retired the inventory — the abstraction's carrying cost wasn't earning its keep for
a single user — collapsing the live bindings into `design.md`'s recorded sections
(runtime probe, ship recipe) and the model-binding table. The git history holds the
full inventory (last at commit `a18fc70^`) if this feature nears the frontier.

## Acceptance

- An adapter swap is one config line; the configure step validates the contract and
  surfaces guarantee trades.
