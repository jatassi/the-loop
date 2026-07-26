---
name: interactive-execution
description: "Run a human-attended feature — one the graph marks `\"execution\": \"interactive\"` — as a working session: resolve the scope, assemble its execution context, build it turn by turn with the human in a worktree, then hand it to the validate agent. Use when the human wants to work a feature together rather than have it built unattended, when attended work is waiting, or when another loop surface routes an interactive feature here."
argument-hint: "[feature-id]"
allowed-tools: Bash(the-loop *), Bash(git *), Read, Write, Edit, Agent
---

# Interactive execution — attended scope → session → verdict

Some features cannot be finished unattended: their acceptance is a set of rulings, or
the answer is a matter of taste, or a fork is still open. The graph marks those
`"execution": "interactive"` and they never enter the unattended queue. This surface
runs one of them as a session — the human makes every judgment the feature exists to
collect, the agent does the reading, drafting, and mechanical edits, and the result gets
the same independent validation as anything else.

- Requested scope (may be empty): `$ARGUMENTS`

**Missing binary posture.** A bare `the-loop` call that comes back command-not-found is
an environment-shaped halt: report it and hand the human the install one-liner (re-run it
if a newer plugin expects a command the installed binary lacks; there is no version
handshake).

```sh
curl -LsSf https://github.com/jatassi/the-loop/releases/latest/download/the-loop-installer.sh | sh
```

## 1 · Settle the scope

- **An id came in with the invocation.** That id is the scope, as given.
- **Nothing came in.** Run `the-loop status --json` and read `interactiveReady` — the
  dependency-ready features marked interactive. An empty `interactiveReady` is the whole
  answer: say so and stop here. Deciding what else the project could do next belongs to
  whoever asked.

One feature per session — an attended run is a conversation, and two at once splits the
human's attention across two sets of judgments. If `interactiveReady` names several, ask
which one and park the rest.

Then branch on where this invocation came from, because the human gate travels with the
session:

- **The human typed this invocation** — naming this skill themselves, with or without an
  id. The confirm is already given: start it as stated, with no route re-proposed and no
  second ask.
- **A model reached for it** — a routed proposal, a hand-off from another loop surface,
  any invocation the human didn't type. Present the resolved scope and the target branch,
  and wait for the human's confirm before step 3.

## 2 · Resolve the target branch

`--target-branch` is required: name the target branch explicitly — the branch the session
is working on, unless the design narrative names another. Never pass a target branch the
checkout's artifacts didn't come from.

## 3 · Assemble the execution context

```
the-loop prepare-execution-context --features <id> --target-branch <ref> --interactive
```

`--interactive` selects the attended door: the same assembly an unattended run gets,
gated the same way, minus the workflow splice. What it prints is your working context for
the whole session — the feature's title and acceptance criteria, its design doc, the
validation-procedure binding, the resolved commit gate, and the target.

The flag selects a door; it does not loosen one. The command refuses with reasons on any
gate failure — invalid graph, bad scope, a `proposed` feature, broken model bindings —
and an id that is *not* marked interactive is refused here by name, with the refusal
pointing at the unattended launch surface. Don't work around a refusal; fix what it names
or tell the human.

## 4 · Work the session

```
the-loop worktree-create loop/<id> --base-branch <target>
```

Work only in that worktree, turn by turn with the human. Never edit the main checkout.

- **Every judgment the feature exists to collect is the human's.** Put each open
  question to them and apply the answer. Never infer a ruling because it seems obvious,
  and never batch a run of them into one confident sweep — that sweep is exactly what the
  marker exists to prevent.
- **The acceptance criteria are still the contract.** Where a criterion is testable,
  it still gets a test, red before green. Where it is a ruling, the record of the ruling
  is the evidence.
- **Commit as the work lands**, subject `<id>/feature: <what landed>` — the existing
  small-path convention, no new one. Several commits across a long session are fine —
  the validate leg collapses them when it lands the feature.
- Nothing goes to the target branch from here. The session branch is the deliverable.

## 5 · Hand to validate

When the human calls it done, spawn the ordinary `validate` agent against `loop/<id>`.
Interactive means the human owned the building, not that the feature skips its
independent look: same criteria, same fresh eyes, same landing.

Fill the agent's prompt from the execution context you already have:

- feature id and title
- the target branch, and the integration worktree command
  `the-loop worktree-create integrate--<id> --base-branch <target>`
- merge, in order: `loop/<id>`
- cli: `the-loop`
- the acceptance criteria to judge
- the validation-procedure binding (or that none was recorded, so the runtime leg is
  skipped and said so)
- the feature design doc the context carries

**Pass the fields, not the procedure.** How the validator merges, judges, and lands is
its own protocol and lives on the validate agent definition; restating a shortened
version of it here would put a second, drifting copy in front of the agent. This is the
same thin field injection an unattended run performs — a second caller of one contract.

Then relay the verdict in plain prose:

- **validated** — it landed on the target and the graph moved; nothing more to do. Remove
  the session worktree (`the-loop worktree-remove loop/<id>`); the branch survives.
- **blocked, kind `feature`** — a decision for the human. Present the reason and options
  as questions right here in the chat, apply what they decide in the session worktree,
  commit, and spawn the validator again.
- **blocked, kind `environment`** — something broken around the run. Report what the
  validator observed and what it needs.
