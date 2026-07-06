---
name: code-quality
description: The bundled code-quality baseline — build constitution, design vocabulary, test judgment, review catalog. Use when writing or judging code or tests inside the loop's phases, or when another surface needs the code-quality vocabulary.
---

# The code-quality baseline

The plugin's default code-quality pack: how code gets shaped, written, and judged
across the loop's phases. Four pieces, each consumed where it bites:

| Piece | File | Consumed by |
|---|---|---|
| Build constitution | [constitution.md](constitution.md) | every build agent, unconditionally |
| Design vocabulary & principles | [design-principles.md](design-principles.md) | Design (shaping contracts), Plan (interface thinking) |
| Test judgment | [writing-tests.md](writing-tests.md) | build agents writing or fixing tests; the validator on test diffs |
| Review catalog | [review-catalog.md](review-catalog.md) | the validator's standards axis |

Three rules govern the whole pack:

- **The repo wins.** A documented project standard overrides
  anything here; where the repo endorses a pattern this pack would flag, the
  finding is suppressed.
- **Unobvious only.** Nothing here restates what the model already knows or a
  linter already enforces — keep it that way when editing: a rule that fails
  that test is deleted, not softened.
- **Identifiers follow the naming standard's glossary rules.** No coined
  proper nouns.
