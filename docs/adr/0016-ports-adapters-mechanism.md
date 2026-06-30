---
status: accepted
date: 2026-06-29
---

# ADR-0016 · Ports/adapters mechanism: native-primitive adapters, config-layer binding, configure-time contract enforcement

**Context.** The-loop owns the workflow + a typed inventory of [[port]]s; it ships default adapters and lets users swap per port (§1). We needed the concrete mechanism: what an [[adapter]] *is*, how it's bound, and how the [[capability contract]] is enforced.

**Decision.**
- **An adapter is realized as a native primitive** — a skill (phase components, security review), a subagent (e.g., a custom validator), an MCP server (task tracker, observability backend), or a configured command/script (runtime probe, deploy target). The port abstracts over which.
- **Binding is a per-port declaration in the loop's project config**, layered through harness-native config (settings.json hierarchy / CLAUDE.md / skill resolution) — no parallel config system (§6). Default adapters ship with the plugin; the config overrides per-port. A swap is one line; the engine never changes.
- **Capability contracts are enforced at the [[configure step]]**, not at runtime: when an adapter is bound, the configure step validates it satisfies the port's required operations and **surfaces [[guarantee flag]] trades explicitly** (e.g., swapping the artifact store from in-repo-markdown to Linear forfeits git-versioned resume — stated, never silent). At use time a missing capability fails as a *surfaced [[deviation]]*, not a silent skip.

**Why.** Riding harness-native config keeps the default/override model free (no second config system to build or learn). Realizing adapters as the native primitive types means the plugin distribution mechanism already carries them. Enforcing at configure-time (with graceful runtime failure) catches bad swaps when the human is present to fix them, rather than mid-autonomous-run.

**Considered and rejected.** A bespoke adapter-registry/config system (reinvents harness config layering); hard runtime capability checks before every use (cost and ceremony for a condition the configure step already caught; graceful runtime failure covers the residue).
