---
status: accepted
date: 2026-06-29
---

# ADR-0017 · Greenfield onboarding is the cold-start branch of /the-loop

**Context.** Several setup nudges were accumulating — port/adapter bindings (ADR-0016), the runtime probe (ADR-0013), the observability solution (ADR-0015), parameter defaults. They needed to cohere into one guided new-project experience rather than fire ad hoc across the lifecycle.

**Decision.** Greenfield onboarding is **the cold-start branch of `/the-loop`**, not a separate command. `/the-loop` already reads the Ledger to decide what to do (ADR-0002); on a project with **no config and no Ledger** there is nothing to resume, so it routes into guided onboarding. Onboarding sequences three steps, all in [[recommended-answer style]] (smart default per choice, confirm-or-override):
1. **Configure** (the [[configure step]]'s project-setup scope) — bind ports/adapters (task tracker, deploy target, VCS, observability backend, notification, research, artifact store) and set parameter defaults (sizing budget, design-split threshold, System Map granularity, ship cadence, dictionary/ADR strictness). **Stable preferences.**
2. **Frame → Design** — the normal engine entry, carrying the *project-judgment* nudges: the [[runtime probe]], the observability solution, and which lifecycle concerns the project instantiates.

The split follows the §6 boundary exactly: **stable bindings at Configure, project-understanding-dependent shaping at Design.**

**Why.** Reusing the stateful entry's cold-start branch means no new front door and no duplicated "where am I" logic — onboarding is just what `/the-loop` does when it meets an unconfigured project. Recommended-answer grilling makes it guided without being heavy. Placing each nudge in the correct step keeps the config/Design boundary clean and stops setup concerns from scattering.

**Consequences.** `/loop-config` is both re-invokable out-of-band (tweak a binding anytime) and the first leg of onboarding. The runtime-probe and observability nudges (ADR-0013, ADR-0015) are now homed concretely in onboarding's Design step.

**Considered and rejected.** A separate `/loop-init` command (duplicates the stateful entry's cold-start detection; another verb to learn); putting the project-judgment nudges into Configure (they depend on understanding the project — they belong at Design, per the §6 boundary).
