# v0.4.1 — patch: installed-plugin pipeline spawn + validate binding

- **Date:** 2026-07-08
- **Tag:** `v0.4.1` (tip `f801a90`, the plugin-version-bump commit — the deployed
  tip; the record commit lands after the tag, as with `v0.4.0`/`v0.3.0`).
- **Type:** patch release. The feature graph had `validated: 0` — no new features
  shipped and no statuses flipped; this bundles the maintenance commits accumulated
  since `v0.4.0`. No `fix-<slug>` nodes existed, so none were pruned.
- **Features / changes:**
  - `2b3570b` **fix** — the execution-pipeline workflow spawned agents by bare role
    name, which only resolves in this dev repo (agents symlinked into
    `.claude/agents/`). In any installed-plugin project the agents register only
    namespaced (`the-loop:plan`, …), so a run stalled immediately. Now spawns via
    the plugin namespace (`agentNamespace`, default `the-loop`, `''` selects bare
    names). Resolves the open probe ADR-0029 recorded.
  - `d3ecccb` **config** — `validate` binding `sonnet → session` (the validator runs
    on the main-loop model).
  - `ce905af` **define** — SKILL.md guidance to weigh user text surrounding the skill
    invocation (doc).
  - `ec4292a` **runbook** — proposed-status suite count corrected 5/5 → 4/4 (doc).
  - `155915a` **test** — dropped the config-mirroring change-detector in
    `resolve-model-bindings.test.js` (see halt/repair below).
- **Ready evidence:** at the pinned tip `f801a90` — `npm test` **160/160**, `npm run
  check` **OK** (27 features), eslint clean (0 errors, 0 warnings). **Runbook replay:
  N/A** — none of the touched features (execution-pipeline, model-selection, define,
  proposed-status) has a behavior-changing dedicated runbook; the one behavioral fix
  (pipeline agent-type, `2b3570b`) is covered by the `execution-pipeline-{happy,
  blocked,drive,halt}` automated suite, not an end-to-end runbook replay. This
  release leans on the unit/integration suite by design.
- **Halt and repair:** Step 1 first ran **red** — commit `d3ecccb` changed
  `config/model-bindings.json` `validate → session` but left the guard test
  `resolve-model-bindings.test.js:23` pinning `sonnet` (that commit touched config
  only). Per operator instruction the stale change-detector block was deleted
  (`155915a`), keeping the four resolver-logic tests (merge/provenance, `session`
  fallback, executor pass-through, malformed-entry rejection); ready checks were then
  re-run green at the new tip. Consequence recorded: `validate: session` now ships
  **unguarded** by a defaults-snapshot test.
- **Deploy:** recorded marketplace chain run verbatim; marketplace already on disk
  (updated), plugin already installed (update leg upgraded `0.4.0 → 0.4.1`) cleanly;
  health check **green** (installed 0.4.1, enabled, details resolve). Restart
  required for live sessions to run the new version.
- **Outcome:** deployed
- **Rollback pointer:** `v0.4.0` (code); `claude plugin uninstall the-loop@the-loop
  --scope user` (plugin).
- **Approval:** Jackson Atassi, 2026-07-08 — granted in-session at the release gate,
  after ready checks reported green and the halt/repair was disclosed.
