---
description: "the-loop's front door — states where the project stands and proposes the next action; /the-loop <phase> jumps straight to a phase"
argument-hint: "[phase]"
allowed-tools: Bash(node *), Bash(git *), Read, Workflow
---

## Context

- Requested jump (may be empty): `$ARGUMENTS`
- Orientation — machine truth from the feature graph:

!`node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js" orient 2>&1`

## /the-loop

State where the project stands (from the orientation JSON), propose the next action
as the recommended default, and wait for the human's confirm-or-override. Their
answer sets the scope; nothing outside it starts.

**Routes** — by proposal kind, or by explicit jump (`/the-loop frame|design|build|ship`):

- `onboard` → the `frame` skill (brain-dump → Brief), then the `design` skill. If a
  Brief already exists, resume at Design.
- `advance-frontier` / `build` jump → the launch leg below.
- `ship` → the `ship` skill.
- `repair` / `blocked` → name exactly what the orientation reports missing or
  invalid, propose the repair, and stop. Never guess forward.

## The launch leg

1. Confirm the scope: the dependency-ready frontier, or the human's subset.
2. Assemble and gate in one call:
   `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" launch --scope <id,id,…> [--target <ref>]`
   — it refuses with reasons on any gate failure (invalid graph, bad scope, broken
   model bindings). Don't work around a refusal; fix what it names or tell the human.
3. Call the Workflow: `scriptPath` = `$CLAUDE_PLUGIN_ROOT/workflows/inner-loop.js`,
   `args` = the snapshot JSON, verbatim.
4. Relay the BoundaryResult in plain prose, plus any `model-selection —` lines from
   the run log:
   - `completed` — merged and validated; nothing more to do.
   - `blocked` — each needs a human decision. Present the reason and options as
     questions, right here in the chat. Apply what the human decides with ordinary
     tools (edit the plan or the feature's design doc, adjust scope), then offer to
     relaunch — the loop re-derives state from git, so a re-run resumes where work
     stopped.
   - `stalled` — infrastructure hiccups; nothing recorded. A relaunch retries them.
   - `halted` — the run stopped (budget or environment); report the detail.

No status bookkeeping: the validators already updated the graph on the target, and
`git log` is the run history. `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" ledger` prints
the status story on demand.
