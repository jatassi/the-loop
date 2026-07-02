# the-loop — Ports inventory

**Status:** Living design artifact (born 2026-07-01, ADR-0024). This is the **typed
inventory of ports** the architecture has always referenced (decisions §1, ADR-0016) but
never held in one place — port names were scattered across ADR-0013/-0014/-0015/-0017/
-0018/-0019 and the Dictionary. It is expected to churn as features are built; the
`configure-step-full` and `ports-adapters-full` features consume this inventory as
their spec seed. Vocabulary per [DICTIONARY.md](../dictionary/DICTIONARY.md): a **port**
is a typed component role; an **adapter** is a native primitive bound to it; the
**capability contract** (`requires`) and **guarantee flags** are checked/surfaced at the
configure step (ADR-0016).

## Tier semantics (ADR-0024)

Two tiers; required ports carry a scope:

- **`required`** — unbound blocks. `required_by` says *when*: `engine` ports block
  everything (all ship in-box defaults, so out-of-box always runs); phase-scoped ports
  (`frame`, `validate`, `ship`, `operate`) block only their phase, checked at the
  configure step and re-checked when that phase enters the frontier — nobody answers
  Ship-time questions at onboarding. Three phase-scoped ports have **no universal default**
  (runtime-probe, deploy-target, observability-backend): they are bound per-project via
  the Design/Configure nudges (ADR-0013/-0015/-0017). Arriving at the phase unbound is a
  surfaced deviation; the runtime probe's documented opt-out (ADR-0013) is the one
  sanctioned downgrade.
- **`optional`** — unbound routes around: the capability is absent, noted once, never a
  block.

Adapter `kind` extends ADR-0016's enumeration (skill / subagent / MCP / command) with
two still-native kinds: `harness-tool` (a built-in harness capability, e.g. web search,
push notification) and `plugin-builtin` (shipped inside the plugin's own code).

## The inventory

```yaml
inventory_version: 1
ports:
  # ── engine-required: unbound blocks everything; defaults ship in-box ─────
  - id: artifact-store
    tier: required
    required_by: [engine]
    requires: [read/write/list loop artifacts, stable addressing for the injection resolver, versioned history]
    guarantee_flags: [git-versioned-resume, greppable-offline-injection]
    default_adapter: { kind: plugin-builtin, ref: in-repo markdown in named dirs under docs/ (ADR-0021) via the artifact-spine parse/render/resolve toolkit }
    consumers: [every phase, /the-loop, Project Ledger, injection resolver]

  - id: phase-frame
    tier: required
    required_by: [engine]
    requires: [brain-dump → Brief, interview delegated to the grilling port]
    default_adapter: { kind: skill, ref: plugin Frame skill — a thin wrapper over the grilling port }
    consumers: [Frame]

  - id: phase-design
    tier: required
    required_by: [engine]
    requires: [Brief → design.md + feature graph + Ledger + Dictionary seed, lifecycle nudges (runtime probe, observability), interview delegated to the grilling port]
    default_adapter: { kind: skill, ref: plugin Design skill }
    consumers: [Design]

  - id: phase-plan
    tier: required
    required_by: [engine]
    requires: [feature → comfortably-small tasks per the sizing gate, task-contract handoff to Build]
    default_adapter: { kind: subagent, ref: plugin Plan agent (agents/plan.md) }
    consumers: [inner loop]

  - id: phase-build
    tier: required
    required_by: [engine]
    requires: [task contract → diff, testing deferred to Validate]
    default_adapter: { kind: subagent, ref: plugin Build task agent }
    consumers: [inner loop]

  - id: phase-validate
    tier: required
    required_by: [engine]
    requires: [merged slice → validator-verdict (three legs), independence from Build]
    default_adapter: { kind: subagent, ref: plugin independent validator }
    consumers: [inner loop]

  # ── phase-scoped required: unbound blocks that phase, checked lazily ─────
  - id: grilling
    tier: required
    required_by: [frame]
    requires: [relentless one-question-at-a-time interview, recommended answer per question, explore-instead-of-asking when the repo can answer]
    default_adapter: { kind: skill, ref: the user-level /grilling skill — presence verified at the configure step; any interview skill honoring the contract swaps in (2026-07-01) }
    consumers: [Frame and Design (their phase adapters load it), configure step (recommended-answer style)]

  - id: test-harness
    tier: required
    required_by: [validate]
    requires: [run the project's tests, machine-readable pass/fail]
    default_adapter: { kind: command, ref: the project's native test command — detected by brownfield comprehension, bound at Design for greenfield }
    consumers: [Validate leg 2 (acceptance)]

  - id: runtime-probe
    tier: required
    required_by: [validate, ship]
    contract: runtime-probe   # design.md contracts block
    requires: [bringUp/exercise/teardown per the contract]
    default_adapter: { kind: command, ref: none universal — bound per-project at Design (nudged); absence is a surfaced opt-out downgrading Validate leg 3 to test-harness-as-runtime-check (ADR-0013) }
    consumers: [Validate leg 3 (runtime observation), Ship full-system check + post-deploy health gate]

  - id: security-review
    tier: required
    required_by: [ship]
    requires: [scan the shippable diff → severity-ranked findings]
    default_adapter: { kind: skill, ref: harness /security-review (ADR-0014, anti-NIH) }
    consumers: [Ship evidence package]

  - id: deploy-target
    tier: required
    required_by: [ship]
    requires: [deploy the shippable frontier, native rollback (delegated, ADR-0014), post-deploy health-checkable by the runtime probe]
    default_adapter: { kind: command, ref: none universal — bound per-project via the Configure/Design nudges }
    consumers: [Ship deploy + delegated rollback]

  - id: observability-backend
    tier: required
    required_by: [operate]
    requires: [query prod telemetry on demand, apprise-the-human surface]
    default_adapter: { kind: mcp, ref: none universal — bound per-project via Design's observability nudge (ADR-0015/-0017) }
    consumers: [Operate]

  # ── optional: unbound routes around, never blocks ────────────────────────
  - id: notification-channel
    tier: optional
    requires: [push a message that reaches the human away from the terminal]
    default_adapter: { kind: harness-tool, ref: harness push notification }
    unbound: walk-away surface degrades to /workflows + Ledger only (ADR-0019)
    consumers: [walk-away surface — run-boundary push]

  - id: research
    tier: optional
    requires: [cited findings, verification — stale or wrong research is worse than none (decisions §4)]
    default_adapter: { kind: harness-tool, ref: inline cited web search (ADR-0018 lightweight default) }
    escalation_adapter: { kind: skill, ref: deep-research — the tier the confidence gate reaches for (ADR-0018) }
    unbound: the confidence gate escalates to the human instead
    consumers: [Frame, Design, inner-loop confidence gate]

  - id: task-tracker
    tier: optional
    requires: [mirror feature/task state as external work items]
    default_adapter: { kind: plugin-builtin, ref: none needed — the feature graph + Ledger are the native tracker }
    unbound: no external mirror; the graph stays the source of truth
    guarantee_flags: [external trackers forfeit git-versioned-resume for tracked state — the ADR-0016 worked example]
    consumers: [external visibility / team workflows]

  - id: vcs-host
    tier: optional
    requires: [PR / release / issue primitives on the remote]
    default_adapter: { kind: command, ref: gh CLI when a GitHub remote exists, else unbound }
    unbound: remote conventions and issue-shaped Evolve intakes unavailable
    consumers: [Ship (PR/release conventions — TBD), Evolve (issue-shaped intakes — TBD)]
```

## Not ports

Kept here so the inventory's edge stays sharp:

- **The non-swappable core** — workflow + control policy: the engine, the gates
  (sizing, confidence, human gates), park-and-drain, the escalation contract,
  surfacing/re-entry. What the-loop *is* (Dictionary).
- **Local git** — substrate, not a port. Every realistic adapter *is* git (worktrees,
  fingerprints, revert, commit-per-pass all assume it), and tests substitute a temp
  repo locally — a single-adapter seam is just indirection. Only the *host* is a port
  (`vcs-host`, above).
- **The injection resolver** — plugin code (the artifact-spine); it sits *above* the
  artifact-store port, it doesn't vary across it.
- **The changelog generator** — engine-internal Ship machinery (ADR-0014), derived from
  git history; nothing varies per project.
- **The harness itself** — Workflow runtime, agent spawning, config layering.
  Cross-harness portability is a posture (ADR-0002), not a port.

## Bindings for this repo (self-hosting seed)

The target repo is the plugin repo, so the-loop's own bindings dogfood the defaults:
artifact-store → `docs/` named dirs; grilling → the `/grilling` user skill;
test-harness → `npm test` + `npm run check`;
runtime-probe → **TBD, must be bound before `validate` is built** (likely: run
`bin/spine.js` / the workflow against a fixture repo and observe); everything
phase-scoped beyond Validate → unbound until those phases near the frontier.
