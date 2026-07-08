# v0.4.3 — patch: brace ${CLAUDE_PLUGIN_ROOT} in command/skill prose

- **Date:** 2026-07-08
- **Tag:** `v0.4.3` (tip `413e2ba`, the plugin-version-bump commit — the deployed
  tip; the record commit lands after the tag, as with `v0.4.2`).
- **Type:** patch release. The feature graph had `validated: 0` — no features shipped
  and no statuses flipped. No `fix-<slug>` nodes existed, so none were pruned. Bundles
  the bracing fix and the version bump accumulated since `v0.4.2`.
- **Features / changes:**
  - `075ed3f` **fix** — Claude Code substitutes `${CLAUDE_PLUGIN_ROOT}` (braced) in
    command and skill content via a single global regex (harness function `MEe`,
    `/\$\{CLAUDE_PLUGIN_ROOT\}/g`, applied to the whole body before bash injection).
    A bare `$CLAUDE_PLUGIN_ROOT` is left untouched: it reaches the model as a
    literal, gets run in a shell where the env var is unset, expands to empty, and
    `node "/bin/the-loop.js"` crashes with `Cannot find module '/bin/the-loop.js'` —
    the "isn't set in the shell, locating the plugin directly" symptom when the
    deployed plugin runs in another repo. The `!` orientation line
    (`commands/the-loop.md:12`) was already braced and worked; the
    prepare-execution-context call (`:42`), the bare `status` call (`:68`), and the
    design skill's `check` call (`skills/design/SKILL.md:64`) were not. Braced all
    three plus the illustrative `docs/runbooks/run-presentation/runbook.md`
    reference, and added a regression guard asserting every `CLAUDE_PLUGIN_ROOT`
    reference under `commands/` and `skills/` is brace-wrapped.
- **Ready evidence:** at the pinned tip `413e2ba` — `npm test` **161/161**, `npm run
  check` **OK** (27 features) + eslint clean. **Runbook replay: N/A** — a surface
  bug-fix with no feature node; the end-to-end behavior was proven instead by
  replicating the harness substitution (old files leave 3 surviving bare literals,
  the fixed files leave 0) and a runtime before/after: the bare form crashes with
  module-not-found, the braced form resolves to an absolute path and runs the bin
  from an arbitrary directory with the env var unset.
- **Deploy:** recorded marketplace chain run verbatim; marketplace already on disk
  (updated), plugin already installed (update leg upgraded `0.4.2 → 0.4.3`) cleanly;
  health check **green** (installed 0.4.3, enabled, details resolve). Verified
  against the deployed artifact: `commands/the-loop.md` 3/3 references braced,
  `skills/design/SKILL.md` 1/1 braced, 0 bare; the deployed bin runs from `/tmp`
  with `CLAUDE_PLUGIN_ROOT` unset. Restart required for live sessions to run the new
  version.
- **Outcome:** deployed
- **Rollback pointer:** `v0.4.2` (code); `claude plugin uninstall the-loop@the-loop
  --scope user` (plugin).
- **Approval:** Jackson Atassi, 2026-07-08 — standing in-session authorization to
  deploy via `/release` and iterate until provably fixed, granted before the ready
  checks ran.
