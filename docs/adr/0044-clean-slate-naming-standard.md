---
status: accepted
date: 2026-07-05
---

# ADR-0044 · Clean-slate naming standard: the blind-outsider bar below a brand tier

**Context.** Dogfooding surfaced the cost of coined vocabulary: every loop response
speaks in terms only the designer can decode (`spine`, `BoundaryResult`, `inner
loop`), because names accreted one decision at a time with no family logic and no
bar beyond ADR-0037's ratchet — which governed only dictionary entries, left an
escape hatch for documented made-up terms, and never reached files, CLI verbs,
statuses, or identifiers. The pressure that produced the jargon (agents coining
terms under deadline) is constant, so a one-time cleanup without a rule regrows it.

**Decision.** Every name below the brand tier must pass the **outsider bar**: an
engineer who has never seen the-loop, shown the name plus only its grammatical role
(a CLI subcommand, a status value, a file path), correctly infers what the named
thing is for. The standard's clauses:

- **Brand tier.** `the-loop` is the one allowed non-descriptive name. Nothing
  beneath it may lean on metaphor or brand.
- **Composed from standard vocabulary.** Prefer the standard industry term; when
  none exists, compose a self-explanatory name from standard words. **Coined proper
  nouns are banned** — ADR-0037's documented-exception escape hatch is closed.
- **Name blind.** Candidates are generated from a jargon-free purpose line plus the
  family's sibling names — never by mutating an existing name, which anchors.
- **Plain speech.** Loop-authored surfaces (skills, prompts, CLI and ledger output)
  phrase things in plain SDLC English; a compliant noun doesn't license dense prose.
- **History stays honest.** Records (ADRs, ship records, RCAs, research, the
  founding design docs) are never rewritten; every renamed term keeps its old name
  as a `(historical)` dictionary alias, so old records resolve in one lookup.

The standard applies **clean-slate**: every existing name below the brand tier is
re-derived as part of coherent families (verb sets, artifact patterns, status
progressions) regardless of current quality — no grandfathering; churn is accepted
as the cost of system-level coherence. The human holds per-name final approval.

**Consequences.** The standard's canonical text replaces the dictionary's rules
section (the sharpened ratchet); the craft baseline gains one distilled
identifier-naming rule. Application is the feature pair `naming-map` (inventory →
blind candidates → human-approved map at `docs/design/naming-map.md`) →
`rename-sweep` (mechanical atomic application; old terms grep to zero on living
surfaces). The sweep runs under the conventions it was launched with — new
conventions govern the next run — and paired data+code renames (status enum, branch
prefix, commit-subject shape) land in one proven commit. **Amends** ADR-0037 (the
ratchet loses its escape hatch and now governs every name, not just dictionary
entries).
