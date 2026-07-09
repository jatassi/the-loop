# plugin-dir-restructure — plugin content into a source subdirectory

**Feature id:** `plugin-dir-restructure` · **depends_on:** `release` · designed
2026-07-08 · see [ADR-0048](../../adr/0048-plugin-source-subdirectory-vendored-runtime-dep.md).

## The problem it solves

The repo root *is* the plugin root today (`.claude-plugin/marketplace.json` binds
`source: "./"`). Installation copies the plugin root wholesale — there is **no
allowlist, no `.gitignore` respect, no `files` field** (docs checked 2026-07-08). So
the bundle carries everything the working tree holds: `eval/` (megabytes of fixtures
and results), `docs/`, `test/`, and the dev `node_modules/` with every devDependency.
The v0.4.6 release aborted at the gate on exactly this.

The sanctioned fix is a **marketplace source subdirectory**: move all plugin content
under one directory, point the marketplace `source` at it, and let the physical
directory boundary be the ignore mechanism. Only that boundary can scope the bundle —
`plugin.json`'s custom-path fields (`skills`, `commands`, `agents`) steer *discovery*,
not what gets *copied*, and installed plugins **cannot reference files outside the
plugin root** (paths that traverse `../` are dropped at install for security). So
every runtime surface — CLI, config, workflows, executor playbooks, and the one npm
runtime dependency — must live *under* the new root.

## The decision

1. **Plugin content moves into `plugin/`.** The plugin root becomes `<repo>/plugin/`;
   `plugin/.claude-plugin/plugin.json` is the manifest. `.claude-plugin/marketplace.json`
   **stays at the repo root** with `source` re-pointed to `./plugin`. `${CLAUDE_PLUGIN_ROOT}`
   resolves to the installed `plugin/` directory; braced references need no edit.
2. **The one runtime dependency (`yaml`, v2.9.0, zero transitive deps) is vendored**
   as tracked content at `plugin/node_modules/yaml/` — so `import YAML from 'yaml'`
   resolves inside the bundle unchanged, and it ships under a git-source clone that
   only carries tracked files. (ADR-0048; the rejected alternatives — a
   SessionStart-hook `npm install`, and eliminating `yaml` — are recorded there.)

`plugin/` is a plain, self-describing directory name; no glossary entry (the ratchet:
a standard word already names it).

## Target structure

```
the-loop/                          # repo root — the human's dev tree, NOT the plugin root
├── .claude-plugin/
│   └── marketplace.json           #   source: "./plugin"   (STAYS here)
├── plugin/                        # ← the plugin root (the entire shipped bundle)
│   ├── .claude-plugin/
│   │   └── plugin.json            #   the manifest (MOVED here)
│   ├── package.json               #   NEW — { "type": "module", … } (see below)
│   ├── agents/  commands/  skills/  workflows/
│   ├── config/
│   │   ├── model-bindings.json
│   │   └── executors/grok.md       #   MOVED from docs/executors/ (see below)
│   ├── bin/
│   │   ├── the-loop.js  cli-commands.js   #   MOVED (runtime CLI)
│   ├── src/                       #   MOVED (all 13 modules)
│   └── node_modules/
│       └── yaml/                  #   VENDORED, tracked (~1.2M, zero deps)
├── bin/
│   └── create-sample-repo.js      #   STAYS — dev/test fixture tool, out of the bundle
├── docs/  test/  eval/            #   STAY — dev, out of the bundle
├── package.json  package-lock.json  eslint.config.js  README.md  .gitignore  CLAUDE.md
└── node_modules/                  #   STAYS — dev deps, gitignored, at repo root
```

## Why it works — three mechanisms

- **`PLUGIN_ROOT` self-rehomes.** `bin/cli-commands.js` computes
  `PLUGIN_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))` — the
  parent of `bin/`. Move `bin/` + `src/` + `config/` + `workflows/` together and
  `PLUGIN_ROOT` becomes `plugin/` automatically. Every plugin-relative read —
  `config/model-bindings.json`, `workflows/execution-pipeline.js`, the `cli` field
  spliced into the execution context (`node "${PLUGIN_ROOT}/bin/the-loop.js"`), the
  canonical workflow script read for `--script-out` — tracks the move with **zero code
  changes to path resolution**, provided the relative layout among those dirs is
  preserved.
- **The directory boundary is the only ignore mechanism.** With `source: "./plugin"`,
  a git-subdir clone carries only `plugin/`'s tracked files. `eval/`, `docs/`, `test/`,
  and the repo-root dev `node_modules/` sit outside `plugin/` and never ship.
- **Braced `${CLAUDE_PLUGIN_ROOT}` is late-bound.** The six references in
  `plugin/skills/begin/SKILL.md` and `skills/design/SKILL.md` re-resolve to the new installed
  root with no edit — the sweep test already guards that they stay brace-wrapped.

## Load-bearing details a builder must not miss

- **`plugin/package.json` is required, not optional.** The installed bundle is *only*
  `plugin/` — there is no repo-root `package.json` above it in the cache. Without a
  `plugin/package.json` declaring `"type": "module"`, Node treats the installed
  `plugin/**/*.js` as CommonJS and every ESM `import` throws. Minimum shape:
  `{ "name": "the-loop", "type": "module", "private": true, "dependencies": { "yaml": "^2.9.0" } }`.
  It also documents the vendored dep and lets a dev refresh it via `cd plugin && npm install`.
- **Vendored `yaml` must be tracked.** `.gitignore` currently ignores `node_modules/`
  unanchored (matches at any depth). Anchor the dev rule to the repo root
  (`/node_modules/`) and un-ignore the vendored copy so `plugin/node_modules/yaml/` is
  committed while the repo-root dev tree stays ignored. Import sites stay byte-identical.
- **Executor playbook relocation.** `config/model-bindings.json` binds `build.rote`,
  `build.standard`, and `validate` to executor `grok`; `models-list` validates that
  binding by reading `readRegistry(path.join(PLUGIN_ROOT, 'docs/executors'))`. After the
  move `PLUGIN_ROOT/docs/executors` would be empty → `validateBindings` hard-fails
  "unregistered executor" → `prepare-execution-context` and `models-list` break. Fix:
  move `docs/executors/grok.md` → `plugin/config/executors/grok.md` and change the one
  default in `cli-commands.js` from `docs/executors` to `config/executors`. This keeps
  the bundle free of any `docs/` directory (criterion 1) and homes the shipped default
  playbook beside `model-bindings.json`, its natural sibling.
- **`create-sample-repo.js` stays out.** It imports only node builtins (no `src/`
  deps) and is invoked only by tests, the validation runbook, and eval traps — never by
  a loop run. It is dev tooling, so it stays at repo-root `bin/`; only `the-loop.js` and
  `cli-commands.js` move into `plugin/bin/`.

## Interfaces this touches (real shapes to preserve)

- `bin/cli-commands.js:28` — `export const PLUGIN_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))` — unchanged; self-rehomes.
- `bin/cli-commands.js:84` — `readRegistry(executorsDir || path.join(PLUGIN_ROOT, 'docs/executors'))` — the **only** intentional path edit (`docs/executors` → `config/executors`).
- `bin/cli-commands.js:195` — `const cli = \`node "${path.join(PLUGIN_ROOT, 'bin/the-loop.js')}"\`` — unchanged; emits the new absolute path.
- `bin/cli-commands.js:204` — canonical script read at `path.join(PLUGIN_ROOT, 'workflows/execution-pipeline.js')` — unchanged.
- `.claude-plugin/marketplace.json` `source` — `"./"` → `"./plugin"` (the marketplace re-point).

## Self-hosting fix-ups (the move's blast radius)

The move must land atomically with `npm test` and `npm run check` green from the repo
root. Surfaces that carry a repo-root-relative path to the moved code:

- **12 test files** import `../src/…`; the create-sample-repo test drives `../bin/`.
  After the move, tests still live at repo-root `test/`, so `../src/…` becomes
  `../plugin/src/…` (and the CLI-driving tests point at `plugin/bin/the-loop.js`).
- **`package.json`** (repo-root, dev): `bin.the-loop` → `./plugin/bin/the-loop.js`;
  `exports."."` → `./plugin/src/index.js`; `scripts.test` glob and
  `scripts.check`/`scripts.lint` targets updated; `yaml` moves out of dev deps (it now
  lives vendored under `plugin/`, owned by `plugin/package.json`).
- **`eslint.config.js`** — lint scope now covers `plugin/src` + `plugin/bin`; ignore
  `plugin/node_modules/`.
- **`workflows/execution-pipeline.js`** — the dead fallback string `'node bin/the-loop.js'`
  (superseded by the always-present `cli` field) becomes `'node plugin/bin/the-loop.js'`.
- **`README.md`** — the directory-layout section and the "one dependency: yaml" note.
- **Architecture runbooks** — the Validation runbook's `<plugin-root>/bin/the-loop.js`
  placeholder still resolves; the health-check `require("./.claude-plugin/plugin.json")`
  path and the marketplace `source` change land in the **Release runbook** update below.

## Release runbook change (criterion 3)

The deploy chain (`marketplace add "$PWD"` → `marketplace update` → `install`/`update`)
is unchanged in shape — `marketplace.json` still lives at the repo root, so
`add "$PWD"` still finds it; it now resolves `source: "./plugin"`. Two edits land with
the build: `marketplace.json` `source` → `./plugin`, and the health check's
`require("./.claude-plugin/plugin.json")` → `require("./plugin/.claude-plugin/plugin.json")`.
The first real release after this feature exercises the chain end-to-end and is the
verification of criterion 3 — including confirming the installed cache holds only
`plugin/` content.

## How each acceptance criterion is met

1. **Bundle is only plugin content** — the `plugin/` boundary excludes `eval/`,
   `docs/`, `test/`, and repo-root dev `node_modules/`; the vendored `yaml` is the only
   `node_modules/` inside the bundle; no `docs/` dir ships (executor playbook relocated
   to `config/`).
2. **Every plugin surface resolves under the new root** — `PLUGIN_ROOT` self-rehomes;
   braced `${CLAUDE_PLUGIN_ROOT}` late-binds; agents/commands/skills/workflows/config
   auto-discover under `plugin/`; `the-loop status | check | models-list | plan |
   prepare-execution-context` all run from the installed plugin.
3. **Release runbook deploys the subdirectory source end-to-end** — marketplace
   re-point + plugin.json relocation land in the runbook; the next release runs it
   verbatim and its health check passes.

## Risks & verification

- **Nearest-`package.json` module resolution** is the sharpest edge — verify by running
  the installed CLI from a clean cache, not just from the dev tree (the dev tree's
  repo-root `package.json` would mask a missing `plugin/package.json`).
- **The marketplace re-point** cannot be fully proven by unit tests — it needs the real
  `claude plugin` chain (the release runbook). Treat that end-to-end run as part of
  validation, not deferred to the first user release.
- **Non-goal:** no build step, no bundler (ADR-0048 keeps "plain ESM JS/no-build");
  eliminating the `yaml` dependency entirely is a legitimate later simplification, not
  this feature.
