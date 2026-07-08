# v0.4.4 — feature: (i/N) task-position prefix on divided-feature build titles

- **Date:** 2026-07-08
- **Tag:** `v0.4.4` (tip `cdfed43`, the plugin-version-bump commit — the deployed
  tip; the record commit lands after the tag, as with `v0.4.3`).
- **Type:** feature release. One feature flipped `validated → shipped`. No
  `fix-<slug>` nodes existed, so none were pruned.
- **Features / changes:**
  - `build-agent-title-progress` — when a feature builds as 2+ tasks, each build
    agent's Workflow-progress-tree title is prefixed with its fixed 1-based slot in
    the plan's declared task array and the total: `(2/3) <feature>/<task>`. The
    prefix rides the drive-path label too (`(2/3) <feature>/<task> via <executor>`).
    Undivided builds (small workflow path, or a standard plan with a single task)
    keep run-presentation's bare label — `(1/1)` never appears. Position tracks the
    declared array slot, not DAG build order and not the free-form task id; the
    ordinal lives only in the display label, never in branch names, commit
    subjects, or merge order. Implemented in `workflows/execution-pipeline.js`
    (`runBuild` computes position/total, `runSmallBuild` passes none,
    `runTask`/`buildSpawnOpts` apply it to both label sites); refines
    run-presentation's label-format line, which was amended in the same landing.
- **Ready evidence:** at the pinned tip `cdfed43` — `npm test` **162/162**,
  `npm run check` **OK** (28 features) + eslint clean. **Runbook replay:** all four
  acceptance criteria PASS — a fresh out-of-process drive of the shipped
  `workflows/execution-pipeline.js` (harness stubs only the `agent()` boundary):
  declared-order positions `(1/3)c (2/3)a (3/3)b` on a DAG that builds `a` first;
  the drive label `(2/3) gizmo/middle via grok`; single-task/small builds bare with
  no `(1/1)`; and a `(\d+/\d+)` scan of every build/validate prompt returning false.
- **Deploy:** recorded marketplace chain run verbatim; marketplace already on disk
  (updated), plugin already installed (update leg upgraded `0.4.3 → 0.4.4`) cleanly;
  health check **green** (installed 0.4.4, enabled, details resolve). Restart
  required for live sessions to run the new version.
- **Outcome:** deployed
- **Rollback pointer:** `v0.4.3` (code); `claude plugin uninstall the-loop@the-loop
  --scope user` (plugin).
- **Approval:** Jackson Atassi, 2026-07-08 — standing in-session authorization to
  deploy via `/release` and push after a successful release, granted before the
  ready checks ran.
