---
status: accepted
date: 2026-07-01
---

# ADR-0022 · Retire the Dictionary category taxonomy; the Dictionary is a flat glossary

**Context.** DICTIONARY.md schema v1 carried a closed-but-governed nine-category taxonomy: two planes, an ordered nine-question decision tree, a tie-breaker rule, and ADR-gated amendment. A design review (2026-07-01) asked the load-bearing question: what consumes the category? Nothing does. Injection-on-demand resolves entries by term; Validate's checks are canonical-term consistency and new-term collision — neither reads `category`. The taxonomy was classification labor per term and governance overhead per edge case (ADR-0015 spent a consequence reclassifying Operate) purchasing metadata no mechanism uses.

**Decision.** Retire the taxonomy (schema v2). An entry is: canonical term + `aliases` + `status` + prose definition (+ optional *not-to-be-confused-with* and provenance). Everything load-bearing stays: name-pinning, use-canonical-terms-verbatim, register-every-new-term, collision-as-surfaced-deviation, injection-on-demand, deprecation tombstones, and the Doctrine-is-out-of-scope boundary. The section headings remain as informal wayfinding with no governance attached — a new entry goes wherever it reads best.

**Why.** "Earns its context" applies to the loop's own artifacts first. The Dictionary's spine is the pinned name and the collision check; the taxonomy was decoration on that spine — maintained, governed, and consulted by no mechanism. Killing it removes per-term labor and a whole class of category-boundary deliberation without weakening any check the system actually runs.

**Supersedes.** The nine-category taxonomy machinery of decisions §3 and the DICTIONARY.md v1 header (taxonomy table, decision tree, tie-breaker, closed-but-governed amendment rule). ADR-0015's Dictionary-reclassification consequence is moot.

**Considered and rejected.** Keeping categories as optional, ungoverned metadata (still invites classification labor and boundary debates for zero mechanical payoff); building a consumer to justify the taxonomy, e.g. category-aware validation (inventing a requirement to save a mechanism — backwards); alphabetizing the whole file (churn without payoff — lookup happens by search and injection, and thematic grouping reads better).
