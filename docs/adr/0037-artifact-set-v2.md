---
status: accepted
date: 2026-07-04
---

# ADR-0037 · Artifact set v2

**Context.** The artifact spine had accreted derived, duplicated, and dead weight: a
59KB monolithic design.md read whole 29 times in four days; 42–59KB plan essays mutated
by report fold-ins; a Ledger re-rendered and committed at every status flip while the
front door instructed agents to distrust it; filed validation verdicts and escalation
records duplicating their own return JSON; a 17KB port/adapter abstraction with no
second adopter.

**Decision.** Per artifact:

- **Design splits like plans**: `design.md` stays as the *system-level* narrative
  (architecture, boundaries, cross-feature interface contracts); each feature gets its
  own design doc (the per-feature doc *is* the slice); the machine feature-graph is its
  own small file. Feature design docs persist — they are the living contract.
- **Plans are ephemeral**: contract list + short per-task wiring notes, no report
  fold-ins (git is the record), **deleted when the feature validates** (git history
  archives them).
- **The Ledger is never committed**: `spine ledger` renders the status story on demand
  from the graph.
- **Probe packs survive** — written once at merge, replayed only at ship; they are the
  ship regression menu and the seed of Operate.
- **Deleted**: `docs/validations/`, `docs/escalations/` (ADR-0034/0035),
  `docs/standards/` (folded into role cards + linter), `ports.md` as an abstraction
  (collapses to a small config of the 2–3 bindings actually in use).
- **The Dictionary survives with a ratchet**: one pass replaces invented terms with
  standard industry vocabulary wherever an equivalent exists, and no new entry may be
  added without first asking "does a standard industry term already name this?"
- ADRs, brief, research, actions, `config/model-bindings.json`: unchanged.

**Amends** ADR-0003 (design representation), ADR-0006 (ledger stays a derived
projection — now uncommitted), ADR-0016/ADR-0024 (ports collapse to config until a
second adopter exists), ADR-0021 (validations/escalations directories retire).
