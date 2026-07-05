---
status: accepted
date: 2026-07-05
---

# ADR-0041 · Retire the System Map; brownfield comprehension is Design-phase behavior

**Context.** ADR-0005 designed the System Map as the as-built twin of the design — a
fingerprinted per-module comprehension cache plus a `realizes` drift cross-walk — and
ADR-0023 pulled it and `brownfield-comprehension` into the walking skeleton, arguing
the engine could not self-host without them. Neither survived contact: the taming
reset's artifact set (ADR-0037) never listed the map, no surface, role card, or CLI
command consumes it, and the loop has been self-hosting — brownfield-shaped intakes
against its own existing repo — since 2026-07-03, mapless.

**Decision.** Cut both features from the graph (design_version 9). No map artifact, no
seeding feature. Brownfield comprehension is behavior of the Design phase: when
designing against a repo with existing code, the design artifacts themselves are the
comprehension cache — design.md's architecture narrative describes the as-built
system, and feature docs quote real interfaces from the source. The design skill
carries this instruction. The map returns as a feature only when a real adopter with a
repo large enough to make repeated re-discovery expensive shows up — the same
retirement pattern ADR-0037 applied to the port inventory.

**Why.** ADR-0023's load-bearing prediction failed empirically: self-hosting worked
without the map. The maintenance tax — per-task node updates, a merge-conflict hub
file across parallel worktrees, role-card obligations, a staleness checker — is paid
on every build, while the benefit accrues only on large repos with repeated re-visits,
of which none exist. Just-in-time discovery over a small, well-factored repo is the
platform's native mode. And the drift half had no consumer anywhere in v2.

**Supersedes** ADR-0005 and ADR-0023.

**Considered and rejected.** A shrunk map (comprehension cache only: seeded nodes,
builders update-never-create) — still a parallel twin of the design artifacts,
carrying its own schema, CLI addressing, staleness machinery, and a standing tax. A
reshaped `brownfield-comprehension` feature ("design artifacts grounded in real code")
— fails the slice test: it is skill behavior exercised in a human-gated interactive
phase, with no observable, binary acceptance criterion that isn't theater.
