# v0.4.5 — config-only: validate role runs on opus

- **Date:** 2026-07-08
- **Tag:** `v0.4.5` (tip `b338a2e`, the plugin-version-bump commit — the deployed
  tip; the record commit lands after the tag, as with `v0.4.4`).
- **Type:** config-only release. **No features** — the `validated` set was empty
  ("nothing dependency-ready"), so no `validated → shipped` flip and no feature
  graph change. No `fix-<slug>` nodes existed, so none were pruned.
- **Change:** `config/model-bindings.json` — the `validate` role binding moved from
  `session` → `opus` (committed as `3feb3a9 config: update model bindings`). Cut as
  its own patch release because the marketplace deploy chain keys off the plugin
  version (`install` no-ops at the installed version; `update` only upgrades), so a
  version bump is the only way an installed instance picks up the new binding.
- **Ready evidence:** at the pinned tip `b338a2e` — `npm test` **162/162**,
  `npm run check` **OK** (28 features) + eslint clean. **Runbook replay:** none — a
  config-only release carries no features, so there are no acceptance runbooks to
  replay.
- **Deploy:** recorded marketplace chain run verbatim; marketplace already on disk
  (updated), plugin already installed (update leg upgraded `0.4.4 → 0.4.5`) cleanly;
  health check **green** (installed 0.4.5, enabled, details resolve). Restart
  required for live sessions to run the new version.
- **Outcome:** deployed
- **Rollback pointer:** `v0.4.4` (code); `claude plugin uninstall the-loop@the-loop
  --scope user` (plugin).
- **Approval:** Jackson Atassi, 2026-07-08 — approved cutting `v0.4.5` and, at the
  synchronous human gate (after ready checks were green), explicitly approved the
  deploy.
