# v0.4.0 — run presentation + the proposed backlog stage

- **Date:** 2026-07-07
- **Tag:** `v0.4.0` (tip `a4c4e76`, the plugin-version-bump commit — the deployed
  tip; the record commit lands after the tag, as with `v0.3.0`).
- **Features:** run-presentation (scope-derived workflow description + prefix-free
  spawn labels), proposed-status (the `proposed` backlog stage — feature status
  enum expansion). No fix entries pruned.
- **Ready evidence:** at the pinned tip `d821573` — `npm test` 160/160, `npm run
  check` OK (27 features), eslint clean; both releasing features' runbooks replayed
  green from the outside (fixture CLI legs + hand-built scratch graphs):
  run-presentation's four criteria (one-line `meta` splice, no-flag-writes-nothing
  with byte-identical stdout, the multi-line-`meta` shape gate refusing with exit 1
  / empty stdout / no file, prefix-free spawn labels, launch leg binding
  `scriptPath` to the spliced path) and proposed-status's five (proposed needs no
  acceptance while designed still does, `prepare-execution-context` refuses a
  proposed scope, blocked-designed excluded → `design` proposal, proposed-only
  backlog → `design` proposal never `new-intake`, four-value enum on every living
  surface). Recorded record fix: proposed-status's runbook stated its suite is
  "5/5"; the shipped `test/proposed-status.test.js` is 4 test blocks, all green,
  and the file is unchanged since it and the runbook were committed together
  (`2f5e163`) — a miscount in the record, corrected in this release, coverage
  intact.
- **Re-verify:** the release bumped `.claude-plugin/plugin.json` `0.3.0 → 0.4.0`
  in its own commit (`a4c4e76`), moving the tip; the automated ready checks were
  re-run there — `npm test` 160/160, `npm run check` OK — clean. The manual
  runbook replays exercise behavior independent of the version literal, so that
  evidence carried forward.
- **Deploy:** recorded chain verbatim; updated 0.3.0 → 0.4.0 cleanly; health check
  green (installed 0.4.0, enabled, details resolve). Restart required for live
  sessions to run the new version.
- **Outcome:** deployed
- **Rollback pointer:** `v0.3.0` (code); `claude plugin uninstall
  the-loop@the-loop --scope user` (plugin).
- **Approval:** Jackson Atassi, 2026-07-07 — granted in-session at the release gate,
  after all ready checks reported green.
