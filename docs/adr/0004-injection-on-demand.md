---
status: accepted
date: 2026-06-29
---

# ADR-0004 · Injection-on-demand: address artifacts by stable id through one resolver; logical id ⟂ physical layout

**Context.** "Earns its context" requires that agents receive only the slice of an artifact they need, never the whole document — and that this survives the Design artifact's single→split layout scaling (ADR-0003). A hard substrate constraint shapes the mechanism: a Workflow script has no filesystem access; only the interactive session and the agents a workflow spawns can read files.

**Decision.**
- **Consumers address artifacts by stable `id`, never by file path.** An agent requests "feature `auth-login` + its contracts," not "`design.md` lines N–M."
- **Exactly one layer — the session-side resolver — maps id → physical location.** It is the only thing that knows whether the design is one file or a split `design/` tree. This is the invariant: **logical address ⟂ physical layout.** The ~1k split (ADR-0003) is therefore a no-op for every consumer.
- **Work is split across the workflow edge** (forced by the no-filesystem constraint):
  1. The **interactive session** parses `design.md`, extracts the compact **feature graph index** (ids, status, `depends_on`, interface-ids, acceptance summaries — no contract bodies), and seeds the Workflow via `args`.
  2. The **workflow script** orchestrates from the in-memory index (orders by `depends_on`, hands each task agent its id-addressed slice in the prompt). It never reads files.
  3. **Task agents demand-read** their specific addressed slice (the per-id feature/contract files) for full detail — never the whole design.

**Why.** The no-filesystem constraint makes "earns its context" *structural*: the workflow can only ever hold the compact index, and detail is pulled by id at point of use. It also makes the split pay off as complexity grows — past the split an agent reads exactly `design/features/<id>.md` rather than a section of a monolith.

**Considered and rejected.** Agents resolving everything themselves with no session-side index (smaller `args`, but more agent hops and no single layout-owning layer); the workflow reading files directly (impossible — no filesystem access).

**Consequences.**
- The resolver is the single point that absorbs layout changes; keep layout knowledge out of every other component.
- The same address-by-id pattern generalizes to other artifacts (System Map nodes, etc.), not just the Design.
- `args` carries metadata only; a pathological design with enormous per-feature acceptance summaries could bloat it — revisit only if observed.
