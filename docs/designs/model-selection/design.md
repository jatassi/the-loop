# model-selection — per-role model/effort bindings at every spawn surface

**Status:** shipped (designed 2026-07-03, ADR-0030; trimmed by ADR-0040).

## What it is

Every spawn surface resolves its model from one table instead of inheriting the
session model invisibly.

- **Contract: model binding** — `{ <role>: { model, effort?, executor? } }` where
  `model` is a Claude alias, a full model id, or the literal `"session"` (an explicit,
  deliberate inherit — distinct in provenance from the unbound fallback); `executor`
  routes to a registered executor (default: agent).
- **Layers** — plugin defaults (`config/model-bindings.json`) < project
  (`.claude/settings.json`) < local (`.claude/settings.local.json`), both under the
  `"the-loop".modelBindings` key; whole-entry replacement per role; `the-loop
  models-list` prints the resolved table with per-role provenance
  (`default|project|local|fallback`). Pure resolver in `src/resolve-model-bindings.js`.
- **Roles (v2)** — `plan`, `build.rote`, `build.standard`, `build.complex`, `drive`
  (+ optional `drive.<executor>` sub-roles), `validate`. The registry is open —
  dotted ids; any surface may declare more. v1's `derive`, `plan.audit`, and
  `design.*` roles were retired with their machinery (ADR-0035/0036).
- **Judgment-level routing** — plan stamps `judgment_level` on every task; the
  workflow routes `build.<judgment_level>`; a task with no judgment level set routes
  `build.standard` with a logged line.
- **Visibility** — an unbound role falls back to the session model with one
  `model-selection —` log line relayed at the run boundary; spawn labels carry the
  resolved model (`[sonnet] build:…`). Never silent.
- **Executor validation** — `the-loop models-list` hard-fails an `executor` naming an
  unregistered executor or a model outside its playbook
  (`src/executor-registry.js`).

Session-side spawns (the Agent tool) take a model only — no per-spawn effort; that
remains a documented harness limitation.
