# craft-baseline — Craft bundle (distilled rules + reference pack)

**Status:** shipped (v1 two-layer baseline, ADR-0027; distilled by ADR-0036).

## What it is

The craft layer that keeps agent-written code honest, in v2 form:

- **Distilled into role cards** — the ~10 integrity lines every build/drive agent
  carries resident (test budget, never-weaken-tests, no lint suppressions,
  footprint-as-lease, fix root causes). Only deltas from model priors are stated.
- **Mechanical rules live in the linter** — this repo dogfoods the aggressive
  regime: strictest presets as floor, complexity/size budgets, import-direction
  architecture lint (`eslint.config.js`), zero findings, wired into `npm run check`.
- **The reference pack** (`skills/craft/`: constitution, design principles, review
  catalog) remains as on-demand reading for Design-phase judgment — no agent is
  mandated to read it.

The v1 `docs/standards/` per-task selection mechanism was retired (ADR-0036/0037):
project-specific judgment rules belong in the feature design docs they concern, or
in the linter when machine-checkable.
