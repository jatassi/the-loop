# plugin-dir-restructure — runbook record

Fixture-repo runbook (this repo's own binding): the plugin exercised from the outside
as an *installed bundle* would be, never in-process. The one verification that the dev
tree can't give — that the plugin is self-sufficient once only `plugin/` is copied out —
is run against a copy of `plugin/` placed **outside** the repo, so no parent
`package.json`/`node_modules` can mask a missing `plugin/package.json` or the vendored
`yaml`. Criterion 3 (the marketplace subdirectory-source deploy) is exercised by the
release's own deploy + health check, not here.

## Bring-up

```
TMP=$(mktemp -d /tmp/loop-bundle.XXXXXX)
cp -R plugin "$TMP/plugin"          # the shipped bundle = plugin/ only
SAMPLE=$(node bin/create-sample-repo.js)
```
`$TMP/plugin` top level was `agents bin commands config node_modules package.json
skills src workflows` — and carried **no** `docs/`, `test/`, or `eval/` (criterion 1).
`node_modules/` held exactly one entry, `yaml` (the vendored runtime dep). `$SAMPLE` is
a populated v2 target repo committed on `main`.

## Exercise

Run every command as the CLI from the clean bundle, cwd = the sample repo
(`cd "$SAMPLE"`), so `PLUGIN_ROOT` resolves to `$TMP/plugin`:

1. **Criterion 2 — the CLI boots as standalone ESM and the vendored `yaml` resolves.**
   ```
   node "$TMP/plugin/bin/the-loop.js" check docs/feature-graph.md
   ```
   → `OK   3 features — 0 error(s), 0 warning(s)`. Booting at all proves
   `plugin/package.json` (`type:module`) is present and `import 'yaml'` resolves from
   `plugin/node_modules/yaml` with no repo-root `node_modules` above the bundle.

2. **Criterion 2 — the shipped default executor playbook resolves under the new root.**
   ```
   node "$TMP/plugin/bin/the-loop.js" models-list
   node "$TMP/plugin/bin/the-loop.js" executors-list
   ```
   `models-list` → `validate => {"model":"grok-4.5","executor":"grok",
   "provenance":"default"}` (the binding validated against the registry, so
   `config/executors/grok.md` was found under the plugin root). `executors-list` →
   `grok.worktree => driver-made | models => ["grok-4.5","grok-composer-2.5-fast"]`.

3. **Criterion 2 — the machine orientation runs end to end.**
   ```
   node "$TMP/plugin/bin/the-loop.js" status --json
   ```
   → `mode => configured` (parses the sample graph, resolves the eligible set).

4. **Criterion 4 — the suite is green from the repo root** (self-hosting preserved):
   `npm test` → 170/170; `npm run check` → `OK   30 features` + eslint clean. Every
   moved `src`/`bin` import, `package.json` bin/exports/check target, and eslint
   zone/override resolves under `plugin/`.

## Expected observations

- The shipped bundle is exactly `plugin/`: plugin surfaces + `config/executors/grok.md`
  + a vendored `node_modules/yaml`, and no `docs/`, `test/`, or `eval/`.
- The CLI runs from a `plugin/`-only copy placed outside any Node project — standalone
  ESM boot, `yaml` resolved from the vendored copy, and `check` / `models-list` /
  `executors-list` / `status --json` all succeed, `PLUGIN_ROOT` resolving to the copy.
- The executor binding (`build.*`, `validate` → `grok`) validates against
  `plugin/config/executors/grok.md`.
- `npm test` and `npm run check` are green from the repo root.

## Teardown

```
rm -rf "$SAMPLE" "$TMP"
```
Confirmed removed. `$TMP` is this session's scratch (outside the target repo), swept
the same way once the observations above were recorded.
