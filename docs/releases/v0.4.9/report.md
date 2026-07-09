# v0.4.9 — configure/onboard, calibration memory, adapters, phase-agent binding, operate + runbook rename

- **Date:** 2026-07-09
- **Tag:** `v0.4.9` (tip `49f8c09`, the plugin-version-bump commit — the deployed
  tip; the record commit lands after the tag, as with `v0.4.5`–`v0.4.8`).
- **Features shipped (6):**
  - `configure` — hook inventory, four settings layers (defaults < user < project <
    local) with provenance, and the recommended-answer interview; new `hooks-list` /
    `hooks-set` CLI verbs; the resolver generalized to hook families (ADR-0049).
  - `role-agent-binding` — an optional `agent` field on the role-binding table; the
    pipeline spawns that agent type per role; `agent`+`executor` on one role is a
    named configuration gap (ADR-0050).
  - `calibration-capture` — every run self-records `docs/calibration/runs/<date>-<seq>.md`
    (deterministic payload the `record` agent transcribes with git enrichment);
    `the-loop calibration-summarize` regenerates the digest; recalled at Plan (rides
    the execution context) and Design (ADR-0046).
  - `ports-adapters-full` — documentation-as-adapter external-surface bindings; the
    capture gate, `docs/adapters/<surface>.md` template, and the graph-path/snapshot
    consumption seam (optional `--graph-path`). The live features→Linear round-trip
    (criterion 4) was proven by the session against a sandbox Linear team — see the
    Validation notes in its design doc (ADR-0050).
  - `onboard` — configure's superset: greenfield hand-off and brownfield
    assess-and-fill, leaving a project fully hooked (ADR-0049).
  - `operate-tooling` — the `## Operations toolkit` recorded binding, a thin
    `operate` skill under loop-invariant guardrails, and the runbook-genre rename:
    validation-sense records moved `docs/runbooks/<id>/runbook.md` →
    `docs/validation/<id>/procedure.md` (14 moved, dynamically re-listed at build
    time), `## Validation runbook` → `## Validation procedure`, and the validation
    sense of "runbook" swept to zero on every living surface — enforced by a landed
    regression test that re-lists and re-greps at test time.
- **In-cycle engine hotfix (not a graph node):** `2dfefd3` — the calibration
  observation collector read `budget.spent` / `budget.remaining` as properties and
  coerced them in arithmetic/templates, but the harness serves them as metric
  **methods** that throw `"No default value"` on any implicit coercion, crashing
  every pipeline run after the first spawn. Fixed to call `budget.spent()` /
  `budget.remaining()`; the test harness now wraps the budget fixture as
  coercion-throwing metric methods so the suite catches this class of bug.
- **Ready evidence:** at the pinned tip `49f8c09` — `npm test` **269/269**,
  `npm run check` **OK 32 features** + eslint clean. A live CLI smoke against a fresh
  `create-sample-repo` fixture exercised the shipped surfaces from the outside
  (`status`, `hooks-list`, `models-list`, `calibration-summarize`). The runbook rename
  is proven complete by `docs/runbooks/*/runbook.md` re-listing to **zero** and the
  landed completeness regression test. Per-feature validation procedures live at
  `docs/validation/<id>/procedure.md`; their mechanical substrate is codified in the
  green suite, and each feature was independently validated on this tip.
- **Deploy:** recorded marketplace chain run verbatim; the update leg upgraded
  **0.4.8 → 0.4.9** from the `./plugin` subdirectory source. Health check **green**
  (installed 0.4.9, enabled, `details` resolve). Restart required for a live session.
- **Outcome:** deployed
- **Rollback pointer:** `v0.4.8` (code); `claude plugin uninstall the-loop@the-loop
  --scope user` (plugin).
- **Approval:** Jackson Atassi, 2026-07-09 — standing approval to skip the synchronous
  gate for this release ("you have my standing approval, no need to pause at the
  gate"), given for the onboard + ports-adapters-full chain and its operate-tooling
  tail.
