# the-loop — Architecture

**Status:** Living design artifact. Born 2026-06-29 (v1, ADR-0001–0033); rebuilt
2026-07-04 as v2 by the taming reset (**ADR-0034–0040** — read those seven before
touching any loop surface). Narrative and judgment live here and in
[designs/](designs/); the machine feature graph lives in
[feature-graph.md](feature-graph.md); vocabulary in [glossary.md](glossary.md). The
founding principle this system is measured against: **earns its context** — every
component justifies its token cost.

## What the-loop is

An owned, composable augmentation layer — built from native Claude Code primitives
(skills, subagents, commands, a Workflow) — that moves an idea through the full SDLC:
define → design → build → validate → release → operate, with post-release intakes
re-entering through three channels (define, amendment, diagnose — see Intake
channels below). It ships as a
**plugin**; the artifacts it produces live in the **target repository** it operates
on. Its first job is to build itself (self-hosting: this checkout carries both the
execution pipeline and its artifacts; a run executes the code it started with, so
self-edits take effect on the next run, and a bad self-edit is a git revert away).

## Operating model (ADR-0034)

**Kick off and check back.** The loop is autonomous *within* a run and assumes the
human is reachable at run boundaries. Durable state is exactly two things: **code
commits** and the **feature graph's status field** (`designed | validated |
shipped`). Everything in-flight — plans, task progress, blockage — is derived from
git at run start (a plan is a file on the feature branch; a built task is a commit
with its subject prefix; a blocked feature is a question in the chat, answered and
re-run). There are no bookkeeping commits, no committed status projections, no filed
escalation records, and no crash-healing rituals: interrupted work is handled by
idempotent re-run from what git already holds.

## Architecture

### The CLI and the execution context (ADR-0036/0038)

`bin/the-loop.js` is the one CLI over the artifacts. Its load-bearing command is
**`the-loop prepare-execution-context --features <ids>`**: it gates everything
mechanically (graph validity, scope readiness, model-binding validity — refusing
loudly replaces prose checklists) and assembles the **execution context** —
per-feature design docs, plans read from feature branches, git-derived task state,
the model table, and the validation-runbook binding — that the workflow consumes as
`args`. Supporting commands: `list`, `check`, `set-status`, `status` (prints the
status story to stdout, `--json` for the machine orientation; never written to
disk), `plan parse|check|task`, `worktree-create|worktree-remove`, `models-list`,
`executors-list`.

### The execution pipeline (ADR-0038)

The execution pipeline (nicknamed "the engine") is a **Claude Code Workflow**
(`workflows/execution-pipeline.js`): script = brain, agents = hands. The script has
no filesystem — it consumes the execution context and spawns agents; every
repo-touching action is an agent's. It runs a **concurrency policy** over the scoped
subgraph: every feature whose dependencies are satisfied runs concurrently; as each
validates and merges, newly-ready dependents start. Tasks inside a feature schedule
the same way — unordered tasks run in parallel worktrees; footprint disjointness is
the plan's bias, not law, and a textual conflict at any merge point is resolved by
the **test-gated merge policy** — both sides' intents served, proven by the merged
suite going green — with only semantic conflicts blocking (ADR-0042).

**Three workflow paths** (chosen by the plan agent's sizing judgment): *small* — the
whole feature fits one agent comfortably; one build + one validate, no plan
artifact. *Standard* — real decomposition into task contracts. *Bypass* — trivial
maintenance never enters the loop; a human or session just commits it.

**Blocker type**: a *feature-shaped* block (defective contract, semantic conflict,
failed criterion) surfaces as a `blocked` entry in the run summary — a question
for the human at the boundary. An *environment-shaped* block (broken tooling, dead
auth) or budget exhaustion **halts** the run. An agent death is a *stall* — nothing
recorded, re-run next pass.

### Worktrees everywhere (ADR-0038)

The main checkout belongs to the human and is never touched by the loop. Every unit
of work runs in its own worktree under `.claude/worktrees/` (created and pruned by
`the-loop worktree-create`/`worktree-remove`): plan agents write the plan on the
feature branch `loop/<id>`; each task gets branch `loop/<id>--<task>` cut from its
dependency's tip (worktrees branch off each other); the validator merges everything
in a dedicated integration worktree and publishes to the target branch by
fast-forward — a natural mutex, serialized across features. Branches carry the
state; worktrees are disposable.

### Context architecture (ADR-0036)

Progressive disclosure, four layers: **system prompt** (the agent's ~2KB standing
instructions — integrity rules that deviate from model priors, return shapes);
**task brief** (pushed in the prompt: the task contract, or for plan/validate the
feature's design doc — the one thing the job can't start without); **resource
guide** (~5 lines naming what else is fetchable and when to bother); **facts**
(artifacts addressable below file granularity — `the-loop plan task` carves one
contract out of a plan). No agent contract says "read this whole file."

### The artifact set (ADR-0037)

| Artifact | Home | Nature |
|---|---|---|
| Architecture (this doc) | `docs/architecture.md` | living narrative + the two recorded runbooks below |
| Feature graph | `docs/feature-graph.md` | machine YAML; the durable state machine |
| Feature design docs | `docs/designs/<id>/design.md` | one per feature; the context slice agents get |
| Plans | `docs/plans/<id>/plan.md` **on the feature branch** | task contracts only; never merged — gone when the feature lands |
| Runbooks | `docs/runbooks/<id>/runbook.md` | written at validation; replayed at release (their only replay point) |
| Bug corpus | `docs/bugs/<bug-short-description>.md` | permanent; born at a diagnose intake, doubles as the fix's context slice |
| Release records | `docs/releases/` (past: `ship-N.md`, historical; future: `v<version-number>/report.md`) | one short block per release |
| ADRs / Glossary / brief / research | `docs/adr/` etc. | decision + vocabulary spine; never auto-loaded |

### Roles and models (ADR-0030/0040)

`config/model-bindings.json` (< project < local settings overrides) binds spawn roles
— `plan`, `build.rote|standard|complex`, `drive`, `validate` — to models. Plan stamps
each task's **judgment level** (how much is left to decide, not size); the
workflow routes `build.<judgment_level>`. A judgment level bound to a registered
`executor` spawns the **drive** agent — a thin build variant that runs the CLI
executor and verifies at the same bar (tests, lint, footprint; one retry). Executors
register as `docs/executors/<id>.md` playbooks; auth failures at use are ordinary
environment halts — there is no pre-flight check before a run starts.

### Intake channels (ADR-0043)

Post-release change enters through three channels that differ only in the
investigation that earns the graph amendment, then converge on the same
human-gated amendment and the unchanged execution pipeline: **define** when the
*what* needs sharpening; an **amendment** when what/why are already obvious
(bypass workflow path for trivial maintenance); **diagnose** when something is
*wrong* and the *why* needs establishing. Diagnose runs end to end in one
conversation — capture → triage → diagnosis via the diagnosing port
(`/diagnosing-bugs` unless the project binds another) → bug doc + fix → gate →
run. Reproduction is best-effort with the waiver recorded; an environment-shaped
obstacle to diagnosis (missing tooling, access, logs) is surfaced to the human
with its quality cost — the waiver is the human's grant, never a silent fallback
under degraded conditions.
Fixes are transient (pruned from the graph in the release commit); bug docs are
permanent — the accumulating, greppable corpus for issue-class pattern
recognition.

### Naming law (ADR-0044)

Every name below the brand tier — terms, files, CLI verbs, statuses, identifiers —
must let an engineer who has never seen the-loop infer its purpose from the name
and its grammatical role alone. The standard's clauses (outsider bar, brand-tier
exemption for `the-loop` itself, composed-from-standard-words, coined-proper-noun
ban, blind generation, plain speech) live in the glossary's rules section — the
sharpened ADR-0037 ratchet. Historical records are never rewritten; renamed terms
carry `(historical)` aliases. The clean-slate application to the existing repo is
the `naming-map` → `rename-sweep` feature pair.

## Key interface contracts

Cross-feature shapes, in prose (per-feature detail lives in the feature docs):

- **Feature record** — `{ id, title, status: designed|validated|shipped, depends_on,
  acceptance: [criterion], notes? }`. Ids are lowercase slugs; they become refs
  (`loop/<id>`) and paths.
- **Task contract** — `{ id, title, covers: [criterion-index], acceptance, footprint,
  size: xs|s|m, judgment_level: rote|standard|complex, depends_on, wiring? }` in the
  plan's `## Tasks` yaml block with `feature:` and `design_version:`. No status, no
  reports — git carries task state (commit subject `"<feature>/<task>: …"` on branch
  `loop/<feature>--<task>`).
- **Run summary** — `{ completed: [id], blocked: [{feature, reason, options}],
  stalled: [{feature, agent, note}], halted?: {reason: budget-exhausted|
  environment-blocked, detail}, budget: {spent, remaining} }`.
- **Fix** — an ordinary feature record, id `fix-<slug>`, whose context slice
  lives at `docs/bugs/<bug-short-description>.md` (execution-context preparation
  falls back from `designs/` to `bugs/`); regression-shaped acceptance; pruned from
  the graph at release while the bug doc and release record remain.
- **Model binding** — `{ <role>: { model | "session", effort?, executor? } }`,
  resolved with provenance by `the-loop models-list`.
- **Validation runbook** — `bringUp → exercise(acceptance) → teardown`, recorded per
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
runs; validators treat "can't tell" as a fail; failed features leave their
branches for inspection; nothing self-heals by writing state — re-running derives
fresh truth from git. The one synchronous gate is Release's human approval.

## Validation runbook

The fixture-repo binding (this repo's own binding): validation exercises the CLI
from the outside, as a user would — never in-process imports.

- **Bring up**: `node bin/create-sample-repo.js` — creates a temp git repo seeded as
  a plausible v2 target repository (feature-graph.md + architecture.md + design
  docs, committed) and prints its path. `node bin/create-sample-repo.js empty` seeds
  the bare unconfigured variant.
- **Exercise**: shell steps driving `node <plugin-root>/bin/the-loop.js …` and
  `node <plugin-root>/bin/the-loop.js status --json` against the fixture repo (cwd =
  the fixture), asserting on printed JSON and exit codes. Sparing headless `claude -p`
  invocations are sanctioned for agent-pack surfaces, and are the first thing shed
  under time pressure.
- **Teardown**: `rm -rf` the printed path.

## Release runbook

Ready checks: `npm test` and `npm run check` green at the pinned tip; replay every
`docs/runbooks/*/runbook.md` for the releasing features.

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
rollback pointer for code is the previous release tag. Note: the health check fails
by design after a rollback (the plugin is gone) — that reads as
`rollback_verified: false`, the correct "needs human eyes" signal, and a restart is
required before a live session runs the new version.
