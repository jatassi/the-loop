---
name: execute
description: "Launch a scope through the-loop's execution pipeline and relay the run summary. Use when the human wants to run the fix just written up, launch or run the pipeline, build named features now, or execute the eligible set — or when another loop surface hands a scope off to be launched."
argument-hint: "[feature-id,feature-id,…]"
allowed-tools: Bash(the-loop *), Bash(git *), Read, Workflow
---

# Execute — scope → launch → run summary

The loop's launch surface: take a scope, assemble and gate its execution context,
launch the pipeline, relay what came back.

- Requested scope (may be empty): `$ARGUMENTS`

**Missing binary posture.** A bare `the-loop` call that comes back
command-not-found is an environment-shaped halt: report it and hand the human the
install one-liner (re-run it if a newer plugin expects a command the installed binary
lacks; there is no version handshake).

```sh
curl -LsSf https://github.com/jatassi/the-loop/releases/latest/download/the-loop-installer.sh | sh
```

## 1 · Settle the scope

- **A scope came in with the invocation.** Those ids are the scope, as given.
- **No scope came in.** Run `the-loop status --json` and take its `eligibleSet` — the
  dependency-ready features — as the scope. An empty `eligibleSet` is the whole
  answer: say so and stop here. This surface launches a scope; deciding what else the
  project could do next belongs to whoever asked. The eligible set already excludes
  human-attended features (those marked `"execution": "interactive"`), so a scope
  resolved here is unattended by construction — and a hand-typed attended id is refused
  by step 4's gate, naming the door it belongs to. (On a bound project — nondefault
  `artifactStores.features`, per the section below — this call takes `--graph-path`.)

Done when the scope is a concrete list of feature ids.

## 2 · Resolve the target branch

`--target-branch` is required: name the target branch explicitly — the branch the
session is working on, unless the design narrative names another. Never pass a target
branch the checkout's artifacts didn't come from.

## 3 · Confirm before launching

The human gate travels with the launch. Nothing scoped starts without a human confirm,
so branch on where this invocation came from:

- **The human typed this invocation** — naming this skill themselves, with or without
  a scope. The confirm is already given: Launch it as stated — straight to step 4,
  with no route re-proposed and no second ask.
- **A model reached for it** — a hand-off from another loop surface, a routed
  proposal, any invocation the human didn't type. Present the resolved scope and the
  target branch, and wait for the human's confirm before step 4.

## 4 · Assemble, gate, and splice — one call

```
the-loop prepare-execution-context --features <id,id,…> --target-branch <ref> --script-out <session-scratch path>
```

`--features` carries step 1's scope and `--target-branch` step 2's answer.
`--script-out` names any writable session-scratch path; the command writes a
launch-ready copy of the canonical execution-pipeline engine script there, its `meta`
description spliced to name this run's scope and target (the harness persists each
invocation's own script for resume, so the scratch copy needs no teardown). On a bound
project (nondefault `artifactStores.features`, per the section below) add
`--graph-path <snapshot path>` so the context is assembled from the materialized
snapshot rather than the local file, and the validator inherits that same snapshot path
in its execution context.

The command refuses with reasons on any gate failure — invalid graph, bad scope, a
`proposed` feature in scope, broken model bindings, or a malformed canonical script —
and prints nothing to stdout on refusal. Don't work around a refusal; fix what it names
or tell the human.

## 5 · Launch the pipeline

Call the Workflow: `scriptPath` = the `--script-out` path from step 4 — never the
canonical engine script directly, since its description is spliced fresh per run. Pass
**no `args`**: the spliced script embeds the execution context as a JS literal, and the
Workflow `args` channel is lossy for large escaped JSON (it round-trips through the
model's token stream and can silently corrupt nested escaped quotes).

## 6 · Relay the run summary

Report the outcome in plain prose, plus any `model-selection —` lines from the run log:

- `completed` — merged and validated; nothing more to do.
- `blocked` — each needs a human decision. Present the reason and options as
  questions, right here in the chat. Apply what the human decides with ordinary
  tools (edit the plan or the feature's design doc, adjust scope), then offer to
  relaunch — the loop re-derives state from git, so a re-run resumes where work
  stopped.
- `stalled` — infrastructure hiccups; nothing recorded. A relaunch retries them.
- `halted` — the run stopped (budget only); report the detail.

No status bookkeeping: the validators already updated the graph on the target branch,
and `git log` is the run history. `the-loop status` prints the status story on demand.

## Bound artifact stores

Resolve `artifactStores.features` (it rides the `hooks-list` inventory) before step 1.
`local` — the default — means every step above runs unchanged against
`docs/feature-graph.json` and passes no `--graph-path`. A **nondefault** binding means
the feature graph is not an in-repo file at all. **Before any graph read, read
`bound-stores.md` — it ships with this plugin at `../../shared/bound-stores.md`,
relative to this skill's own directory — and follow it.** It carries the snapshot
protocol, the `--graph-path` routing (here: `status` in step 1,
`prepare-execution-context` in step 4), and the can't-run posture for an unreachable
surface.
