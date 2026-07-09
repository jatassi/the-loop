# v0.4.6 — plugin content into a source subdirectory

- **Date:** 2026-07-08
- **Tag:** `v0.4.6` (tip `ec73c71`, the plugin-version-bump commit — the deployed
  tip; the record commit lands after the tag, as with `v0.4.5`).
- **Feature:** `plugin-dir-restructure` (`designed → validated → shipped`) — the
  v0.4.6 release blocker (the v0.4.6 gate aborted on it). No `fix-<slug>` nodes
  existed, so none were pruned.
- **Change:** all plugin surfaces moved under `plugin/` (agents, commands, skills,
  workflows, config, `bin/{the-loop,cli-commands}.js`, src, and
  `.claude-plugin/plugin.json`); the marketplace `source` re-points to `./plugin`,
  so the shipped bundle is exactly that subdirectory. The one runtime dependency
  (`yaml`) is vendored at `plugin/node_modules/yaml` as tracked content; the shipped
  default executor playbook lives at `plugin/config/executors/grok.md`. Repo-root
  dev tooling (`docs/`, `test/`, `eval/`, dev `node_modules`) no longer ships
  (ADR-0048). Landed as `ede60d1` (move) + merge `96e45d4` (reconciling the parallel
  `configure + onboard` design stream) + `0068931` (validate) + runbook.
- **Ready evidence:** at the pinned tip — `npm test` **170/170**, `npm run check`
  **OK** (30 features) + eslint clean. **Runbook replay:**
  `docs/runbooks/plugin-dir-restructure/runbook.md` — the CLI run from a
  `plugin/`-only copy placed outside the repo (standalone ESM boot, vendored `yaml`
  resolves, `check` / `models-list` / `executors-list` / `status --json` all pass),
  green.
- **Deploy:** recorded marketplace chain run verbatim; marketplace already on disk
  (updated — re-read `marketplace.json`, picking up `source: ./plugin`), plugin
  already installed (update leg upgraded `0.4.5 → 0.4.6` from the subdirectory
  source) cleanly; health check **green** (installed 0.4.6, enabled, details
  resolve). The installed `0.4.6` bundle was inspected directly: it carries only
  plugin content (`.claude-plugin agents bin commands config node_modules
  package.json skills src workflows`), **no `docs/` / `test/` / `eval/`**, with
  `node_modules` holding only the vendored `yaml` v2.9.0 — the acceptance's core
  claim, confirmed on the real artifact. Restart required for live sessions to run
  the new version.
- **Outcome:** deployed
- **Rollback pointer:** `v0.4.5` (code); `claude plugin uninstall the-loop@the-loop
  --scope user` (plugin).
- **Approval:** Jackson Atassi, 2026-07-08 — at the synchronous human gate (after
  ready checks were green), explicitly approved the deploy ("I approve, go for it").
