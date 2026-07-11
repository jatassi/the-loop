---
name: begin
description: "the-loop's front door — begin a working session: states where the project stands and proposes the next action; /begin <phase> jumps straight to a phase"
argument-hint: "[phase]"
allowed-tools: Bash(node *), Bash(git *), Read, Workflow
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
- `advance-eligible-set` / `build` jump → the prepare-execution-context leg below.
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

## Bound artifact stores — when the feature graph lives on an external surface

Resolve `artifactStores.features` (it rides the `hooks-list` inventory) before the
orientation and the launch leg. When it resolves `local` — the default — everything
above and below runs unchanged against `docs/feature-graph.md`. When it resolves to a
**nondefault** binding, the feature graph is no longer an in-repo file: its records,
dependency edges, acceptance prose, and statuses are sole truth on the bound surface,
and both the status orientation and the launch leg run against an ephemeral snapshot
instead of the local file:

1. **Materialize the snapshot.** Follow `docs/adapters/features.md` — its Access
   section names the surface's shape (MCP server, CLI, …), the auth/workspace context,
   and the read calls — read the bound surface, and materialize the same YAML graph
   model as an ephemeral snapshot file under session scratch. The snapshot is
   gitignored, never committed, and torn down at run end (leave nothing behind, the way
   the loop sweeps its own temp files). Materialize it before any graph read.
2. **Point the subcommands at the snapshot.** Pass its path as `--graph-path` to every
   graph-consuming subcommand — `status`, `prepare-execution-context`, `set-status`,
   `check` — so the pure core runs against the snapshot while the default
   `docs/feature-graph.md` path stays untouched for local projects.
3. **Invert status writes — surface-first.** Where an unbound run would `set-status`
   on the file, a bound run updates the bound surface first (the mutate operation the
   adapter doc's Operations names), then refreshes the snapshot from it. Truth lands on
   the surface ahead of the cache, so a crash leaves truth ahead of the snapshot, never
   behind it.
4. **Tear the snapshot down** once the run — or the status leg — finishes.

**A bound-but-unreachable surface at use time is a can't-run, never a fallback.** If
the surface can't be reached when the snapshot must be materialized or a mutate
written, stop and report a can't-run naming the surface (e.g. `features is bound to
Linear and Linear is unreachable`). Never fall back to local `docs/feature-graph.md` —
a stale or absent local file would fork project truth. This is a surfaced can't-run,
distinct from a run that started and failed.

**Unbinding is a migration, not a settings toggle.** To return a bound project to
local, follow the adapter doc's caveats: export the surface's truth back to
`docs/feature-graph.md` — one final materialized snapshot, this time committed — then
remove the `artifactStores.features` pointer and the adapter doc. Once
`artifactStores.features` resolves `local` again, subsequent runs read the in-repo
graph and print a visible fallback line noting the feature graph is served from local
`docs/feature-graph.md`.

## The prepare-execution-context leg

1. Confirm the scope: the dependency-ready eligible set, or the human's subset.
2. Assemble, gate, and splice in one call:
   `the-loop prepare-execution-context --features <id,id,…> --target-branch <ref> --script-out <session-scratch path>`
   — `--target-branch` is required: name the target branch explicitly — the branch
   the session is working on, unless the design narrative names another. Never
   pass a target branch the checkout's artifacts didn't come from. `--script-out`
   names any writable session-scratch path; the command writes a launch-ready copy
   of the canonical `workflows/execution-pipeline.js` there, its `meta` description
   spliced to name this run's scope and target (the harness persists each
   invocation's own script for resume, so the scratch copy needs no teardown). On a
   bound project (nondefault `artifactStores.features`, per the section above) add
   `--graph-path <snapshot path>` so the context is assembled from the materialized
   snapshot rather than the local file, and the validator inherits that same snapshot
   path in its execution context. The command refuses with reasons on any gate failure
   (invalid graph, bad scope,
   broken model bindings, or a malformed canonical script). Don't work around a
   refusal; fix what it names or tell the human.
3. Call the Workflow: `scriptPath` = the `--script-out` path from step 2 — never
   the canonical `workflows/execution-pipeline.js` directly, since its description
   is spliced fresh per run. Pass **no `args`**: the spliced script embeds the
   execution context as a JS literal, and the Workflow `args` channel is lossy for
   large escaped JSON (it round-trips through the model's token stream and can
   silently corrupt nested escaped quotes).
4. Relay the run summary in plain prose, plus any `model-selection —` lines from
   the run log:
   - `completed` — merged and validated; nothing more to do.
   - `blocked` — each needs a human decision. Present the reason and options as
     questions, right here in the chat. Apply what the human decides with ordinary
     tools (edit the plan or the feature's design doc, adjust scope), then offer to
     relaunch — the loop re-derives state from git, so a re-run resumes where work
     stopped.
   - `stalled` — infrastructure hiccups; nothing recorded. A relaunch retries them.
   - `halted` — the run stopped (budget only); report the detail.

No status bookkeeping: the validators already updated the graph on the target branch,
and `git log` is the run history. `the-loop status`
prints the status story on demand.
