# configure — the hook inventory, its resolver, and the recommended-answer interview

**Status:** designed 2026-07-08 from `docs/briefs/configure-step-full.md` (ADR-0049;
replaces the `configure-step-full` backlog node together with `onboard`).

The settings-layer knob-turner: a `configure` skill (bare-verb family) plus the
`/begin configure` front-door jump. It shows every hook in the inventory with its
resolved value, layer, and provenance; interviews for anything the human wants to set
or change, one recommended answer per question; and persists each answer to a settings
layer under the namespaced `"the-loop"` key. Re-runnable at any time — a no-op pass
just prints the resolved table.

## The hook inventory

Phase-keyed. Two home channels (ADR-0049): settings layers for machine config;
`docs/architecture.md` recorded bindings for project truth with narrative weight.
Configure owns the settings side and *knows about* the recorded side (it reports
their presence/absence in the resolved view but never writes them — Design and
onboard do).

| Hook | Consumer phase | Settings key | Unbound behavior |
|---|---|---|---|
| interview skill | Define (and any interviewing surface) | `interview` | fallback: `grilling`, visible |
| model bindings | Plan/Build/Validate spawns | `modelBindings` (exists, ADR-0030) | fallback: session model, visible (exists) |
| test harness | Build/Validate | `testHarness` | fallback: detected convention, visible |
| lint | Build/Validate | `lint` | fallback: detected convention, visible |
| pre-commit | Build | `precommit` | fallback: none declared, visible |
| notification | run boundary / gates | `notification` | fallback: chat-only, visible |
| artifact stores | all doc-writing phases | `artifactStores` | fallback: local, visible |
| validation procedure | Validate | — (recorded binding) | recorded opt-out or blocked |
| release runbook | Release | — (recorded binding) | blocked — no guessed deploys |
| operations toolkit | Operate | — (recorded binding) | lazy retrofit (operate-tooling) |

Fallback-or-block is *declared per hook*, and the consuming phase checks its hooks as
a precondition — "can't run" (blocked, named gap) stays distinct from "ran and
failed."

## Key layout under `"the-loop"`

Sibling keys per family, whole-entry replacement per key within a layer (the
`modelBindings` per-role semantics are unchanged — its entries are roles; the new
families are single entries):

```jsonc
"the-loop": {
  "modelBindings": { "...": "unchanged (ADR-0030)" },
  "interview":   { "skill": "grilling" },
  "testHarness": { "commands": { "test": "npm test" }, "framework": "node:test",
                   "notes": "free-text conventions (layout, coverage expectations)" },
  "lint":        { "commands": ["npm run check"] },          // commands only — policy
                                                             // lives in the project's
                                                             // real lint config
  "precommit":   { "system": "none | husky | pre-commit | …",
                   "posture": "run-before-commit | rely-on-hook" },
  "notification": { "channel": "chat | push | <shell command>",
                    "events": ["run-end", "blocked", "gate"] },
  "artifactStores": { "briefs": "local", "designs": "local",
                      "features": "local", "runbooks": "local",
                      "rcas": "local", "calibration": "local" }
                      // any value may instead be { "system": "notion|confluence|
                      // linear|jira|…", …locator fields } — capture-only until
                      // ports-adapters-full lands the adapters
}
```

## The resolver

`src/resolve-model-bindings.js` generalizes: four layers — plugin defaults <
**user (`~/.claude/settings.json`)** < project < local — with provenance
`default | user | project | local | fallback`. One resolver serves every family;
`models-list` behavior is unchanged except for the new layer and stamp. The
defaults layer ships per family in `config/` (models exist; new families ship
their fallback defaults). The CLI reads the user layer from the home directory the
same tolerant way it reads project/local: a missing file or missing key is an
empty layer; unparseable JSON is an error naming the file.

A new CLI subcommand `hooks-list` (sibling of `models-list`) prints the full
resolved inventory — every settings family with value/layer/provenance plus the
recorded bindings' present/absent/opted-out status read from
`docs/architecture.md` headings.

## The interview

Recommended-answer posture throughout: detect, recommend, confirm. Detection reads
the repo (package.json scripts, lockfiles, CI workflows, lint configs,
husky/.pre-commit-config) and produces *recommendations only* — the human confirms
every write. Each answer states its inferred destination layer (personal →
user/local; project truth → project) and takes a per-answer override. Writes are
surgical JSON edits preserving unrelated keys in the target settings file.

Notification interviews also point at the harness-native knobs that partially cover
the same ground (`preferredNotifChannel`, push-notification settings, `Notification`
hooks) — those are the human's own harness settings; configure may write them at the
human's request, but the loop's own `notification` binding is what its surfaces
consult when relaying boundaries and gates.

## Interfaces touched

- `src/resolve-model-bindings.js` — layer list gains `user`; exported resolver
  generalizes to families (existing exports keep working: `resolveModels`,
  `bindingFor`, `EFFORTS`).
- `bin/cli-commands.js` — `readSettingsLayer` gains the user-scope path and a
  per-family accessor; new `hooks-list` subcommand; `buildModelsTable` reads the
  fourth layer.
- `plugin/skills/begin/SKILL.md` — `configure` joins the jump list.
- `skills/configure/SKILL.md` — new, bare-verb family.
- `skills/define/SKILL.md` — its "unless this project's configuration binds another
  interview skill" clause becomes real: read the resolved `interview` hook.
- Consuming surfaces (build/validate agents, release) read their hooks through the
  resolved table riding the execution context, mirroring how `args.models` rides
  today — the launch leg extends to carry the full hook table.

## Constraints

- Persistence is the namespaced `"the-loop"` key only — the sanctioned
  `userConfig`/`pluginConfigs` path is re-rejected with 2026-07-08 facts
  (ADR-0049); the `/doctor` unrecognized-fields warning is accepted and this doc
  is where that's documented.
- Plain ESM JS, no build step, `node:test`; pure-core/thin-CLI discipline (the
  resolver stays pure; file reads live in the CLI shell).
- Artifact-store bindings are capture-only: everything still reads/writes local
  `docs/` until `ports-adapters-full` (its dependency edge now points here).
- The recorded bindings in `docs/architecture.md` are never written by configure.

## Acceptance (mirrors the graph)

- `/begin configure` (or the skill directly) prints every inventory hook with
  resolved value, layer, and provenance, including recorded-binding status.
- An interview answer persists to its stated layer; a re-run shows the new value
  with updated provenance; unrelated settings keys byte-survive the write.
- The resolver merges defaults < user < project < local for every family;
  `models-list` output is unchanged apart from the new layer/provenance.
- An unbound hook behaves as declared: fallback families resolve with a visible
  fallback line; block families report the named gap.
- An artifact-store binding is captured per docs grouping, local default.
