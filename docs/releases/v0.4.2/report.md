# v0.4.2 — patch: design-skill gate ordering

- **Date:** 2026-07-08
- **Tag:** `v0.4.2` (tip `f1be40b`, the plugin-version-bump commit — the deployed
  tip; the record commit lands after the tag, as with `v0.4.1`/`v0.4.0`).
- **Type:** patch release. The feature graph had `validated: 0` — no new features
  shipped and no statuses flipped; this bundles the one maintenance commit
  accumulated since `v0.4.1`. No `fix-<slug>` nodes existed, so none were pruned.
- **Features / changes:**
  - `c471082` **design** — `skills/design/SKILL.md` gate step reordered to present
    the changed/created files **first**, then ask for explicit approval (previously
    approval was requested without that framing). Doc-only prose tweak, no behavior
    change.
- **Ready evidence:** at the pinned tip `c471082` — `npm test` **160/160**, `npm run
  check` **OK** (27 features), eslint clean (0 errors, 0 warnings). **Runbook replay:
  N/A** — the touched feature (`design`) has no dedicated runbook, and the change is
  doc-only prose with no behavior to replay.
- **Deploy:** recorded marketplace chain run verbatim; marketplace already on disk
  (updated), plugin already installed (update leg upgraded `0.4.1 → 0.4.2`) cleanly;
  health check **green** (installed 0.4.2, enabled, details resolve). Restart
  required for live sessions to run the new version.
- **Outcome:** deployed
- **Rollback pointer:** `v0.4.1` (code); `claude plugin uninstall the-loop@the-loop
  --scope user` (plugin).
- **Approval:** Jackson Atassi, 2026-07-08 — granted in-session at the release gate,
  after ready checks reported green.
