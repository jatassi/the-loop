---
name: begin
description: "the-loop's front door — begin a working session: states where the project stands and proposes the next action; /begin <phase> jumps straight to a phase"
argument-hint: "[phase]"
allowed-tools: Bash(the-loop *), Bash(node *), Bash(git *), Read, Workflow
---

## Context

- Requested jump (may be empty): `$ARGUMENTS`
- Orientation — machine truth from the feature graph:

!`the-loop status --json 2>&1`

**Missing binary posture.** Surfaces that shell to bare `the-loop` and get
command-not-found treat that as an environment-shaped halt — never a silent
fallback. The remedy is the install one-liner (re-run it if a newer plugin
expects a command the installed binary lacks; there is no version handshake):

```sh
curl -LsSf https://github.com/jatassi/the-loop/releases/latest/download/the-loop-installer.sh | sh
```

## /begin

State where the project stands (from the orientation JSON), propose the next action
as the recommended default, and wait for the human's confirm-or-override. Their
answer sets the scope; nothing outside it starts. The orientation JSON above IS
`the-loop status --json` — never re-run `status` (or re-read the graph) to restate
it; fetch feature bodies only once the chosen route needs them.

**Routes** — by proposal kind (fed by the status's `unconfigured` / `partial` /
`configured` project state), or by explicit jump (`/begin onboard|define|design|build|release|diagnose|configure`):

- `onboard` → the `onboard` skill — it runs the configure leg (environment and
  personal hooks), branches by scenario (greenfield hands off straight to Define →
  Design; brownfield runs assess-and-fill first), then hands off. If a brief already
  exists, resume at Design.
- `advance-eligible-set` / `build` jump → the `execute` skill, handed the scope (the
  eligible set, or the human's subset) and the target branch — it assembles the
  execution context, launches the pipeline, and relays the run summary. It presents
  the resolved scope and waits for the human's confirm before launching.
- `advance-interactive` → the `interactive-execution` skill, handed the id (the
  attended-ready feature, or the human's pick) and the target branch — a feature marked
  `"execution": "interactive"` is built with the human in a session rather than
  unattended, then validated the ordinary way. `interactiveReady` rides the orientation
  JSON whatever the proposal is, so when another route wins and that set is non-empty,
  say that attended work is also waiting.
- `design` → the `design` skill, amending the design for the named ids (a proposed
  feature blocking stuck work, or the whole proposed backlog when nothing else is
  actionable) — write their design docs and acceptance, flipping them to designed.
- `release` → the `release` skill.
- `configure` → the `configure` skill — review the resolved hook inventory and, on the
  human's confirmation, persist settings answers. A bare `configure` jump just prints
  where configuration stands.
- `new-intake` → ask what kind of intake this is. A bug — observed behavior
  deviating from contract, the *why* needing diagnosis — routes to the `diagnose`
  skill; an idea whose *what* needs sharpening routes to `define`; an obvious small
  tweak is an amendment directly; an idea worth keeping but not designing now is
  parked as a `proposed` record by amendment instead.
- `repair` / `blocked` → name exactly what the orientation reports missing or
  invalid, propose the repair, and stop. Never guess forward.

## Bound artifact stores

Resolve `artifactStores.features` (it rides the `hooks-list` inventory) before the
orientation. `local` — the default — means everything above runs unchanged against
`docs/feature-graph.json`. A **nondefault** binding means the feature graph is not an
in-repo file at all. **Before any graph read, read `bound-stores.md` — it ships with
this plugin at `../../shared/bound-stores.md`, relative to this skill's own
directory — and follow it.** It carries the snapshot protocol, the `--graph-path`
routing, surface-first status writes, and the can't-run posture for an unreachable
surface.
