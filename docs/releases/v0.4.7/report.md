# v0.4.7 — front door renamed `/the-loop` → `/begin` (command → skill)

- **Date:** 2026-07-09
- **Tag:** `v0.4.7` (tip `ba90740`, the plugin-version-bump commit — the deployed
  tip; the record commit lands after the tag, as with `v0.4.5`/`v0.4.6`).
- **Feature:** `begin-front-door-rename` (`validated → shipped`) — the sole graph
  feature in the `validated` set at gate time. No `fix-<slug>` nodes existed, so
  none were pruned.
- **Also on the tip (rode the release, not a graph feature):** commit `7eec687`
  "drive contract + CLI: fix j45-run incidentals" — prompt-file race and
  worktree-remove friction fixes touching `plugin/agents/drive.md`,
  `plugin/bin/cli-commands.js`, `plugin/bin/the-loop.js`. Landed on main between
  releases; ships because the marketplace deploys the whole tip. Surfaced explicitly
  at the human gate. The `ports-adapters-full` design/`CLAUDE.md` commits in the
  range are docs-only and do not ship (docs/ excluded, ADR-0048).
- **Change:** the front door moved from a slash command to a skill:
  `plugin/commands/the-loop.md` → `plugin/skills/begin/SKILL.md` (content-identical
  apart from the `/the-loop` → `/begin` name sweep; orientation preamble kept in the
  start-of-line inline `!` form), and `plugin/commands/` is retired. Kills the
  `/the-loop:the-loop` namespace stutter and lands the begin-a-session semantic; the
  upstream commands→skills merge (`!` dynamic-context injection works in SKILL.md)
  dissolved ADR-0002's reason to remain a command, so 0002 got one appended amendment
  paragraph. `design_version` 23. Landed as `4dcc08e` (rename, via grok) on top of the
  define/design/validate commits `0f4e7f9`/`7ad60ba`/`55f59c2`.
- **Ready evidence:** at the pinned tip `ba90740` — `npm test` **171/171**,
  `npm run check` **OK 32 features** + eslint clean. **Runbook replay:**
  `docs/runbooks/begin-front-door-rename/runbook.md` — C1 front-door shape (begin
  SKILL present, `plugin/commands/` gone) ✓; C2 slash-form `/the-loop` sweep ✓
  (remaining hits are the feature's own self-referential graph entry and
  `the-loop.js` binary-path regexes, not live slash-form); C3 suite green ✓; C4
  ADR-0002 amendment-only ✓; C5 `status --json` corroborates `design_version 23`,
  23/32 shipped ✓.
- **Deploy:** recorded marketplace chain run verbatim; marketplace already on disk
  (updated cleanly), plugin already installed — the update leg upgraded
  **0.4.6 → 0.4.7** from the `./plugin` subdirectory source. Health check **green**
  (installed 0.4.7, enabled, `details` resolve). Restart required for a live session
  to run the new front door.
- **Outcome:** deployed
- **Rollback pointer:** `v0.4.6` (code); `claude plugin uninstall the-loop@the-loop
  --scope user` (plugin).
- **Approval:** Jackson Atassi, 2026-07-09 — at the synchronous human gate (after
  ready checks were green and the rode-along `7eec687` fix was disclosed), explicitly
  approved the deploy ("approved").
