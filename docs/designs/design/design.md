# design — Design skill (brief → system architecture doc + feature graph + per-feature docs)

**Status:** designed (functional since v1, hand-built; artifact set reshaped by
ADR-0037 — the skill was rewritten for v2 and has not been loop-validated).

## What it is

The last human-gated phase before autonomous execution. Turns the brief into the
three v2 design artifacts (skills/design/SKILL.md):

1. `docs/architecture.md` — system narrative + the two recorded bindings
   (`## Validation runbook`, `## Release runbook`).
2. `docs/feature-graph.md` — the machine feature graph (three durable statuses).
3. `docs/designs/<id>/design.md` — one self-contained doc per feature; this IS the
   context slice a stateless plan/build/validate agent receives.

Features are sliced with the human owning the knife: vertical slices, walking-
skeleton order (any prefix of the build order is a viable system), extra-is-a-
failure-like-missing. Acceptance criteria are observable and binary — they are the
validator's only brief.

## Carried design nudges (from v1, still to land through the loop)

- **Lint-regime nudge** — greenfield Design seeds an aggressive per-stack lint
  baseline (strictest preset as floor, complexity budgets, architecture-as-lint);
  brownfield detects the existing gate and offers a ratchet. Machine-checkable rules
  belong in the linter; judgment rules in system prompts.
- **Soft coupling is an edge** — when feature B designs better knowing A's final
  shape, that judgment is recorded as an ordinary `depends_on` edge (ADR-0038).
- **Glossary ratchet** — before minting a term, ask whether a standard industry
  term already names it (ADR-0037).

## Acceptance

- A brief yields a valid architecture.md, feature-graph.md, and per-feature design
  docs, with `the-loop check` printing OK.
