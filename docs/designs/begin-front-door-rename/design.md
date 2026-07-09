# begin-front-door-rename — /the-loop → /begin, command → skill

## What this is

The front door — the stateful entry verb that states where the project stands and
proposes the next action — renames from `/the-loop` to `/begin` and moves from
`plugin/commands/the-loop.md` to `plugin/skills/begin/SKILL.md`. `plugin/commands/`
retires entirely (the front door was its only file). Behavior is frozen: this
intake changes name, form factor, and references — nothing about what the front
door does.

Two motivations, both the human's: the plugin is named `the-loop`, so the
fully-qualified command was `/the-loop:the-loop` — a namespace stutter — and
`begin` carries the intended semantic: you type `/begin` to begin a working
session, and the loop tells you what's next.

## Why a skill is now legal

ADR-0002 chose a command because commands were the surface with `!` dynamic
context injection — the load-bearing preamble that runs `status --json` and
injects machine truth before the model reads a word. That distinction has
dissolved upstream: custom commands are merged into skills, and the documented
`` !`<command>` `` inline form (recognized at start of line or after whitespace)
executes in SKILL.md identically — preprocessing before the model sees content.
Verified against the Claude Code docs 2026-07-08. Skills are a strict superset
(same slash invocation, same `allowed-tools` and `argument-hint`, plus invocation
control and supporting files), so nothing binds the front door to command form.

## The converted file

`plugin/skills/begin/SKILL.md`, body content-identical to today's
`plugin/commands/the-loop.md` apart from the name sweep. Frontmatter:

```yaml
---
name: begin
description: "the-loop's front door — begin a working session: states where the project stands and proposes the next action; /begin <phase> jumps straight to a phase"
argument-hint: "[phase]"
allowed-tools: Bash(node *), Bash(git *), Read, Workflow
---
```

- **No `disable-model-invocation`** — the front door stays model-invocable, as it
  is today.
- The orientation preamble survives verbatim (only the file hosting it moves):

  ```
  !`node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js" status --json 2>&1`
  ```

  It must keep the start-of-line inline form the docs require, and
  `${CLAUDE_PLUGIN_ROOT}` stays brace-wrapped (an existing test asserts this
  across skills).
- Body sweep inside the file: heading `## /the-loop` → `## /begin`; the jump
  syntax `/the-loop define|design|build|release|diagnose` → `/begin …`. CLI
  invocations (`bin/the-loop.js`) are untouched — the binary keeps its name.
- Description wording above is the proposal; final phrasing is authoring-time
  work under the write-skills pass (loop surface rules: self-contained body, no
  ADR/internal-doc references).

## Reference sweep — exact footprint

Rule (rename-sweep precedent): sweep every **living** surface; historical records
stay byte-identical. Historical = `docs/adr/` (one sanctioned exception below),
`docs/research/`, `docs/briefs/`, `docs/releases/`, `docs/bugs/`,
`docs/design/naming-map.md` (frozen map), and `eval/` (pinned corpus).

Living surfaces currently carrying slash-form `/the-loop` or the
`commands/the-loop.md` path:

- `plugin/skills/{define,design,diagnose,release}/SKILL.md` — descriptions
  ("…when /the-loop routes to …") + `design/SKILL.md` body line
  "`/the-loop` now sees a configured project".
- `plugin/workflows/execution-pipeline.js` — meta `whenToUse: 'Launched by
  /the-loop …'`. Meta must stay a pure literal on one physical line (the splice
  shape-gate depends on it); this edit touches only the whenToUse string.
- `plugin/src/propose-next-action.js` (comments, 3 sites) and
  `plugin/src/index.js` (comment) — code comments naming the front door.
- `docs/architecture.md` — the `/the-loop configure` jump mention.
- `docs/feature-graph.md` — the-loop-entry's title, plus `/the-loop` in the
  acceptance prose of diagnose, configure, run-presentation, and
  proposed-status. The graph describes the current system (status-enum-sweep
  precedent), so shipped rows sweep too.
- `docs/designs/` — every design doc naming `/the-loop` or
  `commands/the-loop.md`: the-loop-entry, diagnose, run-presentation,
  plugin-dir-restructure, proposed-status, configure, onboard, operate-tooling,
  ports-adapters-full. Path references become `plugin/skills/begin/SKILL.md`.
  Note: `ports-adapters-full/design.md` anticipates a `plugin/skills/the-loop/`
  path that never existed — correct it to `plugin/skills/begin/`.
- `test/skills-and-command-sweep.test.js` and `test/proposed-status.test.js` —
  both `read('plugin/commands/the-loop.md')`; repoint to
  `plugin/skills/begin/SKILL.md` and update prose/assertions that name the old
  path. Renaming the first file (its name says "command") is the builder's
  call — content correctness is what's gated.
- `docs/glossary.md` — no slash-form hits today; nothing to add (`begin` is a
  command name, not vocabulary — the ratchet records nothing).

## ADR-0002 amendment (the sanctioned historical-record exception)

No new ADR — the rename is cheaply reversible and fails the ADR bar. ADR-0002
gets one appended amendment note, the rest byte-identical:

> **Amended 2026-07-08 (begin-front-door-rename).** The entry verb is now
> `/begin`: the plugin name made the fully-qualified form `/the-loop:the-loop`,
> and "begin a working session" names the affordance. The command-vs-skill
> distinction this ADR assumed has dissolved upstream (custom commands merged
> into skills; `!` dynamic-context injection works in SKILL.md), so the front
> door now lives at `plugin/skills/begin/SKILL.md` and `plugin/commands/` is
> retired. Everything else here stands.

## Constraints

- One atomic landing: move + sweep + ADR note together, `npm test` and
  `npm run check` green on the landed tree.
- No behavior change to the front door body beyond the name sweep.
- No backward-compat stub for `/the-loop` — single user, clean cut (decided at
  Define).
- Out of scope: the plugin name (`"the-loop"` in plugin.json — the namespace
  prefix survives; fully-qualified form becomes `/the-loop:begin`) and the CLI
  binary `bin/the-loop.js`.

## Validation notes

- File-shape criteria are grep/test verifiable. The live-session criterion
  (typing `/begin` injects the status JSON; `/the-loop` no longer resolves)
  needs a harness session against the installed plugin — exercise it at the
  release gate's health check if the validator can't drive a session.
- Builder re-verifies before landing that no *programmatic* invocation of the
  command name exists (hooks, workflow scripts, manifests) — the design-time
  sweep found only prose references and the two test-file path reads.
