---
description: "the-loop's front door — states where the project stands and proposes the next action; /the-loop <phase> jumps straight to a phase"
argument-hint: "[phase]"
allowed-tools: Bash(node *), Read
---

## Context

- Requested jump (may be empty): `$ARGUMENTS`
- Orientation — machine truth from the project's feature graph:

!`node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js" orient 2>&1`

## /the-loop — the project's front door

State where the project stands, propose the next action, and wait. Three hard rules:

1. **State the inferred position before doing anything else.** The human always sees
   where you think the project stands and why.
2. **The proposal is a handshake.** Offer it as the recommended default; the human
   confirms or overrides, and their answer sets the scope of what runs — nothing
   outside it starts.
3. **Never improvise a missing adapter.** If a phase's skill isn't available in this
   installation, say the route is decided but the adapter is missing, and stop.

### Branch on `mode`

(If the orientation above isn't JSON, run
`node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js" orient` yourself and diagnose from its
stderr before branching.)

**`cold-start`** — nothing to resume: this is onboarding, not an error. Say so, then
walk the three legs, one question at a time, each with a recommended default the human
can accept or override:

1. **Configure (minimal)** — confirm the baked-in defaults: artifacts live in named
   directories under `docs/`; the test harness is the project's native test command.
   Runtime, deploy, and observability choices are deferred until their phase nears.
2. **Frame** — route to the Frame skill (a brain-dump becomes a Brief).
3. **Design** — the Brief flows into the Design skill.

**`active`** — a live project. Read `docs/ledger/ledger.md` for the story (what is
this / where are we / what needs you / what's next), then report:

- **Position** — from the orientation JSON. The feature graph is the source of truth;
  if the Ledger disagrees with it, trust the JSON and flag the Ledger as stale.
- **What needs the human** — every id in `parked`, each with its recommendation, first.
- **The proposal** — the default next action. If `frontier` is non-empty alongside
  parked items, offer both: decisions unblock parks; the frontier can advance
  meanwhile.

**`partial`** — a half-configured project. Name exactly what `missing` lists, propose
a repair (finish the interrupted Design, or restore the file from git history), and do
not guess forward.

### Explicit jumps — `/the-loop <phase>`

Orient and state position first, then route: `frame` → the Frame skill · `design` →
the Design skill · `plan` / `build` / `validate` → the inner-loop Workflow · `ship` →
Ship · `config` → `/loop-config`.

### Proposal kinds

`onboard` route to onboarding · `resolve-parked` parked escalations need decisions ·
`advance-frontier` run the dependency-ready features · `ship` the validated frontier
awaits the human gate · `new-intake` everything is shipped; bring the next idea ·
`repair` artifacts missing or graph invalid · `blocked` unreachable on a valid graph —
treat as repair.
