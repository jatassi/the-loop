# config-commands-rust — models-list/executors-list/hooks-list/hooks-set in Rust

**Status:** designed 2026-07-09 from `docs/briefs/rust-cli-replatform.md` (ADR-0051).

The configuration spine at parity: the four-layer settings merge (ADR-0049), the
model-bindings table with executor validation, the full hook inventory, and the one
settings *writer*. All inputs here are already JSON or markdown — this slice has no
artifact-format migration at all; the executor playbook's machine-block fence flip
(yaml → json) is content the paired fixtures carry now and this repo's `grok.md`
receives at json-cutover.

## Commands at parity

JS reference: `plugin/bin/cli-commands.js` (buildModelsTable, buildHooksTable),
`plugin/bin/hooks-commands.js`, `plugin/src/resolve-model-bindings.js`,
`plugin/src/settings-write.js`, `plugin/src/executor-registry.js`.

- **`models-list [defaults.json] [executors-dir]`** — resolve plugin defaults <
  user (`~/.claude/settings.json`) < project (`.claude/settings.json`) < local
  (`.claude/settings.local.json`), all under the namespaced `"the-loop".modelBindings`
  key, printing the role table with per-role provenance. Registry validation is a
  hard gate: a binding naming an unregistered executor, or a model outside its
  playbook's `models` list, exits 1 with **no table**; guard warnings go to stderr
  and never fail. A role carrying both `agent` and `executor` is the ADR-0050 named
  configuration gap.
- **`hooks-list`** — the full resolved inventory: every `HOOK_INVENTORY` family
  (interview, modelBindings, testHarness, lint, precommit, notification,
  artifactStores) with value/layer/provenance (`default|user|project|local|fallback`),
  plus the recorded bindings' `present/absent/opted-out` status (a heading scan of
  `docs/architecture.md` — stays a markdown scan; `plugin/src/recorded-bindings.js`
  is the reference).
- **`hooks-set <family> <layer> <json-value>`** — write one family's value to the
  stated settings layer under `"the-loop"`. The write is surgical: unrelated keys in
  the target file **byte-survive** (the JS reference edits the parsed tree and
  re-emits preserving the file's existing content — port the observable guarantee:
  every key outside `"the-loop".<family>` byte-identical before/after).
- **`executors-list [dir]`** — parse every playbook in the executors dir into the
  registry. The machine block becomes a fenced **json** block under the exact heading
  `## Machine block`; fields unchanged: `id` (must match filename), `command`,
  `models`, `worktree`, `invocation`, `availability`, `auth_smoke {run, expect}`,
  `concurrency`, optional `effort_flag`. Malformed block or duplicate id refuses
  naming the file. An absent dir is an empty registry, never an error.

## Layered-merge semantics to preserve exactly

- A missing settings file, or a present file missing the `"the-loop".<family>` key,
  is an *empty layer*, never an error; unparseable JSON in a present file is an error
  naming the file.
- `modelBindings` merges per-role maps; single-entry families treat an empty object
  as *unbound* (the layer is omitted) so an empty `{}` never wholesale-wins over
  lower layers — the `familyLayer` subtlety in `cli-commands.js`.
- Every family declares fallback-or-block behavior per `HOOK_INVENTORY`; unbound
  fallback families resolve with `provenance: "fallback"`.

## Touched surfaces

| Surface | Change |
|---|---|
| `cli/src/` | settings-layer reader, merge/provenance resolver, executor-registry parser (markdown heading scan + fenced json block), four commands |
| `test/oracle/` | config cases flip from pending to live (fixture settings trees + playbooks in both fence formats via the paired generator) |

## What a builder would otherwise guess

- `~` resolution: the user layer is `$HOME/.claude/settings.json`; tests override via
  `HOME` env — keep that override path working (the oracle sets `HOME` to fixture
  dirs).
- Default paths resolve relative to the *binary's* config home. The JS CLI derives
  `PLUGIN_ROOT` from `import.meta.url`; the Rust binary is on PATH with no plugin
  root — the plugin defaults (`config/model-bindings.json`, `config/hook-defaults.json`,
  `config/executors/`) must reach it explicitly. Design decision: the defaults ship
  **inside the binary** (`include_str!` of the same JSON files at build time) with the
  existing optional-path arguments still honored for fixtures; the files under
  `plugin/config/` remain the source of record until json-cutover moves them to
  `cli/config/` as build inputs. This removes the last runtime dependency on plugin
  files without changing observable behavior (the compiled-in bytes are the same
  files).
- `hooks-set` on a missing target file creates it with just the namespaced key —
  matching the JS writer.

## Acceptance (from the feature graph)

1. models-list: four-layer merge with provenance, JSON-equal on paired fixtures;
   exit 1 no-table on unregistered executor or out-of-playbook model.
2. hooks-list: full inventory + recorded-bindings status, JSON-equal on paired
   fixtures.
3. hooks-set: writes the stated layer under `"the-loop"`; unrelated keys byte-survive.
4. executors-list: fenced json machine blocks; malformed/duplicate refusal names the
   file.
