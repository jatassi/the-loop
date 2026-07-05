# the-loop — System design

**Status:** Living design artifact. Born 2026-06-29 (v1, ADR-0001–0033); rebuilt
2026-07-04 as v2 by the taming reset (**ADR-0034–0040** — read those seven before
touching any loop surface). Narrative and judgment live here and in
[features/](features/); the machine feature graph lives in [graph.md](graph.md);
vocabulary in [DICTIONARY.md](../dictionary/DICTIONARY.md). The founding principle
this system is measured against: **earns its context** — every component justifies
its token cost.

## What the-loop is

An owned, composable augmentation layer — built from native Claude Code primitives
(skills, subagents, commands, a Workflow) — that moves an idea through the full SDLC:
frame → design → build → validate → ship → operate → evolve. It ships as a
**plugin**; the artifacts it produces live in the **target repo** it operates on. Its
first job is to build itself (self-hosting: this checkout carries both the engine and
its artifacts; a run executes the code it launched with, so self-edits take effect on
the next run, and a bad self-edit is a git revert away).

## Operating model (ADR-0034)

**Kick off and check back.** The loop is autonomous *within* a run and assumes the
human is reachable at run boundaries. Durable state is exactly two things: **code
commits** and the **feature graph's status field** (`designed | validated |
shipped`). Everything in-flight — plans, task progress, blockage — is derived from
git at launch time (a plan is a file on the feature branch; a built task is a commit
with its subject prefix; a blocked feature is a question in the chat, answered and
re-run). There are no bookkeeping commits, no committed status projections, no filed
escalation records, and no crash-healing rituals: interrupted work is handled by
idempotent re-run from what git already holds.

## Architecture

### The CLI and the launch snapshot (ADR-0036/0038)

`bin/the-loop.js` is the one CLI over the artifacts. Its load-bearing command is
**`the-loop launch --scope <ids>`**: it gates everything mechanically (graph validity,
scope readiness, model-binding validity — refusing loudly replaces prose checklists)
and assembles the **launch snapshot** — per-feature design docs, plans read from
feature branches, git-derived task state, the model table, and the runtime-probe
binding — that the workflow consumes as `args`. Supporting commands: `graph`,
`check`, `set-status`, `ledger` (prints the status story to stdout; never written to
disk), `plan parse|check|task`, `worktree create|remove`, `models`, `executors`.

### The engine (ADR-0038)

The inner loop is a **Claude Code Workflow** (`workflows/inner-loop.js`): script =
brain, agents = hands. The script has no filesystem — it consumes the snapshot and
spawns agents; every repo-touching action is an agent's. It runs a **ready-set walk**
over the scoped subgraph: every feature whose dependencies are satisfied runs
concurrently; as each validates and merges, newly-ready dependents launch. Tasks
inside a feature schedule the same way — unordered tasks run in parallel worktrees;
footprint disjointness is the plan's bias, not law, and a textual conflict at any
merge point is resolved compose-and-prove — both sides' intents served, proven by
the merged suite going green — with only semantic conflicts blocking (ADR-0042).

**Three lanes** (chosen by the plan agent's sizing judgment): *small* — the whole
feature fits one agent comfortably; one build + one validate, no plan artifact.
*Standard* — real decomposition into task contracts. *Bypass* — trivial maintenance
never enters the loop; a human or session just commits it.

**Block typing**: a *feature-shaped* block (defective contract, semantic conflict,
failed criterion) surfaces as a `blocked` entry in the BoundaryResult — a question
for the human at the boundary. An *environment-shaped* block (broken tooling, dead
auth) or budget exhaustion **halts** the run. An agent death is a *stall* — nothing
recorded, re-run next pass.

### Worktrees everywhere (ADR-0038)

The main checkout belongs to the human and is never touched by the loop. Every unit
of work runs in its own worktree under `.claude/worktrees/` (created and pruned by
`the-loop worktree`): plan agents write the plan on the feature branch `loop/<id>`; each
task gets branch `loop/<id>--<task>` cut from its dependency's tip (worktrees branch
off each other); the validator merges everything in a dedicated integration worktree
and publishes to the target by fast-forward — a natural mutex, serialized across
features. Branches carry the state; worktrees are disposable.

### Context architecture (ADR-0036)

Progressive disclosure, four layers: **role card** (the agent's ~2KB system prompt —
integrity rules that deviate from model priors, return shapes); **kernel** (pushed in
the prompt: the task contract, or for plan/validate the feature's design doc — the
one thing the job can't start without); **menu** (~5 lines naming what else is
fetchable and when to bother); **on-demand units** (artifacts addressable below file
granularity — `the-loop plan task` carves one contract out of a plan). No agent contract
says "read this whole file."

### The artifact set (ADR-0037)

| Artifact | Home | Nature |
|---|---|---|
| System design (this doc) | `docs/design/design.md` | living narrative + the two recorded bindings below |
| Feature graph | `docs/design/graph.md` | machine YAML; the durable state machine |
| Feature design docs | `docs/design/features/<id>.md` | one per feature; the context slice agents get |
| Plans | `docs/plans/<id>.md` **on the feature branch** | task contracts only; never merged — gone when the feature lands |
| Probe packs | `docs/probes/<id>.md` | written at validation; replayed at ship (their only replay point) |
| Ship records | `docs/ships/ship-N.md` | one short block per release |
| ADRs / Dictionary / Brief / research | `docs/adr/` etc. | decision + vocabulary spine; never auto-loaded |

### Roles and models (ADR-0030/0040)

`config/model-bindings.json` (< project < local settings overrides) binds spawn roles
— `plan`, `build.rote|standard|complex`, `drive`, `validate` — to models. Plan stamps
each task's **tier** (decision-density: how much is left to decide, not size); the
workflow routes `build.<tier>`. A tier bound `via` a registered executor spawns the
**drive** agent — a thin build variant that runs the CLI executor and verifies at the
same bar (tests, lint, footprint; one retry). Executors register as
`executors/<id>.md` playbooks; auth failures at use are ordinary environment halts —
there is no launch-time pre-flight.

## Key interface contracts

Cross-feature shapes, in prose (per-feature detail lives in the feature docs):

- **Feature node** — `{ id, title, status: designed|validated|shipped, depends_on,
  acceptance: [criterion], notes? }`. Ids are lowercase slugs; they become refs
  (`loop/<id>`) and paths.
- **Task contract** — `{ id, title, covers: [criterion-index], acceptance, footprint,
  size: xs|s|m, tier: rote|standard|complex, depends_on, wiring? }` in the plan's
  `## Tasks` yaml block with `feature:` and `design_version:`. No status, no reports
  — git carries task state (commit subject `"<feature>/<task>: …"` on branch
  `loop/<feature>--<task>`).
- **BoundaryResult** — `{ completed: [id], blocked: [{feature, reason, options}],
  stalled: [{feature, agent, note}], halted?: {reason: budget-exhausted|
  environment-blocked, detail}, budget: {spent, remaining} }`.
- **Model binding** — `{ <role>: { model | "session", effort?, via? } }`, resolved
  with provenance by `the-loop models`.
- **Runtime probe** — `bringUp → exercise(acceptance) → teardown`, recorded per
  project in the section below and passed verbatim into validate prompts.

## Non-goals

- Team/multi-developer workflows; a second adopter's genericity (the port/adapter
  inventory was retired with v1 — it returns when someone needs it).
- Unattended overnight operation: no provenance layer, no notification pipeline —
  walk-away is a later notification feature, not a per-step ceremony.
- Process auditability beyond git: nobody audits booking trails; `git log` is the run
  history.

## Error posture

Fail closed and loudly, repair by re-run: gates refuse with reasons before anything
runs; validators treat "can't tell" as deviation; failed features leave their
branches for inspection; nothing self-heals by writing state — re-running derives
fresh truth from git. The one synchronous gate is Ship's human approval.

## Runtime probe

The fixture-repo probe (this repo's own binding): validation exercises the CLI
from the outside, as a user would — never in-process imports.

- **Bring up**: `node bin/probe-fixture.js` — creates a temp git repo seeded as a
  plausible v2 target repo (graph.md + design.md + feature docs, committed) and
  prints its path. `node bin/probe-fixture.js empty` seeds the bare cold-start
  variant.
- **Exercise**: shell steps driving `node <plugin-root>/bin/the-loop.js …` and
  `node <plugin-root>/bin/the-loop.js orient` against the fixture repo (cwd = the
  fixture), asserting on printed JSON and exit codes. Sparing headless `claude -p`
  invocations are sanctioned for agent-pack surfaces, and are the first thing shed
  under time pressure.
- **Teardown**: `rm -rf` the printed path.

## Ship recipe

Ready checks: `npm test` and `npm run check` green at the pinned tip; replay every
`docs/probes/*.md` for the shipping features.

Deploy (marketplace-on-main; each command idempotent, run from the repo root):

```sh
claude plugin marketplace add "$PWD" && claude plugin marketplace update the-loop && claude plugin install the-loop@the-loop --scope user && claude plugin update the-loop@the-loop --scope user
```

Operational lore: `install` covers the bootstrap and **never upgrades** (no-ops at
the installed version); `update` covers the upgrade, requires the full
`plugin@marketplace` id, and fails on a not-yet-installed plugin — so the chain runs
both, each a benign no-op in the other's state (both paths observed 2026-07-04).

Health check:

```sh
node -e 'const cp=require("child_process");const v=require("./.claude-plugin/plugin.json").version;const l=JSON.parse(cp.execSync("claude plugin list --json",{encoding:"utf8"}));const e=l.find(x=>x.id==="the-loop@the-loop");if(!(e&&e.enabled&&e.version===v))process.exit(1);cp.execSync("claude plugin details the-loop@the-loop",{stdio:"ignore"})'
```

Rollback: `claude plugin uninstall the-loop@the-loop --scope user` (removes the
just-deployed version — the safe state; recovery from there is human-verified). The
rollback pointer for code is the previous `ship-N` tag. Note: the health check fails
by design after a rollback (the plugin is gone) — that reads as
`rollback_verified: false`, the correct "needs human eyes" signal, and a restart is
required before a live session runs the new version.
