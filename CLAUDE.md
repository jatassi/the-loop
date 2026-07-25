# the-loop 

A Claude plugin with an opinionated agent-assisted development workflow.

## Subagents

Always include the model name in subagent titles like this: `[Opus] Do the thing`, `[Sonnet] Do the less complex thing`, `[Fable] Do the complex thing`. This applies to Agent-tool spawns only — workflow-spawned agents skip the prefix, because the workflow UI already displays each agent's model.

## Workflow coherence

the-loop's phases hand off through durable artifacts, never through calls — so an
artifact's schema is a cross-phase interface, and changing one is never a local
change. Before landing a change to any loop artifact or phase, walk the phase
sequence end to end and rule on every surface: does it **produce** this, **consume**
it, or is it **unaffected**? "Unaffected" is an explicit ruling, not silence.

Producers are the half most often missed. A field that only consumers know about is
dead on arrival — nothing sets it, the gate fires on records nobody marked, and the
human learns to route around the gate.

## The shipped surface stands alone

`plugin/` is what a consuming project installs. It does not have this repo — no
`docs/adr/`, no `docs/glossary.md`, no `docs/architecture.md` of the-loop's. (A
consuming project's own `docs/architecture.md` describes *its* system, not this
tool.) Anything under `plugin/` that needs this repo to make sense is broken.

This repo is both the-loop's source and one of its users, and the two have different
reachable worlds. When authoring `plugin/`, the only external truth a surface may
lean on is the `the-loop` binary's behavior — never another document. Each shipped
surface states inline whatever its own reader needs to act. That self-containment is
not redundancy to be cut.

Test it: a bare `ADR-NNNN` number, or any reference to this repo's own layout or
design docs, found under `plugin/` is a defect. Note the distinction — a `docs/…`
path in a shipped surface is usually *correct*: it names the consuming project's own
artifacts (`docs/architecture.md`, `docs/feature-graph.json`, `docs/designs/`), which
the loop creates there. Same path, different repo. Read which world it points at.

## Git hygiene

Never modify files directly in the main checkout unless explicitly instructed by the user. Instead, isolate in a worktree before making changes. Once changes are complete and validated, ask the user's approval to merge back to main. Merge directly, do not ask to open GitHub PRs.