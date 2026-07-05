# model-selection — per-role model/effort bindings at every spawn surface

**Status:** shipped (designed 2026-07-03, ADR-0030; trimmed by ADR-0040).

## What it is

Every spawn surface resolves its model from one table instead of inheriting the
session model invisibly.

- **Contract: model binding** — `{ <role>: { model, effort?, via? } }` where `model`
  is a Claude alias, a full model id, or the literal `"session"` (an explicit,
  deliberate inherit — distinct in provenance from the unbound fallback); `via`
  routes to a registered executor (default: agent).
- **Layers** — plugin defaults (`config/model-bindings.json`) < project
  (`.claude/settings.json`) < local (`.claude/settings.local.json`), both under the
  `"the-loop".modelBindings` key; whole-entry replacement per role; `the-loop models`
  prints the resolved table with per-role provenance
  (`default|project|local|fallback`). Pure resolver in `src/models.js`.
- **Roles (v2)** — `plan`, `build.rote`, `build.standard`, `build.complex`, `drive`
  (+ optional `drive.<executor>` sub-roles), `validate`. The registry is open —
  dotted ids; any surface may declare more. v1's `derive`, `plan.audit`, and
  `design.*` roles were retired with their machinery (ADR-0035/0036).
- **Tier routing** — plan stamps `tier` (decision-density) on every task; the
  workflow routes `build.<tier>`; an untiered task routes `build.standard` with a
  logged line.
- **Visibility** — an unbound role falls back to the session model with one
  `model-selection —` log line relayed at the run boundary; spawn labels carry the
  resolved model (`[sonnet] build:…`). Never silent.
- **Executor validation** — `the-loop models` hard-fails a `via` naming an unregistered
  executor or a model outside its playbook (`src/executors.js`).

Session-side spawns (the Agent tool) take a model only — no per-spawn effort; that
remains a documented harness limitation.
