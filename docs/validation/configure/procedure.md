# configure — validation runbook record

Fixture-repo runbook (this repo's own binding): the CLI exercised from the outside
as a user would — never in-process imports. `/begin configure` / the configure skill
are agent-pack surfaces; under the sanctioned shed for time pressure their behavior
was judged by (a) the skill text's hard requirement to run `hooks-list` first and
(b) live `hooks-list` / `hooks-set` / `models-list` subprocess exercises against
throwaway fixtures. No `claude -p` invocation was run.

## Bring-up

```
node bin/create-sample-repo.js
# also: node bin/create-sample-repo.js empty
```

Printed a temp git repo path (`loop-probe-*` under the OS temp root) seeded as a
populated v2 target (feature-graph + architecture + design docs, committed). Empty
variant used for unbound recorded-binding gaps. Every CLI invocation used an
isolated `HOME` (`mktemp -d`) so real `~/.claude/settings.json` never participated.

Plugin binary:

```
node <plugin-root>/plugin/bin/the-loop.js …
```

with cwd = the fixture (or a throwaway mini dir for partial architecture.md cases).

## Exercise

1. **Criterion 1 — inventory print (value / layer / provenance + recorded status).**
   ```
   HOME=$HOME_ISO node "$BIN" hooks-list   # cwd = populated sample
   ```
   Exit 0. JSON body carried all seven settings families
   (`artifactStores`, `interview`, `lint`, `modelBindings`, `notification`,
   `precommit`, `testHarness`) each with resolved content and a `provenance` stamp
   in `default | user | project | local | fallback` (the stamp is the layer identity;
   no separate `layer` field — same posture as historical `models-list`).
   `recordedBindings` reported
   `validationRunbook: present`, `releaseRunbook: present`,
   `operationsToolkit: absent` with gap `lazy retrofit (operate-tooling)` on the
   sample's architecture.md. Fresh install (empty cwd, empty HOME) showed
   shipped defaults (`interview`/`precommit`/`notification`/`artifactStores` →
   `default`) and visible fallbacks (`testHarness`/`lint` →
   `{ value: "detected-convention", provenance: "fallback" }`).
   Skill surface: `plugin/skills/configure/SKILL.md` runs
   `!node … hooks-list` as step 1; `plugin/skills/begin/SKILL.md` routes
   `/begin configure` → configure skill. Suite:
   `test/configure-skill.test.js`, `test/cli-hooks.test.js` hooks-list cases.

2. **Criterion 2 — interview answer → named layer under `"the-loop"`, override,
   byte-survive.**
   Pre-seeded `.claude/settings.json` with quirky-format `permissions`, `env`, and a
   sibling `the-loop.modelBindings` entry, then:
   ```
   node "$BIN" hooks-set interview project '{"skill":"custom-interview"}'
   node "$BIN" hooks-set interview local '{"skill":"local-only"}'
   node "$BIN" hooks-list
   ```
   Project write landed under `"the-loop".interview`; exact substrings for
   `permissions` / `env` / sibling `modelBindings` survived byte-for-byte; re-read
   after the local write showed `{ skill: "local-only", provenance: "local" }`
   (per-answer destination override via the layer argument). Suite:
   `test/cli-hooks.test.js` hooks-set cases, `test/settings-write.test.js`.

3. **Criterion 3 — four-layer merge for every family; models-list shape.**
   Bound `lint` in user (`HOME/.claude/settings.json`), then project, then local;
   bound `testHarness` only in user; re-ran `hooks-list` and `models-list` after
   each step. Observed: user beats defaults, project beats user, local beats
   project for single-entry families; `models-list` still prints the role table with
   per-role `{ model, …, provenance }` and accepts the new `user` provenance when
   only the user layer binds a role (project/local still win when set). Suite:
   `test/resolve-model-bindings.test.js` four-layer + `resolveFamily` cases,
   `test/cli.test.js` models-list user-layer cases.

4. **Criterion 4 — unbound fallback / block (named gap).**
   Empty fixture + empty HOME: `testHarness`/`lint` → visible fallback line;
   recorded bindings all `absent` with release gap `blocked — no guessed deploys`
   and operations gap `lazy retrofit (operate-tooling)` (stderr warned missing
   architecture.md). Throwaway architecture with only `## Validation runbook`
   present: validation `present`, release/ops `absent` with named gaps; body
   `none` under release → `opted-out`. Synthetic settings-layer block family
   (`exampleBlock`) is unit-tested in the pure resolver and intentionally omitted
   from `hooks-list` output. Suite: `test/cli-hooks.test.js`,
   `test/recorded-bindings.test.js`,
   `test/resolve-model-bindings.test.js` unbound fallback/block case.

5. **Criterion 5 — artifactStores capture per docs grouping, local default.**
   Fresh install: all six groupings (`briefs`, `designs`, `features`, `runbooks`,
   `rcas`, `calibration`) resolve to `"local"` with `provenance: "default"`.
   ```
   node "$BIN" hooks-set artifactStores project \
     '{"briefs":"local","designs":{"system":"notion","db":"x"},…}'
   node "$BIN" hooks-list
   ```
   Read back with `provenance: "project"`, non-local capture shape preserved for
   `designs`. Capture-only — no adapter I/O attempted. Suite:
   `test/cli-hooks.test.js` artifactStores project-bound case.

## Expected observations (replay)

| Step | Exit | Observable |
|---|---|---|
| `hooks-list` fresh HOME, empty cwd | 0 | 7 families; fallbacks for lint/testHarness; recordedBindings absent (+ stderr warn if no architecture.md) |
| `hooks-set <family> <layer> <json>` | 0 | `{ family, layer, file, value }`; file under `"the-loop"` |
| `hooks-set` into pre-seeded settings | 0 | unrelated keys byte-identical; sibling families intact |
| `hooks-list` after local override | 0 | winning layer's value + matching provenance |
| `models-list` with user/project/local | 0 | role table; provenance stamps include `user` when applicable |
| suite / lint | 0 | `npm test` all pass; `npm run lint` clean |

## Integrity gates (this validation)

- Diff against `main` (`eb7d1d8…`): no `eslint-disable` added in plugin/test source;
  no lint-config edit; `cli.test.js` line reduction is compression/refactor, not
  deleted coverage (user-layer models-list tests added; prepare-execution-context
  key list extended to include `hooks`).
- `npm test` → 208 pass / 0 fail; `npm run lint` → clean.
- Subprocess CLI tests in `test/cli-hooks.test.js` bite the new surface (write,
  byte-survive, list defaults/fallbacks, recorded status, artifactStores readback).

## Teardown

```
rm -rf <printed-sample-path> <printed-empty-path> <isolated-HOME-dirs> <throwaway-arch-dirs>
```

No tracked files in the integration worktree were modified except this runbook.
