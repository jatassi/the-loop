---
status: accepted
date: 2026-06-29
---

# ADR-0003 · Design artifact representation, with a layout that scales single → split by size

**Context.** Decisions §3 fixed the Design artifact's *format* (hybrid: Markdown narrative + structured blocks for the machine-parseable fields). We needed the concrete representation of the feature graph and a layout that serves both focused projects and complex ones without forcing ceremony on the simple case.

**Decision.**
- The Design artifact is a living **`design.md`** in the [[target repo]]: narrative prose for the human-judgment parts (architecture, data model, boundaries, tech posture), embedded structured blocks for the machine-parseable parts.
- It contains a **feature graph**: a DAG of feature nodes, each with `id`, `title`, `status` (designed · planned · building · validated · shipped · parked · drifted), `depends_on` (feature ids = edges), `interfaces` (interface-contract ids it owns/touches), `acceptance` (feature-level), and `design_version` (the drift stamp). Plus the interface contracts themselves.
- **Stable IDs are the addressable handle.** Every feature and interface contract has a stable `id`; downstream phases reference slices by id (the basis for injection-on-demand and per-contract drift tracking — injection mechanism decided separately).
- **Layout scales with complexity.** Default is a single `design.md`. **Once it exceeds ~1,000 lines (a configurable default), split** into a `design/` layout (feature graph and/or per-feature files broken out). The threshold is guidance, not a gate.

**Why.** Single-file is the lowest-ceremony default for focused projects ("earns its context"); the split keeps complex projects navigable without imposing structure on simple ones. Stable IDs decouple *logical* reference from *physical* layout, so the split is a mechanical reorg rather than a breaking change.

**Considered and rejected.** Splitting into multiple files from the start (premature ceremony for focused projects); a single file with no split guidance (a complex project's `design.md` becomes an unnavigable monolith and blows the injection budget).

**Consequences.**
- Whether independent features run concurrently or strictly-sequenced is left open (a control-flow choice); the DAG supports either.
- The split's transparency depends on the injection layer addressing by id, not path — decided next.
