---
name: begin
description: "the-loop's front door — begin a working session: states where the project stands and proposes the next action; /begin <phase> jumps straight to a phase"
argument-hint: "[phase]"
allowed-tools: Bash(node *), Bash(git *), Read, Workflow
---

## Context

- Requested jump (may be empty): `$ARGUMENTS`
- Orientation — machine truth from the feature graph:

!`node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js" status --json 2>&1`

## /begin

State where the project stands (from the orientation JSON), propose the next action
as the recommended default, and wait for the human's confirm-or-override. Their
answer sets the scope; nothing outside it starts.

**Routes** — by proposal kind (fed by the status's `unconfigured` / `partial` /
`configured` project state), or by explicit jump (`/begin define|design|build|release|diagnose`):

- `onboard` → the `define` skill (brain-dump → brief), then the `design` skill. If a
  brief already exists, resume at Design.
- `advance-eligible-set` / `build` jump → the prepare-execution-context leg below.
- `design` → the `design` skill, amending the design for the named ids (a proposed
  feature blocking stuck work, or the whole proposed backlog when nothing else is
  actionable) — write their design docs and acceptance, flipping them to designed.
- `release` → the `release` skill.
- `new-intake` → ask what kind of intake this is. A bug — observed behavior
  deviating from contract, the *why* needing diagnosis — routes to the `diagnose`
  skill; an idea whose *what* needs sharpening routes to `define`; an obvious small
  tweak is an amendment directly; an idea worth keeping but not designing now is
  parked as a `proposed` record by amendment instead.
- `repair` / `blocked` → name exactly what the orientation reports missing or
  invalid, propose the repair, and stop. Never guess forward.

## The prepare-execution-context leg

1. Confirm the scope: the dependency-ready eligible set, or the human's subset.
2. Assemble, gate, and splice in one call:
   `node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js" prepare-execution-context --features <id,id,…> --target-branch <ref> --script-out <session-scratch path>`
   — `--target-branch` is required: name the target branch explicitly — the branch
   the session is working on, unless the design narrative names another. Never
   pass a target branch the checkout's artifacts didn't come from. `--script-out`
   names any writable session-scratch path; the command writes a launch-ready copy
   of the canonical `workflows/execution-pipeline.js` there, its `meta` description
   spliced to name this run's scope and target (the harness persists each
   invocation's own script for resume, so the scratch copy needs no teardown). The
   command refuses with reasons on any gate failure (invalid graph, bad scope,
   broken model bindings, or a malformed canonical script). Don't work around a
   refusal; fix what it names or tell the human.
3. Call the Workflow: `scriptPath` = the `--script-out` path from step 2 — never
   the canonical `workflows/execution-pipeline.js` directly, since its description
   is spliced fresh per run — `args` = the execution context JSON, verbatim.
4. Relay the run summary in plain prose, plus any `model-selection —` lines from
   the run log:
   - `completed` — merged and validated; nothing more to do.
   - `blocked` — each needs a human decision. Present the reason and options as
     questions, right here in the chat. Apply what the human decides with ordinary
     tools (edit the plan or the feature's design doc, adjust scope), then offer to
     relaunch — the loop re-derives state from git, so a re-run resumes where work
     stopped.
   - `stalled` — infrastructure hiccups; nothing recorded. A relaunch retries them.
   - `halted` — the run stopped (budget or environment); report the detail.

No status bookkeeping: the validators already updated the graph on the target branch,
and `git log` is the run history. `node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js" status`
prints the status story on demand.
