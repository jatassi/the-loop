---
name: craft
description: The bundled craft baseline — build constitution, design vocabulary, review catalog. Use when writing or judging code inside the loop's phases, or when another surface needs the craft vocabulary.
---

# The craft baseline

The plugin's default craft pack: how code gets shaped, written, and judged
across the loop's phases. Three pieces, each consumed where it bites:

| Piece | File | Consumed by |
|---|---|---|
| Build constitution | [constitution.md](constitution.md) | every build agent, unconditionally |
| Design vocabulary & principles | [design-principles.md](design-principles.md) | Design (shaping contracts), Plan (interface thinking) |
| Review catalog | [review-catalog.md](review-catalog.md) | the validator's standards axis |

Two rules govern the whole pack:

- **The repo wins.** A documented project standard (`docs/standards/`) overrides
  anything here; where the repo endorses a pattern this pack would flag, the
  finding is suppressed.
- **Unobvious only.** Nothing here restates what the model already knows or a
  linter already enforces — keep it that way when editing: a rule that fails
  that test is deleted, not softened.
