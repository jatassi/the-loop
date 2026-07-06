# v0.3.0 — the repo speaks plain SDLC English

- **Date:** 2026-07-05
- **Tag:** `v0.3.0` (tip `0e8c38d`; first release under the v<version> tag convention — prior tags `loop/ship/1`, `loop/ship/2`)
- **Features:** worktree-parallelism (test-gated merge policy), diagnose (the bug
  intake channel), naming-map (129-row human-approved rename map), rename-sweep
  (the clean-slate vocabulary landing — ADR-0044). No fix entries pruned.
- **Ready evidence:** at the pinned tip — `npm test` 144/144, `npm run check` OK
  (25 features), eslint clean; all four releasing features' runbooks replayed
  green (fixture CLI legs, fix-lifecycle simulation incl. the designs/-then-bugs/
  fallback and prune-survival, shared-footprint plan check, both test-gated merge
  fixtures by hand). Recorded sheds, per the runbooks' own sanction: the
  naming-map blind-inference quiz (run three times across validation legs on this
  same tree) and diagnose's live-agent conversation legs (prose-verified).
- **Deploy:** recorded chain verbatim; updated 0.2.0 → 0.3.0 cleanly (no
  stale-cache race this time); health check green (installed 0.3.0, enabled,
  details resolve). Restart required for live sessions to run the new version.
- **Outcome:** deployed
- **Rollback pointer:** `loop/ship/2` (code); `claude plugin uninstall
  the-loop@the-loop --scope user` (plugin).
- **Approval:** Jackson Atassi, 2026-07-05 — granted in-session, conditional on
  all ready checks green; condition met.
