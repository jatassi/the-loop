# the-loop — Design

**Status:** Living design artifact (born at Design finalize, 2026-06-29). Synthesizes the architecture resolved across [ADR-0001–0021](../adr/) from the [intent](agentic-dev-loop-design-intent.md) and [decisions](agentic-dev-loop-design-decisions.md) docs. Narrative prose carries the judgment; the structured blocks carry the machine-parseable feature graph and contracts (per ADR-0003). The detailed *why* for any choice lives in the cited ADR. Vocabulary is pinned in [DICTIONARY.md](../dictionary/DICTIONARY.md).

## What the-loop is

An owned, composable augmentation layer — built from native Claude Code primitives (skills, subagents, hooks, commands, a Workflow) — that moves an idea through the full SDLC: refine → design → build → validate → ship → operate → evolve. It is not a standalone framework; it ships as a **plugin**, and the artifacts it produces live in the **target repo** it operates on. Its first job is to build itself.

---

## Architecture

### Substrate (ADR-0001, ADR-0002)
- Ships as a **Claude Code plugin**. **Two-filesystem split:** the loop's code lives in the plugin (disposable, swappable); the artifacts it produces live git-versioned in the **target repo** (durable).
- **Self-hosting collapses the split — knowingly.** When the-loop's intake is the-loop itself (its first job), the target repo *is* the plugin repo: one checkout carries both the engine's code and the artifacts it produces. The roles stay directory-disjoint (`src/`, `skills/`, `commands/` vs `docs/`), just no longer repo-disjoint. What survives: artifacts stay git-versioned and durable, and the feature graph stays the durable state machine. What lapses: "the plugin is disposable" — this checkout is load-bearing for both roles. The one new hazard is bounded: build tasks edit the engine that runs them, but a run executes the code it launched with, so self-edits take effect on the next stateless pass — the run boundary doubles as the code-swap boundary — and a bad self-edit is a git revert away, gated by the same validator as any other diff.
- The autonomous inner loop is a **Claude Code Workflow** (deterministic JS orchestration). The human-gated phases live in the **interactive session**. The boundary is the **workflow edge**: the session conducts; the workflow runs only while no human input is required.
- **`/the-loop`** is one stateful entry: it reads the Ledger, states its inferred position, and proposes the next action (`/loop` is reserved, hence `/the-loop`).

### Script = brain, agents = hands (ADR-0004, ADR-0012)
The workflow script is a **pure-orchestration sandbox** — no filesystem, shell, git, or network; its only lever is spawning agents. Every repo-touching action is performed by an **agent**; the script decides *what* and *in what order*. This quarantine of side effects into agents is what makes runs **deterministic and resumable**. The same split powers injection (agents read), the Ledger (agents write), and Build's merge (an agent merges).

### The engine (ADR-0008, ADR-0009, ADR-0010)
- **One engine, many intakes:** `Frame → Design → ( Plan → Build → Validate → Adjust )* → Ship`, with Operate/Evolve turning deployed apps back into intakes.
- **Perfection bar:** the inner loop is autonomous *only on the happy path*; any deviation surfaces.
- **The feature graph is the durable state machine; every run is a stateless pass over it.** A run reads the graph, does the dependency-ready work, commits, and returns a `BoundaryResult`. **park-and-drain:** a deviation parks its slice and the run keeps draining the independent frontier; escalations batch and surface at the **run boundary**.
- **Surfacing / re-entry:** run returns → session persists results + surfaces parked escalations (with recommendation menus) → human decides → session folds decisions into the graph → a fresh stateless run continues. The **resumable unit is the feature**; `runId`/`resume` is reserved for crash-recovery of an interrupted run.
- **Bounds, not a breaker:** an autonomous run is bounded by the **scope envelope** + frontier-exhaustion + the **sizing gate** + the harness's hard agent cap. No circuit-breaker subsystem; a tighter cost cap is an opt-in ad-hoc budget.

### The artifact spine (ADR-0003–0007)
- **Design (`design.md` + feature graph)** — the *intended* contract. Addressed by stable **id** through one resolver (**injection-on-demand**); layout scales single → split past ~1k lines.
- **System Map** — *as-built* reality; per-module nodes; **git-hash fingerprints** for scoped freshness; a `realizes` cross-walk to design features (divergence = drift).
- **Project Ledger** — a persisted, **derived** projection of the graph (read-by-human, written-by-loop); the front the `/the-loop` resume test stands on.
- **ADRs · Dictionary** — the decision and vocabulary spine (dogfooded by this very repo).
- **Research Findings · Calibration Memory** (per-project) — outward knowledge and self-tuning signal.

All artifacts are hybrid (Markdown narrative + structured blocks only for machine-parsed fields) and git-versioned in the target repo.

### Phases (ADR-0011–0015)
- **Frame** — grilling → a sharp Brief.
- **Design** — Brief → `design.md` + feature graph + Ledger + Dictionary seed; shapes lifecycle concerns (the **runtime-probe** and **observability** nudges).
- **Plan** — the **sizing gate**: over-decompose until each task is comfortably small; irreducible features bounce up to re-slice.
- **Build** — concurrent tasks in **per-task worktrees** (Plan keeps them file-disjoint); tasks produce diffs and defer testing to Validate.
- **Validate** — the **independent validator**: integrates the task branches (merge folds in), then runs three legs — conformance, acceptance tests, and **runtime observation via the runtime probe**. Anything short of perfect → deviation.
- **Adjust** — the recommendation menu; drift via each feature's `design_version`; impact-scoped re-validation.
- **Ship** — human-gated; evidence package (full-system integration via the runtime probe + a baseline security-review port + changelog); **health-gated, delegated rollback**.
- **Operate** — **on-demand** ops/debug tooling, plus an **observability solution** that apprises the human; never a scheduled agent.
- **Evolve** — the engine on a bug-shaped intake; same gates.

### Cross-cutting (ADR-0016–0019)
- **Ports/adapters** — adapters are native primitives (skill / subagent / MCP / command); bound per-port in harness-native config; capability contracts checked at the **configure step**, with guarantee-flag trades surfaced. The typed inventory — every port, tiered required/optional, with its default adapter — lives in [docs/ports/ports.md](../ports/ports.md) (ADR-0024).
- **Greenfield onboarding** — the **cold-start branch of `/the-loop`**: Configure → Frame → Design.
- **Research** — a lightweight cited web search by default; `deep-research` is the escalation tier the confidence-gate reaches for.
- **Walk-away surface** — composed, not built: `/workflows` (live) + Ledger (resting) + notification port (push when something needs you).

### Boundaries & tech posture
- The **non-swappable core** is the workflow + control policy (the engine, the gates, the escalation contract). Everything else is a port.
- **Harness-native config** (no parallel system); **harness-agnostic** durable artifacts keep cross-harness portability open even though v1 targets Claude Code.
- **Artifact layout (ADR-0021):** every loop-produced document lives in a named directory under `docs/`, even single files — `docs/design/`, `docs/ledger/`, `docs/dictionary/`, `docs/adr/`, … The named directory is also where a single-file artifact's split files land as it grows.

---

## Feature graph

The v1 build order (ADR-0020, amended by ADR-0023): the walking skeleton — including the System Map and brownfield comprehension it needs to dogfood its own repo — reaches self-hosting; everything after is built *by* the loop. Schema per ADR-0003.

```yaml
design_version: 1
features:
  # ── walking skeleton (v1.0): the minimal self-hosting core ──────────────
  - id: artifact-spine
    title: Artifact files, schemas, and the injection resolver (address-by-id)
    status: validated
    depends_on: []
    interfaces: [feature-node, injection-resolver]
    acceptance: a feature node + its contracts resolve by id; design.md round-trips through parse/render

  - id: the-loop-entry
    title: /the-loop stateful command + cold-start detection + minimal onboarding
    status: validated
    depends_on: [artifact-spine]
    acceptance: fresh repo routes to onboarding; configured repo reads the Ledger and proposes the next action

  - id: frame
    title: Frame skill (grilling → Brief)
    status: designed
    depends_on: [the-loop-entry]
    acceptance: a brain-dump is whittled to a structured, actionable Brief

  - id: design-phase
    title: Design skill (Brief → design.md + feature graph + Ledger + Dictionary seed)
    status: designed
    depends_on: [frame, artifact-spine]
    acceptance: a Brief yields a valid design.md with a feature graph and an established Ledger

  - id: plan-phase
    title: Plan agent + sizing gate
    status: designed
    depends_on: [artifact-spine]
    interfaces: [sizing-gate]
    notes:
      - first act of design — define the task contract, the Plan → Build handoff shape (id, acceptance criteria, injected-slice refs, expected file footprint, size estimate); build-phase and validate-phase consume it (2026-07-01 review)
    acceptance: a feature decomposes into comfortably-small tasks; an irreducible feature bounces to re-slice

  - id: build-phase
    title: Build (task agents; sequential within a feature for v1)
    status: designed
    depends_on: [artifact-spine, plan-phase]
    notes:
      - design the git branching/integration strategy as an ADR before implementation (also blocks validate-phase) — where a validated feature integrates, a parked feature's branch lifecycle across run boundaries, who rebases a rotted parked branch on fix-in-place, crash-recovery commit granularity (2026-07-01 review)
    acceptance: a feature's tasks produce a single merged diff

  - id: validate-phase
    title: Independent validator (merge-fold-in + three legs)
    status: designed
    depends_on: [build-phase]
    interfaces: [validator-verdict, runtime-probe]
    notes:
      - design a deviation-severity axis for validator-verdict (joint session) — contract-breaking findings park the slice, advisory findings are recorded without parking; kills the "validation flagged anything" catch-all and the escalation fatigue it invites (2026-07-01 review)
      - record the validator-independence posture as an ADR amending ADR-0013 — build agents develop TDD-style, so the validator checks acceptance differently, exercising real-world-shaped behavior via the runtime probe rather than trusting the builder's tests (2026-07-01 decision)
    acceptance: a built slice is judged perfect/deviation against contract + acceptance + runtime

  - id: inner-loop-workflow
    title: The Workflow orchestration (Plan→Build→Validate, park-and-drain, BoundaryResult)
    status: designed
    depends_on: [plan-phase, build-phase, validate-phase]
    interfaces: [boundary-result]
    acceptance: a feature graph runs to a BoundaryResult; a deviation parks its slice and drains the frontier

  - id: surfacing
    title: Surfacing / re-entry (run boundary → session → human → fold-back)
    status: designed
    depends_on: [inner-loop-workflow]
    acceptance: a parked escalation surfaces with a menu; a decision folds into the graph; the next run resumes

  - id: ship-phase
    title: Ship (human-gated, evidence package, health-gated delegated rollback)
    status: designed
    depends_on: [validate-phase, surfacing]
    acceptance: a validated frontier deploys behind a human gate; a failed post-deploy health check rolls back

  # ── dogfood-readiness (ADR-0023): brownfield support lands before self-hosting ──
  - id: system-map
    title: System Map artifact (per-module nodes, fingerprints, self-maintenance)
    status: designed
    depends_on: [artifact-spine]
    acceptance: built features update their map node + fingerprint in the same commit; stale nodes are detected

  - id: brownfield-comprehension
    title: Brownfield intake — comprehension seeding of the System Map
    status: designed
    depends_on: [system-map, design-phase]
    acceptance: pointing the loop at an existing repo seeds a fingerprinted System Map, demand-driven

  # ── deferred: built BY self-hosting ─────────────────────────────────────
  - id: worktree-parallelism
    title: Per-task worktree isolation + parallel Build (full ADR-0012)
    status: designed
    depends_on: [build-phase]
    notes:
      - file-disjointness will fail routinely on hub files (barrel exports, route registration, shared types) — design hub-file task chaining and a trivial-merge relaxation so only semantic conflicts escalate (2026-07-01 review)
    acceptance: independent tasks build concurrently in worktrees; disjoint branches merge clean; conflicts surface

  - id: evolve
    title: Evolve (bug-shaped intake; RCA + fix-design at the Design gate)
    status: designed
    depends_on: [inner-loop-workflow, design-phase]
    acceptance: a bug intake runs the engine with the same gates; RCA + fix-design is human-approved

  - id: operate-tooling
    title: Operate (on-demand ops/debug tooling + observability-solution guidance)
    status: designed
    depends_on: [evolve]
    acceptance: the human invokes ops/debug tooling reactively; a resulting fix files an Evolve intake; never acts on prod unattended

  - id: calibration-capture
    title: Calibration Memory (per-project capture, recalled at Plan/Design)
    status: designed
    depends_on: [plan-phase, design-phase]
    notes:
      - capture must separate loop-overhead tokens (validator, ledger renders, escalation records) from build tokens, so "earns its context" is measured against the founding thesis, not assumed (2026-07-01 review)
    acceptance: actual-vs-estimated task cost + re-slice events are captured and recalled

  - id: configure-step-full
    title: Full configure step (/loop-config — user/global + project scopes)
    status: designed
    depends_on: [the-loop-entry]
    acceptance: ports/params are bound via recommended-answer grilling and persisted to harness-native layers

  - id: ports-adapters-full
    title: Full ports/adapters (swapping + capability-contract enforcement + guarantee flags)
    status: designed
    depends_on: [configure-step-full]
    interfaces: [port-adapter]
    notes:
      - the port inventory (ids, tiers, required_by scopes, default adapters) is tracked in docs/ports/ports.md (ADR-0024); this feature's configure-step enforcement consumes it as spec (2026-07-01)
    acceptance: an adapter swap is one config line; the configure step validates the contract and surfaces guarantee trades

  - id: research-tiers
    title: Research port (lightweight default + confidence-gate + deep-research escalation)
    status: designed
    depends_on: [inner-loop-workflow]
    acceptance: low confidence on a consequential decision triggers research; rigor scales with consequence

  - id: evolve-severity-tiering
    title: Evolve severity-tiering (the sev-1 hotfix express lane)
    status: designed
    depends_on: [evolve]
    acceptance: a sev-1 intake takes an expedited, still-gated path
```

---

## Key interface contracts

Contract-level shapes only (the *what*, not the *how* — plans carry no implementation). Each contract is addressed by its stable `id` — the handle `interfaces:` references and the [injection resolver](../adr/0004-injection-on-demand.md) resolves; the `body` is a verbatim shape sketch (prose, not parsed).

```yaml
contracts:
  - id: feature-node
    body: |
      { id, title, status: designed|planned|building|validated|shipped|parked|drifted,
        depends_on: [id], interfaces: [contract-id],
        acceptance: criterion | [criterion],
        design_version: int }   # doc-level default; a node may override it as its drift stamp

  - id: boundary-result
    body: |
      { completed: [feature-id],
        parked:    [{ feature-id, deviation, recommendation-menu }],
        budget:    { spent, remaining } }

  - id: injection-resolver
    body: |
      resolve(id) → { node, contracts }
      # maps logical id → physical slice; the one layer that knows the layout

  - id: sizing-gate
    body: |
      assess(task) → fits | split | bounce
      # soft proxies (files/read-size, contracts touched, expected diff) + agent judgment;
      # over-decompose until comfortably small; irreducible → bounce up to re-slice the feature

  - id: validator-verdict
    body: |
      { merge: clean|conflict,
        legs: { conformance, acceptance, runtime },
        result: perfect|deviation, detail }

  - id: runtime-probe
    body: |
      bringUp() → handle ; exercise(handle, acceptance) → observations ; teardown(handle)
      # port

  - id: port-adapter
    body: |
      Port = { requires: [capability], guarantees: [flag] }
      # configure step asserts adapter.capabilities ⊇ Port.requires; surfaces guarantee-flag trades
```
