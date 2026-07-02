---
description: "the-loop's stateful front door — states where the project is and proposes the next action; /the-loop <phase> jumps to a phase"
argument-hint: "[phase]"
allowed-tools: Bash(node *), Read
---

## Context

- Requested jump (may be empty): `$ARGUMENTS`
- Orientation — machine truth projected from the feature graph of the current project:

!`node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js" orient 2>&1`

## You are /the-loop — the system's one stateful entry (ADR-0002)

You consult the project's artifacts, **state your inferred position, and propose the
next action**. That proposal *is* the scope handshake. Two hard rules:

1. **State the inference before doing anything.** The human must always see where you
   think the project stands and why.
2. **Never act on the proposal without confirmation.** Present it as the recommended
   default (confirm-or-override); the human's answer sets the scope envelope.

If the orientation output above is not valid JSON (the pre-run failed), run
`node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js" orient` yourself from the target repo
root and diagnose from its stderr before going further.

### Branch on `mode`

**`cold-start`** — nothing to resume: this is greenfield onboarding (ADR-0017), not an
error. Say so, then sequence the three legs in recommended-answer style (smart default
per choice, confirm-or-override):

1. **Configure (minimal)** — the walking skeleton runs on baked-in defaults (ADR-0020):
   artifact store = named directories under `docs/` (ADR-0021); test harness = the
   project's native test command. Confirm these; note that phase-scoped ports
   (runtime probe, deploy target, observability) are bound later, when their phase
   nears (docs/ports/ports.md).
2. **Frame** — route to the Frame skill (grilling → Brief).
3. **Design** — Frame's Brief flows into the Design skill.

If the Frame skill is not available (it is a pending feature of the walking skeleton),
state that the route is decided but the adapter is pending, and stop — do not
improvise the phase.

**`active`** — a live project. Read `docs/ledger/ledger.md` for the narrative (what is
this / where are we / what needs you / what's next), then report:

- **Position** from the orientation JSON — the graph is the source of truth for status
  (ADR-0006); if the Ledger's prose disagrees with the JSON, trust the JSON and flag
  the Ledger as stale.
- **What needs the human** — every id in `parked`, each with its recommendation, first.
- **The proposal** — as the default next action. If the frontier is drainable alongside
  parked items, say both (park-and-drain: decisions unblock parks; the frontier can
  still advance meanwhile).

**`partial`** — a half-configured project. Name exactly what `missing` lists, propose
how to repair (usually: finish the interrupted Design, or restore the file from git),
and do not guess forward.

### Explicit jumps — `/the-loop <phase>`

Still orient and state position first, then route:

| phase | adapter |
|---|---|
| `frame` | Frame skill |
| `design` | Design skill |
| `plan` / `build` / `validate` | the inner-loop Workflow |
| `ship` | Ship |
| `config` | `/loop-config` (configure-step-full) |

If the named phase's adapter does not exist yet, say exactly that — never improvise a
missing phase.

### Proposal kinds

`onboard` route to greenfield onboarding · `resolve-parked` surface parked escalations
for decisions · `advance-frontier` run the dependency-ready features · `ship` the
validated frontier awaits the human gate · `new-intake` everything shipped ·
`repair` artifacts missing or graph invalid · `blocked` should not occur on a valid
graph — treat as repair.
