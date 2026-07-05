# the-loop — Feature graph

The durable state machine (ADR-0034/0037): each node carries the three durable
statuses only — `designed | validated | shipped`. Everything in-flight (plans,
branches, task commits) is derived from git at launch time. Narrative lives in
[design.md](design.md) (system) and [features/](features/) (per feature).

## Feature graph

```yaml
design_version: 10
features:
  # ── walking skeleton (v1.0): the minimal self-hosting core ──────────────
  - id: artifact-spine
    title: Artifact files, schemas, and the graph/plan toolkit
    status: shipped
    acceptance:
      - a feature node resolves by id; graph.md round-trips through parse/render

  - id: the-loop-entry
    title: /the-loop stateful command + cold-start detection + minimal onboarding
    status: shipped
    depends_on: [artifact-spine]
    acceptance:
      - fresh repo routes to onboarding; configured repo reads the graph and proposes the next action

  - id: frame
    title: Frame skill (grilling → Brief)
    status: designed
    depends_on: [the-loop-entry]
    acceptance:
      - a brain-dump is whittled to a structured, actionable Brief

  - id: design
    title: Design skill (Brief → system design.md + graph.md + per-feature docs)
    status: designed
    depends_on: [frame, artifact-spine]
    acceptance:
      - a Brief yields a valid system design.md, graph.md, and per-feature design docs, with spine check printing OK

  - id: plan
    title: Plan agent + lane sizing
    status: designed
    depends_on: [artifact-spine]
    acceptance:
      - a feature decomposes into comfortably-small tasks, or is declared small-lane whole; an irreducible feature bounces to re-slice

  - id: build
    title: Build (task agents in isolated worktrees)
    status: shipped
    depends_on: [artifact-spine, plan]
    acceptance:
      - a feature's tasks produce a single merged diff

  - id: craft-baseline
    title: Craft bundle (distilled role-card rules + reference pack)
    status: shipped
    depends_on: [plan, build]
    acceptance:
      - a build agent carries the distilled craft rules in its role card; the reference pack loads on demand

  - id: validate
    title: Independent validator (tests + one independent look)
    status: shipped
    depends_on: [build]
    acceptance:
      - a built slice is judged validated/deviation against contract, tests, and runtime

  - id: inner-loop-workflow
    title: The Workflow orchestration (Plan→Build→Validate, ready-set scheduling, BoundaryResult)
    status: shipped
    depends_on: [plan, build, validate]
    acceptance:
      - a scoped graph runs to a BoundaryResult with validated features merged on the target
      - a blocked feature surfaces at the run boundary while independent features keep draining
      - an environment-shaped block or budget exhaustion halts the run with halted set

  - id: ledger-title-preservation
    title: Ledger renderer preserves pre-heading content (historical; superseded by render-on-demand)
    status: shipped
    depends_on: [inner-loop-workflow]
    acceptance:
      - the committed-ledger renderer preserved leading title content (retired by ADR-0037)

  - id: model-selection
    title: Model selection — per-role model/effort bindings at every spawn surface
    status: shipped
    depends_on: [inner-loop-workflow]
    acceptance:
      - spine models resolves every registered role by merging plugin defaults with project and local overrides, printing per-role provenance
      - every workflow spawn passes the model and effort resolved from the bindings riding the snapshot (labels carried the model until 2026-07-05 — dropped as duplication; the workflow UI shows it)
      - an unbound role falls back to the session model with a logged, run-boundary-visible fallback line — never silently
      - plan stamps tier on every task, spine plan check validates it, and the workflow routes build tasks through their build.<tier> bindings

  - id: executor-delegation
    title: Delegated executors — rote tasks driven through registered CLI executors by a thin driver
    status: shipped
    depends_on: [model-selection]
    acceptance:
      - a rote task whose binding routes via a registered executor executes through the driver and that executor's CLI in an isolated worktree, landing one verified commit
      - the driver verifies at the build bar (tests, lint, footprint) with one retry, then returns the standard blocked shape
      - spine models hard-fails a via naming an unregistered executor or a model outside its playbook; spine executors prints the parsed registry

  - id: workflow-phase-grouping
    title: Workflow progress groups by SDLC phase (Plan | Build | Validate)
    status: shipped
    depends_on: [inner-loop-workflow]
    acceptance:
      - every workflow spawn's phase opt names its SDLC phase, with the feature id riding the label
      - meta declares phases as three title-only entries in Plan, Build, Validate order on its single line

  - id: surfacing
    title: Surfacing / re-entry (historical; superseded by chat-boundary decisions)
    status: shipped
    depends_on: [inner-loop-workflow]
    acceptance:
      - v1's escalation fold-back machinery worked as designed (retired by ADR-0034; blocked entries now surface as run-boundary questions)

  - id: ship
    title: Ship (per-project recipe behind one human gate)
    status: shipped
    depends_on: [validate, surfacing]
    acceptance:
      - ship replays the probe packs and suite at a pinned tip, holds the human gate, deploys per the recorded recipe, verifies health, and records the outcome

  # ── deferred: built BY self-hosting ─────────────────────────────────────
  - id: worktree-parallelism
    title: Worktree parallelism — trivial-merge relaxation (compose-and-prove at every merge point)
    status: validated
    depends_on: [build]
    notes:
      - ADR-0038 landed the substrate (worktrees everywhere, ready-set concurrency); ADR-0042 closes the hub-file remainder declaration-free — the unordered-overlap lint dies, disjointness becomes plan bias, and all three merge points (sibling merge, integration merge, publish-rebase) resolve textual conflicts compose-and-prove
    acceptance:
      - a plan whose unordered tasks share a footprint file passes plan check clean
      - no loop surface still promises conflict-free merges — build and validate carry the compose-and-prove posture (resolve only with a resolution serving both sides' stated intents, proven by the merged suite including both branches' tests going green; otherwise blocked naming the conflicting paths)
      - in a two-branch fixture scenario editing the same file, a composable conflict lands both edits with the suite green, and a non-composable conflict returns blocked naming the paths

  - id: evolve
    title: Evolve (bug-shaped intake; RCA + fix-design at the Design gate)
    status: designed
    depends_on: [inner-loop-workflow, design]
    acceptance:
      - a bug intake runs the engine with the same gates; RCA + fix-design is human-approved

  - id: operate-tooling
    title: Operate (on-demand ops/debug tooling + observability-solution guidance)
    status: designed
    depends_on: [evolve]
    acceptance:
      - the human invokes ops/debug tooling reactively; a resulting fix files an Evolve intake; never acts on prod unattended

  - id: calibration-capture
    title: Calibration Memory (per-project capture, recalled at Plan/Design)
    status: designed
    depends_on: [plan, design]
    notes:
      - capture must separate loop-overhead tokens (validator, orchestration) from build tokens, so "earns its context" is measured against the founding thesis, not assumed (2026-07-01 review); the v2 benchmark forensics (docs/actions) are the seed methodology
    acceptance:
      - actual-vs-estimated task cost + re-slice events are captured and recalled

  - id: configure-step-full
    title: Full configure step (/loop-config — user/global + project scopes)
    status: designed
    depends_on: [the-loop-entry]
    acceptance:
      - bindings are set via recommended-answer grilling and persisted to harness-native layers

  - id: ports-adapters-full
    title: Full ports/adapters (swapping + capability-contract enforcement)
    status: designed
    depends_on: [configure-step-full]
    notes:
      - the v1 port inventory (docs/ports/ports.md) was retired by ADR-0037 — the abstraction waits for a second adopter; reconstruct the inventory from git history if this feature nears the frontier
    acceptance:
      - an adapter swap is one config line; the configure step validates the contract and surfaces guarantee trades

  - id: research-tiers
    title: Research port (lightweight default + confidence-gate + deep-research escalation)
    status: designed
    depends_on: [inner-loop-workflow]
    acceptance:
      - low confidence on a consequential decision triggers research; rigor scales with consequence

  - id: evolve-severity-tiering
    title: Evolve severity-tiering (the sev-1 hotfix express lane)
    status: designed
    depends_on: [evolve]
    acceptance:
      - a sev-1 intake takes an expedited, still-gated path
```
