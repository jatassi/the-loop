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
- **The feature graph is the durable state machine; every run is a stateless pass over it.** A run reads the graph, does the dependency-ready work, commits, and returns a `BoundaryResult`. **park-and-drain:** a deviation parks its slice and the run keeps draining the independent frontier; escalations batch and surface at the **run boundary**. Bookkeeping is **self-booked** (ADR-0029): the agent that ends a feature's run-participation books that ending on the target — per-task fold-ins, the validator's post-verdict booking — through the mechanical booking toolkit; feature-shaped failures park, run-shaped ones (environment, budget) **halt** the run.
- **Surfacing / re-entry:** run returns → session surfaces parked escalations (with recommendation menus — results are already booked in-run, ADR-0029) → human decides → session folds decisions into the graph → a fresh stateless run continues. The **resumable unit is the feature**; `runId`/`resume` is reserved for crash-recovery of an interrupted run.
- **Bounds, not a breaker:** an autonomous run is bounded by the **scope envelope** + frontier-exhaustion + the **sizing gate** + the harness's hard agent cap. No circuit-breaker subsystem; a tighter cost cap is an opt-in ad-hoc budget.

### The artifact spine (ADR-0003–0007)
- **Design (`design.md` + feature graph)** — the *intended* contract. Addressed by stable **id** through one resolver (**injection-on-demand**); layout scales single → split past ~1k lines.
- **System Map** — *as-built* reality; per-module nodes; **git-hash fingerprints** for scoped freshness; a `realizes` cross-walk to design features (divergence = drift).
- **Project Ledger** — a persisted, **derived** projection of the graph (read-by-human, written-by-loop); the front the `/the-loop` resume test stands on.
- **Plans** — per-feature task contracts (`docs/plans/<feature-id>.md`, loop-written at Plan): the Plan → Build handoff record, Validate's task-level brief, and calibration's estimate-vs-actual source (ADR-0025).
- **ADRs · Dictionary** — the decision and vocabulary spine (dogfooded by this very repo).
- **Research Findings · Calibration Memory** (per-project) — outward knowledge and self-tuning signal.

All artifacts are hybrid (Markdown narrative + structured blocks only for machine-parsed fields) and git-versioned in the target repo.

### Phases (ADR-0011–0015)
- **Frame** — grilling → a sharp Brief.
- **Design** — Brief → `design.md` + feature graph + Ledger + Dictionary seed; shapes lifecycle concerns (the **runtime-probe**, **observability**, **lint-regime**, and **project-standards** nudges — greenfield seeds an aggressive per-stack lint baseline and unobvious-only project standards; see the `lint-gate` and `craft-baseline` ports; ADR-0027).
- **Plan** — the **sizing gate**: over-decompose until each task is comfortably small; irreducible features bounce up to re-slice, carrying a **reslice brief**. Gateless by design (ADR-0025): no human plan approval — the compensating machinery is mechanical (`spine plan check`: criterion coverage, overlap ordering, sizing, edges) plus a **fresh-context audit** when complexity/contract-surface/blast-radius warrant. The decomposition persists as a per-feature **plan artifact** (`docs/plans/<feature-id>.md`) of task contracts; Build and Validate consume them, and Build's completion reports fold back in.
- **Build** — concurrent tasks in **per-task worktrees** (Plan keeps them file-disjoint); tasks produce diffs and defer testing to Validate. Work lands one-commit-per-task on a per-feature branch (`loop/<feature-id>`) cut from the **integration target** (a bound ref, default `main`, set at Design; ADR-0026). Builders build under the **craft baseline**: the build constitution always, plus the task's `standards:` selection (ADR-0027).
- **Validate** — the **independent validator** under the ADR-0028 protocol. A cheap **blind deriver** first writes the **expectation sheet** from the contract slice alone (its inputs are its blindfold). The validator then readies the feature branch (rebase + task-branch fold-in; **trivial conflicts** union-resolve and are evidence-recorded, **semantic conflicts** park) and runs four legs — **integrity forensics** (the `spine validate scan` tripwire scanner + justified triage), two-axis **conformance** (ADR-0027), **acceptance** on the project's harness, and **runtime observation** (full probe-pack replay + the new exercise + the **delta proof**: red on merge-base, green on merged tree). Per-leg verdicts (PASS/FAIL/BLOCKED/SKIP, fail-closed) compose mechanically — perfect iff readiness clean and every leg PASS or sanctioned-SKIP; findings carry two severities by the **citation test**; a confirmed forensics hit short-circuits. Only a perfect verdict squash-merges into the integration target (ADR-0026); a **waiver** is a typed human resolution, never a verdict value. Verdicts persist append-only at `docs/validations/` (patch-id dedup); validated exercises pin into the **probe pack** (`docs/probes/`), which Ship replays at full scope.
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
design_version: 4
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
    status: building
    depends_on: [the-loop-entry]
    acceptance: a brain-dump is whittled to a structured, actionable Brief

  - id: design
    title: Design skill (Brief → design.md + feature graph + Ledger + Dictionary seed)
    status: building
    depends_on: [frame, artifact-spine]
    notes:
      - add the lint-regime nudge to lifecycle shaping — greenfield Design seeds an aggressive per-stack lint baseline (strictest preset as floor, complexity budgets, architecture-as-lint), brownfield detects + offers a ratchet; machine-checkable standards belong in the lint gate, prose standards in the craft layer (ports.md lint-gate, 2026-07-02)
      - the project-standards nudge joins lifecycle shaping — greenfield seeds unobvious-only rules with per-rule confirmation, brownfield mines them from comprehension; docs/standards/<topic>.md plus an index of one-line descriptions; shrink standards the codebase now exemplifies (ADR-0027, 2026-07-02)
    acceptance: a Brief yields a valid design.md with a feature graph and an established Ledger

  - id: plan
    title: Plan agent + sizing gate
    status: building
    depends_on: [artifact-spine]
    interfaces: [sizing-gate, task-contract, completion-report]
    acceptance: a feature decomposes into comfortably-small tasks; an irreducible feature bounces to re-slice

  - id: build
    title: Build (task agents; sequential within a feature for v1)
    status: validated
    depends_on: [artifact-spine, plan]
    acceptance: a feature's tasks produce a single merged diff

  - id: craft-baseline
    title: Craft bundle (craft-baseline port + build constitution + per-task standards)
    status: validated
    depends_on: [plan, build]
    notes:
      - mechanics per ADR-0027 — two layers (plugin pack + docs/standards/, repo wins); constitution always-injected; Plan selects standards per task via the task contract's standards field; Design seeds/mines the project layer; Validate consumes via the standards axis (2026-07-02)
    acceptance: [a build agent receives the build constitution and its task's selected project standards in its slice, spine plan check validates a plan's standards field against docs/standards/]

  - id: validate
    title: Independent validator (readiness + four legs)
    status: validated
    depends_on: [build]
    interfaces: [validator-verdict, runtime-probe]
    notes:
      - protocol per ADR-0028 (2026-07-02 grilling; survey at docs/research/2026-07-02-validate-landscape-survey.md) — readiness + four legs, blind derivation via the blind deriver, two-severity findings via the citation test, waiver-as-resolution, probe pack + delta proof, verdicts append-only at docs/validations/ with patch-id dedup, capability envelope with the declared-mutation invariant, rigor dials named for effort-level scaling (actions.md); mutation audit + validator-regret loop deferred — the verdict record is the regret loop's day-one seam
    acceptance: a built slice is judged perfect/deviation against contract + acceptance + runtime

  - id: inner-loop-workflow
    title: The Workflow orchestration (Plan→Build→Validate, park-and-drain, BoundaryResult)
    status: validated
    depends_on: [plan, build, validate]
    interfaces: [boundary-result, escalation-record]
    notes:
      - run mechanics per ADR-0029 (2026-07-02 grilling) — self-booking phase agents (the agent that ends a feature's run-participation books that ending on the target; no scribe agent; the validator books validate-or-park post-verdict, amending ADR-0028's write ban to the judged tree only), per-task completion-report fold-in by each build agent (amends ADR-0026's fold-at-validate-or-park; first task flips planned→building), first-block-parks (within-feature drain deferred to worktree-parallelism)
      - typed blocks — feature-shaped (contract defect, semantic conflict) parks and drains; environment-shaped (dirty tree, harness/probe precondition down) halts the run unbooked, as does budget exhaustion (in-flight bookings land); agent death (null return) is reported as stalled, nothing booked, next stateless pass re-runs the phase; boundary-result amended with halted/stalled (design_version 3→4)
      - remediation round triggers only as sole blocker (all legs would-PASS, readiness clean, standards findings exist — advisory-only still triggers — and no remediation task in the plan), composing the third mechanical verdict value remediation-pending (merge withheld; validator-verdict contract amended); the validator's booking appends the task via the mechanical spine plan remediate (its presence in the plan is the durable round-marker; exempt from plan check's criterion-coverage rules) and names it in its return; re-validation reuses the pass-1 expectation sheet in-run, re-derives across a crash
      - args is the run's orientation snapshot — { target, scope, index, slices (per in-scope feature, the deriver's injection payload — the blindfold stays prompt-fed), plans (task summaries for re-entry), probe binding }; the plan agent's return carries task summaries so the script learns fresh task lists; booking toolkit lands with this feature (spine set-status + spine ledger render + spine plan remediate — no agent hand-edits graph YAML or Ledger prose; escalation records gain a structured block, contract escalation-record)
      - spawning via agentType with plugin-local resolution (the build's first probe); fallback symlinks the plugin's agents/*.md into the target repo's .claude/agents/; every spawn schema-validated; deriver at effort low; v1 fully sequential (no parallel()/pipeline() until worktree-parallelism); script at workflows/inner-loop.js launched by /the-loop via scriptPath, tested by a shim harness executing the real script under node:test
    acceptance:
      - a feature graph runs to a BoundaryResult with completed and parked features booked on the target
      - a deviation parks its slice and the run drains the remaining frontier
      - an environment-shaped block or budget exhaustion halts the run with halted set

  - id: ledger-title-preservation
    title: Ledger renderer preserves pre-heading content (the title line)
    status: building
    depends_on: [inner-loop-workflow]
    notes:
      - bug intake from the 2026-07-03 validation's post-verdict note (validations e9efcf74) — the first live spine ledger render dropped docs/ledger/ledger.md's leading title line; renderLedger's section slicing never captures content before the first "## " heading and no test fixture models it; intended as the first self-hosted feature through the real workflow
    acceptance:
      - renderLedger preserves all priorText content preceding the first "## " heading byte-identically, and seeds the standard title line when priorText has none
      - after a spine ledger render on this repo, docs/ledger/ledger.md carries its title line again

  - id: surfacing
    title: Surfacing / re-entry (run boundary → session → human → fold-back)
    status: designed
    depends_on: [inner-loop-workflow]
    acceptance: a parked escalation surfaces with a menu; a decision folds into the graph; the next run resumes

  - id: ship
    title: Ship (human-gated, evidence package, health-gated delegated rollback)
    status: designed
    depends_on: [validate, surfacing]
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
    depends_on: [system-map, design]
    acceptance: pointing the loop at an existing repo seeds a fingerprinted System Map, demand-driven

  # ── deferred: built BY self-hosting ─────────────────────────────────────
  - id: worktree-parallelism
    title: Per-task worktree isolation + parallel Build (full ADR-0012)
    status: designed
    depends_on: [build]
    notes:
      - file-disjointness will fail routinely on hub files (barrel exports, route registration, shared types) — design hub-file task chaining and a trivial-merge relaxation so only semantic conflicts escalate (2026-07-01 review)
    acceptance: independent tasks build concurrently in worktrees; disjoint branches merge clean; conflicts surface

  - id: evolve
    title: Evolve (bug-shaped intake; RCA + fix-design at the Design gate)
    status: designed
    depends_on: [inner-loop-workflow, design]
    acceptance: a bug intake runs the engine with the same gates; RCA + fix-design is human-approved

  - id: operate-tooling
    title: Operate (on-demand ops/debug tooling + observability-solution guidance)
    status: designed
    depends_on: [evolve]
    acceptance: the human invokes ops/debug tooling reactively; a resulting fix files an Evolve intake; never acts on prod unattended

  - id: calibration-capture
    title: Calibration Memory (per-project capture, recalled at Plan/Design)
    status: designed
    depends_on: [plan, design]
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
      { completed: [feature-id],   # each booked validated on the graph — the terminal status of a completed feature
        parked:    [{ feature-id, deviation, recommendation-menu }],
        stalled:   [{ feature-id, phase, note }],   # agent died; nothing booked; next pass re-runs
        halted?:   { reason: budget-exhausted | environment-blocked, detail },
        budget:    { spent, remaining } }
      # budget unit is tokens; the cap channel is the opt-in harness budget
      # directive at launch (never an args field) — absent a cap, exhaustion
      # cannot occur and halted: budget-exhausted never fires

  - id: injection-resolver
    body: |
      resolve(id) → { node, contracts }
      # maps logical id → physical slice; the one layer that knows the layout

  - id: sizing-gate
    body: |
      assess(task) → fits | split | bounce{reslice-brief}
      # soft proxies (files/read-size, contracts touched, expected diff) + agent judgment;
      # over-decompose until comfortably small; irreducible → bounce up to re-slice the
      # feature, carrying a reslice brief (why irreducible + suggested re-slices)

  - id: task-contract
    body: |
      # docs/plans/<feature-id>.md, "## Tasks" block — the Plan → Build handoff
      { feature, design_version,          # drift stamp: the version the plan was cut from
        tasks: [{ id, title, status: pending|building|built|blocked,
                  covers: [criterion-index],       # 1-based, into the feature's acceptance
                  acceptance: criterion | [criterion],   # the task's own independent test
                  injects: [contract-id],          # slices the build agent gets injected
                  standards: [path],               # project-standards files selected for the task (optional; ADR-0027)
                  footprint: [path],               # expected files created/modified
                  size: xs|s|m,                    # m = comfort ceiling, justified in narrative
                  depends_on: [task-id],           # ordering; overlapping footprints chained
                  report: completion-report }] }   # folded in by Build

  - id: completion-report
    body: |
      { task, result: built|blocked,
        footprint_actual: [path],                  # git diff --name-only over the task's commits
        diff_actual: { files, insertions, deletions },
        deviations: [note], summary }
      # Build's return value per task; Validate reads deviations; calibration mines
      # estimate-vs-actual; actual ≫ expected footprint is a re-plan/re-slice signal

  - id: validator-verdict
    body: |
      # one entry appended to docs/validations/<feature-id>.md per validation (ADR-0028)
      { feature, design_version, patch_id,          # git patch-id of the validated diff — dedup key
        readiness: { rebase: clean|trivial-resolved|blocked,
                     resolutions: [union-resolved hunk],     # declared-mutation invariant
                     preconditions },               # harness/probe runnable
        legs: { forensics, conformance, acceptance, runtime },
        #  each leg: { verdict: PASS|FAIL|BLOCKED|SKIP(reason, sanctioned?),
        #              findings: [{ severity: contract-breaking|advisory,
        #                           cites,          # the falsified obligation — mandatory for contract-breaking
        #                           location, observation, reobserve? }],
        #              evidence,                    # captured excerpts, never paraphrased
        #              unobserved }                 # the negative space, even on PASS
        result: perfect|deviation|remediation-pending,
        #  mechanical: perfect iff readiness clean ∧ all legs PASS|sanctioned-SKIP;
        #  remediation-pending iff all legs would-PASS ∧ standards findings ∧ no round-marker
        #  in the plan (merge withheld; one round per feature — ADR-0027/0029)
        remediation_task: task-id?,  # the appended round-marker, when result is remediation-pending
        exercise: [step],            # executed probe steps + captured observations — the pack-pin source
        spec_ambiguities: [note],    # blind-derivation divergences, folded back to Design
        waivers: [{ obligation, reason, approver, expiry? }] }  # human resolutions — never a verdict value

  - id: escalation-record
    body: |
      # docs/escalations/<feature-id>.md — narrative + one structured block (ADR-0029);
      # written by the parking agent's booking, deleted at resolution (ADR-0009)
      { feature, phase: plan|build|validate, kind: feature|environment,
        deviation,                      # summary; full detail in the narrative
        menu: [option],                 # authored by the parking agent
        branch }                        # the loop/<feature-id> ref, when one exists

  - id: runtime-probe
    body: |
      bringUp() → handle ; exercise(handle, acceptance) → observations ; teardown(handle)
      # port

  - id: port-adapter
    body: |
      Port = { requires: [capability], guarantees: [flag] }
      # configure step asserts adapter.capabilities ⊇ Port.requires; surfaces guarantee-flag trades
```
