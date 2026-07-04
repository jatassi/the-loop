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
- **Surfacing / re-entry:** run returns → session surfaces parked escalations (with recommendation menus — results are already booked in-run, ADR-0029) → human decides → session folds decisions into the graph → a fresh stateless run continues. Decisions are **typed resolution kinds** — `retry | fix-in-place | re-plan | waive | defer` — naming where the feature re-enters the engine; pre-steps (research, a design amendment, a config rebind, waiver recording) attach content without changing the kind, and fold-back is mechanical through the **adjust skill** (`spine escalation resolve`, ADR-0032). The **resumable unit is the feature**; `runId`/`resume` is reserved for crash-recovery of an interrupted run.
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
- **Build** — concurrent tasks in **per-task worktrees** (Plan keeps them file-disjoint); tasks produce diffs and defer testing to Validate. Work lands one-commit-per-task on a per-feature branch (`loop/<feature-id>`) cut from the **integration target** (a bound ref, default `main`, set at Design; ADR-0026). **Current target binding, this branch only: `worktree-executor-delegation`** — the executor-delegation stream runs isolated on its worktree branch, parallel to the surfacing stream on `main` (ADR-0026's intake-branch pattern); delete this sentence when the branch folds back into `main`. Builders build under the **craft baseline**: the build constitution always, plus the task's `standards:` selection (ADR-0027).
- **Validate** — the **independent validator** under the ADR-0028 protocol. A cheap **blind deriver** first writes the **expectation sheet** from the contract slice alone (its inputs are its blindfold). The validator then readies the feature branch (rebase + task-branch fold-in; **trivial conflicts** union-resolve and are evidence-recorded, **semantic conflicts** park) and runs four legs — **integrity forensics** (the `spine validate scan` tripwire scanner + justified triage), two-axis **conformance** (ADR-0027), **acceptance** on the project's harness, and **runtime observation** (full probe-pack replay + the new exercise + the **delta proof**: red on merge-base, green on merged tree). Per-leg verdicts (PASS/FAIL/BLOCKED/SKIP, fail-closed) compose mechanically — perfect iff readiness clean and every leg PASS or sanctioned-SKIP; findings carry two severities by the **citation test**; a confirmed forensics hit short-circuits. Only a perfect verdict squash-merges into the integration target (ADR-0026); a **waiver** is a typed human resolution, never a verdict value. Verdicts persist append-only at `docs/validations/` (patch-id dedup); validated exercises pin into the **probe pack** (`docs/probes/`), which Ship replays at full scope.
- **Adjust** — the adjust skill walks the parked docket in graph order: kind-stamped recommendation menus presented recommended-first, typed resolutions folded back mechanically (ADR-0032); drift via each feature's `design_version`; impact-scoped re-validation.
- **Ship** — human-gated, session-side; evidence package pinned to `ship_sha` (all-packs probe replay + security-review port + changelog + live waivers) → approval → the autonomous **corridor** (deploy → user-defined smoke → conclude-or-rollback), booked as a **ship record** at `docs/ships/` (ADR-0033); **health-gated, delegated rollback**.
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
design_version: 7
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
    status: validated
    depends_on: [inner-loop-workflow]
    notes:
      - bug intake from the 2026-07-03 validation's post-verdict note (validations e9efcf74) — the first live spine ledger render dropped docs/ledger/ledger.md's leading title line; renderLedger's section slicing never captures content before the first "## " heading and no test fixture models it; intended as the first self-hosted feature through the real workflow
    acceptance:
      - renderLedger preserves all priorText content preceding the first "## " heading byte-identically, and seeds the standard title line when priorText has none
      - after a spine ledger render on this repo, docs/ledger/ledger.md carries its title line again

  - id: model-selection
    title: Model selection framework — per-role model/effort bindings at every spawn surface
    status: validated
    depends_on: [inner-loop-workflow]
    interfaces: [model-binding]
    notes:
      - intake 2026-07-03, from the first self-hosted runs — every workflow spawn inherited the session model (Fable); designed same day by grilling (ADR-0030); ADR-0029's "everything else inherits session model/effort" posture becomes the visible fallback, not the policy
      - shape per ADR-0030 — an open registry of dotted spawn roles (plan · plan.audit · build.rote · build.standard · build.complex · drive · derive · validate · design.reader · design.alternative; any surface may declare more); binding value per the model-binding contract, with 'session' an explicit bindable model (deliberate inherit, distinct in provenance from the unbound fallback) and via the executor discriminator (agent default; a registered executor id routes to executor-delegation)
      - config layers — defaults ship in the plugin at config/model-bindings.json; per-project overrides under the namespaced "the-loop".modelBindings key in .claude/settings.json, personal ones in .claude/settings.local.json; a new spine models command merges defaults < project < local (whole-entry replacement per role) and prints the resolved table with per-role provenance (default|project|local|fallback); that resolver is the single source for every surface — the launch leg rides its output into args.models, and Bash-holding agents (plan's audit) or session-side skills (design) invoke it themselves
      - build stratifies by decision-density, not size — Plan stamps tier (rote|standard|complex; how much the task leaves to decide) on every task contract; rote additionally requires correctness fully captured by the task's tests + lint (the delegation-eligibility rubric, provisional and calibration-adjacent); the workflow routes build.<tier>; task summaries and args.plans entries carry tier; a plan cut before this feature defaults to standard with fallback provenance; spine plan check validates the field
      - workflow plumbing — every spawn passes model/effort opts from args.models[role]; an unbound role omits the opts and log()s a "model-selection — role <x> unbound, session-model fallback" line relayed at the run boundary (visible, never silent); spawn labels carry the resolved model ("[sonnet] build ..."); derive's hardcoded effort low moves into the table
      - session-side limitation, recorded — the Agent tool takes model only (no per-spawn effort), so session-side roles honor effort only where an agent definition file carries it in frontmatter; spawn-opts-over-frontmatter precedence for workflow agent() opts is a documented gap — empirically confirmed as a first build probe (the ADR-0029 probe pattern)
      - shipped default table (observed 2026-07-03 hand-runs; unobserved rows flagged in ADR-0030) — plan session · plan.audit opus · build.rote sonnet · build.standard sonnet · build.complex opus · drive sonnet · derive opus at low effort · validate sonnet · design.reader sonnet (misreads the way a build agent would) · design.alternative opus
    acceptance:
      - spine models resolves every registered role to model, effort, and executor by merging plugin defaults with project and local settings overrides, printing per-role provenance
      - every workflow spawn passes the model and effort resolved from the bindings riding args, and spawn labels carry the resolved model
      - an unbound role falls back to the session model with a logged, run-boundary-visible fallback line — never silently
      - Plan stamps tier on every task, spine plan check validates it, and the workflow routes build tasks through their build.<tier> bindings

  - id: executor-delegation
    title: Delegated executors — rote tasks driven through registered CLI executors by a Claude driver
    status: parked
    depends_on: [model-selection]
    notes:
      - designed 2026-07-03 by grilling (ADR-0031), seeded from AlphaMind's grok-cli dogfood; sharpened same day by the pre-build grill (ADR-0031 amended in place); off by default — a project opts in by rebinding build.rote to an executor's model with via naming a registered executor; the binding table stays the single routing surface, no separate delegation switch
      - executors register by playbook — executors/<id>.md in the plugin, narrative operational lore around one fenced yaml machine block under the exact heading "## Machine block" (the escalation-record parse pattern), fields id · command · models (the executor model ids a binding may name) · worktree native|driver-made · invocation (a template with {model} {prompt} {worktree}|{ref} placeholders) · availability (a version-check command) · auth_smoke {run, expect} · concurrency · effort_flag? (an invocation fragment; absent = the executor takes no effort); parsing and binding-validation are pure in src/executors.js; spine executors prints the parsed registry keyed by id; a malformed playbook is a hard spine error naming file and field; the shape is deliberately plugin-internal config, not a design contract — this field list is the build's authoritative spec, and design_version stays 6; project-local playbooks defer to ports-adapters-full
      - resolver validation — spine models loads the registry and hard-fails a via naming an unregistered executor or a model outside the playbook's list; three warn-never-fail guards keep everything else visible at every resolution — via on a role no spawn consults ("no routing surface"), via on a build tier outside the delegation-eligibility rubric (rote only — the rubric is provisional, so a warning, not an error; the workflow routes it anyway, the table is the authority), and effort on a binding whose executor carries no effort_flag ("ignored")
      - launch-leg pre-flight — after args assembly, before launch, for every distinct via across the resolved table (computable before Plan stamps tiers), run the playbook's availability check then its auth smoke test asserting expect; any failure stops the launch like the dirty-tree gate — told to the human, nothing runs; the smoke re-runs every launch (one micro-prompt — cached auth state is state the stateless loop doesn't keep); the agent-resolution step gains drive unconditionally (five symlinks)
      - workflow routing — a build.<tier> binding with via (≠ agent) spawns drive instead of build — the driver's own model resolves by a silent table check for drive.<via> first, else roleBinding('drive') — so drive.grok never logs a false fallback while a table binding neither still logs the visible session fallback; the prompt gains executor and executor-model lines (the driver demand-reads the playbook itself); the label carries both models ("[sonnet] drive:<fid>/<tid> via grok/grok-build"); one model-selection log() line per routed task; the schema stays BUILD_SCHEMA — drive returns build's exact shape
      - the driver (agents/drive.md, one Claude agent for all executors, bound by the drive role — dotted sub-roles like drive.<executor> remain available through the open registry) is the spawned unit — a CLI never replaces an agent; the workflow can only spawn Claude agents, and CLI self-reports are untrusted (grok reports success even when truncated), so a Claude verifier is mandatory; build.md §2 (branch protocol incl. crash healing) and §5 (booking) extract near-verbatim into one shared protocol doc both agents reference — build keeps §1/§3/§4, drive carries its own choreography, return shapes stay duplicated per agent since they diverge (placement settled at Plan — whether agents/ subdirectories are scanned as definitions is unverified, a plan-time probe)
      - drive choreography, playbook-parameterized — shared branch protocol first (clean-tree gate, create/rebase loop/<feature-id>, crash-healing commit search) in the main checkout; assemble the prompt file — task-contract slice + constitution + selected standards + an imperative footer (one test per criterion, implement, scoped tests + lint, one commit, the exact standard message; lore may append executor-specific prompt advice) — at .claude/worktrees/drive-<fid>-<tid>.prompt.md, beside and never inside the worktree (a gitignored path, invisible to every clean-tree gate); cut the worktree per the playbook (driver-made — git worktree add --detach at the feature-branch tip); run the CLI headless per the invocation template; verify inside the worktree — commit exists, per-criterion tests present and green, lint clean, diff reviewed for unintended files and deleted or weakened behavioral tests, footprint against contract; on pass fold — git merge --squash the worktree HEAD onto loop/<feature-id> and commit with the driver-authored standard task message (the <feature-id>/<task-id> pattern crash-healing greps for) (the prompt tells the executor to commit that message — belt; the driver never trusts it — braces; N executor commits collapse to one); zero executor commits = truncation always, even if the tree verifies green — grok commits last, an uncommitted run never reached its own finale, never driver-commit the debris; dispose worktree + prompt file on every exit path, evidence quoted into the park record rather than left as debris; book per the shared booking protocol exactly as a build agent — the report's summary opens with the driven-via provenance ("Driven via <executor>/<model> — …" on every driven report, so a clean run never mints a fake deviation) and retries land in deviations; no completion-report contract change
      - failure typing, on the integrity-violation line — truncation (no commit / finale unreached) retries once in a fresh worktree; a defect with the commit present splits — a diff violating a constitution integrity rule (deleted/weakened behavioral test, suppression, footprint excursion, unintended files, any gaming move) is a judgment defect and parks immediately; red checks without an integrity violation (the executor's own tests red, lint, a lore-named flaky signature) are a mechanical defect and retry; one retry total per task shared across all types — a second failure of any type parks with both runs' evidence; the park menu is kind-stamped per ADR-0032 ({retry, rebind-to-Claude config pre-step} recommended first · {re-plan, re-spec the task}); drive-time CLI/auth/hard-API failure is environment-shaped (halts, ADR-0029); v1's sequential runs satisfy per-executor concurrency limits for free — recorded for worktree-parallelism
      - grok playbook (v1's only executor) — models grok-build + grok-composer-2.5-fast (the CLI default is Composer, so the model is always passed explicitly); worktree driver-made with --cwd, the observed dogfood pattern — --worktree/--worktree-ref verified to exist (grok --help, 2026-07-03) but unobserved, so a first-build probe exercises them on a throwaway repo and native mode is a follow-up playbook amendment if clean; --effort parses (low…max) but no record says the grok models honor it — no effort_flag, lore-noted; --check unused (a self-verification loop is still a self-report); invocation grok -m {model} --prompt-file {prompt} --cwd {worktree} --always-approve --no-subagents --max-turns 500 --output-format plain; availability grok --version; auth smoke grok -p "say PONG" --max-turns 1 expecting PONG (grok models misreports auth); concurrency 2; lore imports the dogfood record — commits last, truncation looks like stopped-without-committing, search_replace flakes on large/repetitive files, 429 at ≥3 concurrent, benign AuthorizationRequired log line, CLAUDE.md auto-discovery, over-deletes behavioral tests when judgment is required
    acceptance:
      - a rote task whose binding routes via a registered executor executes through the driver and that executor's CLI in an isolated worktree, folds exactly one driver-authored standard-message commit onto the feature branch, and books a completion report whose summary opens with the driven-via provenance
      - the verification gate types failures on the integrity-violation line — truncation and mechanical defect share one retry in a fresh worktree, a judgment defect parks immediately, and the second failure of any type parks with both runs' evidence and a kind-stamped rebind-or-respec menu
      - spine models hard-fails a via naming an unregistered executor or a model outside its playbook's list, and warns — never fails — on a via with no routing surface, an off-rubric tier, or an ignored effort; spine executors prints the parsed registry
      - every distinct via in the resolved table passes its playbook's availability and auth checks at the launch-leg pre-flight or the launch stops with nothing run; a drive-time environment failure halts the run

  - id: workflow-phase-grouping
    title: Workflow progress groups by SDLC phase (Plan | Build | Validate), not by feature
    status: designed
    depends_on: [inner-loop-workflow]
    notes:
      - intake 2026-07-03, mid-run improvement request during wf_f1c42418 — the /workflows tree groups spawns per feature (opts.phase carries the feature id, the ADR-0029 choice), leaving the SDLC phases invisible as structure
      - shape — opts.phase becomes the phase name (Plan | Build | Validate; derive spawns group under Validate as its opening leg; the remediation round's re-spawns reuse Build and Validate); the feature id (and the resolved model, per model-selection) stays on the label; meta gains the matching phases declaration while staying on the single line the shim and eslint processor pin; in multi-feature scopes the phase boxes pool across features and labels disambiguate — the accepted trade of the phase-first view
    acceptance:
      - every workflow spawn's phase opt names its SDLC phase (Plan, Build, or Validate — derive under Validate), with the feature id and resolved model riding the label
      - meta declares the three phases on its single line, and the shim harness asserts the spawn sequence's phase strings

  - id: surfacing
    title: Surfacing / re-entry (run boundary → session → human → fold-back)
    status: validated
    depends_on: [inner-loop-workflow]
    interfaces: [escalation-record]
    notes:
      - designed 2026-07-03 by grilling (ADR-0032) — the adjust skill (skills/adjust/) realizes the Adjust phase; two routes in — the-loop.md's run-boundary relay hands off when parked is non-empty, and the resolve-parked proposal routes here at re-entry; spine owns every artifact mutation
      - typed resolution kinds name re-entry points — retry | fix-in-place | re-plan | waive | defer; pre-steps attach content without changing the kind (research, config rebind, design amendment via the design skill or spine note, waiver recording); amend-design collapses into re-plan-with-pre-step, drop = a design amendment removing the node; waive valid on validate parks only, every other kind valid everywhere; menu options kind-stamped at authoring ({resolution, option}, recommended first — parsers stay lenient to pre-amendment bare strings); the human may always go off-menu
      - the resolution toolkit (ADR-0029's booking toolkit grows) — spine escalation resolve <id> <kind> is the shared spine (validate kind against record phase, flip status, kind-specific extras, delete the record, re-render Ledger), always the last mutation, --phase the damaged-park escape hatch; spine plan fix appends fix-N (the fix flag, never the remediation round-marker; covers [], plan-check-exempt both ways, depends_on all prior; on a build park it also resets the blocked task pending, chained behind the fix); spine note <id> <text> appends feature-node notes — the plan-park fix channel; spine validate waive appends { obligation, reason, approver } into the latest validations entry (waivers never expire); spine ledger append-run writes one deterministic newest-first bullet under Run history, invoked by the session at every run boundary in its own booking commit
      - retry vs patch-id dedup — resolve's retry-on-validate recipe stamps the latest validations entry with a retried mark (date — reason); ADR-0028's dedup rule amends to judge the latest entry for the patch_id (unmarked → dedup-skip; marked → all four legs run fresh, the new entry consuming the mark by position); the latent deviation-crash gap closes — dedup-skip on an unmarked deviation entry with the graph short of parked completes the missing park booking reconstruction-style
      - waive mechanics — waivers are recordings, waive is the kind only when every contract-breaking finding is waived (mixed = fix-in-place with waivers as pre-step); the skill squash-merges on human authority mirroring the validator's perfect-path (message suffixed — waived), probe-pack pin iff the runtime leg PASSed; agents/validate.md gains the consuming half — a finding matching a recorded waiver (same feature, any prior entry) is recorded as waived, never counted toward the verdict
      - choreography + commit discipline — docket first, then one escalation at a time in graph order, recommended-answer style; stalled/halted relayed, never decisioned; clean-tree gate at adjust entry (tell, never reset); one booking commit per resolution (its message — feature-id, escalation resolved, the kind — is the durable trace; waive adds the merge commit first, its crash window healing by merge-message probe); ref deletions last — re-plan deletes the plan artifact in the resolve commit and plain-deletes the branch after booking (the human's discard is the authority; the recoverability principle scopes to file deletions); port-gated one-line push (notification-channel, harness-native default) when parked/halted is non-empty; landing this feature retires CLAUDE.md's hand-maintenance rule
    acceptance:
      - a parked escalation surfaces with its kind-stamped menu at the run boundary and again at re-entry via /the-loop
      - each resolution kind folds back mechanically — status flipped, record deleted, Ledger re-rendered in one booking commit — and the next stateless run resumes the feature where the kind re-enters
      - a retry on a validate park re-runs all four legs despite patch-id dedup
      - spine ledger append-run records every run boundary as one newest-first Run-history line

  - id: ship
    title: Ship (human-gated, evidence package, health-gated delegated rollback)
    status: building
    depends_on: [validate, surfacing]
    interfaces: [ship-record]
    notes:
      - designed 2026-07-03 by grilling (ADR-0033) — the ship skill (skills/ship/) realizes Ship session-side; control policy whose swappable parts are its three ports (runtime-probe, security-review, deploy-target); no new agents or binding roles — ship is human-initiated and human-present, every evidence leg runs inline in the session; routes in via the-loop.md's ship proposal and the /the-loop ship jump
      - record-as-truth — docs/ships/ship-<N>.md pins ship_sha, design_version, features, evidence, approval, outcome; the loop/ship/<N> tag is refs-last convenience, created on deployed outcomes only; diff range = previous record's ship_sha..tip (root for ship-1); whole-frontier only — ship deploys the target's tip, never a subset (ADR-0026's trunk posture)
      - evidence at a pinned sha — ship_sha = target tip after the clean-tree gate; integration check = every pinned pack in docs/probes/ replayed on the tip tree via the recorded probe binding (ADR-0028 masking + flake protocol verbatim), verdict leg-shaped; red blocks hard — no record, no gate, no in-loop override, remedy is Evolve-shaped; security review over the diff range via the port, findings verbatim severity-ranked inform-only (the human gate is the sole authority); changelog record-resident — squash commits in range are the skeleton (bookkeeping excluded by construction), session prose per feature; live waivers on frontier features listed (ADR-0032)
      - freshness — approval binds the pin ({approver, date} beside ship_sha; approver = git user.name, the gate is synchronous); commits since ship_sha beyond this ship's own bookings void the evidence — say so and reassemble, never a stale deploy
      - the corridor — commit 1, the pre-deploy booking (record with evidence + approval, plus the plugin version bump), lands before any prod-touching command; then deploy → smoke → conclude with no further prompts (the one post-gate autonomy re-grant); smoke fail → the binding's rollback → one smoke re-run verifying restoration; outcomes deployed | rolled-back | deploy-failed (rollback still invoked — half-applied is indistinguishable from bad); a failed rollback verification is the loudest line and a full stop — never a second autonomous swing at prod; commit 2 (post-corridor) appends the outcome, and on deployed only flips the frontier validated→shipped via spine ship book + Ledger re-render; every outcome gets one newest-first Ledger history line (the shared run-boundary stream); tag last
      - smoke suite is user-defined — a component of the deploy-target binding {deploy, rollback, smoke}, recorded at Design/Configure and excerpted verbatim like the probe binding; may cite probe-pack steps or be something else entirely (softens ADR-0014's probe-smoke letter to a default suggestion; no pin-time smoke flags); absent smoke suite = no mechanical health signal = auto-rollback off for that ship, surfaced never silent
      - healing — a ship record carrying approval but no outcome surfaces as interrupted-mid-corridor at re-entry, verify-prod-by-hand; never auto-resumed
      - self-hosting binding, marketplace-on-main — the repo's own .claude-plugin/marketplace.json (source "./", static, written once) added via claude plugin marketplace add; consumption is pull-at-ship (claude plugin marketplace update + plugin update at the commit-1 tip — the installed cache is the deployed state between ships, so main-tracking stays gate-safe); rollback = snapshot-restore of the installed tree, snapshotted by the deploy step (cache retention across updates is a build-time probe, not a design assumption); smoke = claude plugin list asserts version 0.<N>.0 (↔ ship-N) + headless claude -p exercising the installed plugin on a cold-start fixture (restart-required means the live session runs old code — the self-hosting code-swap rule); corridor tests ride a scripted fixture deploy target with injectable outcomes — the real plugin CLI never enters the suite
    acceptance:
      - on a non-empty frontier, ship assembles the evidence package (all-packs replay, security findings verbatim, changelog, live waivers) pinned to ship_sha, and a red integration check blocks before any approval is solicited
      - after approval the corridor runs deploy → smoke → conclude without further prompts; a failed smoke triggers the binding's rollback and a verification re-run; all three outcomes land in the ship record with commit 2 booked, flips and Ledger only on deployed
      - a target tip moved past ship_sha beyond this ship's own bookings voids the evidence and forces reassembly — never a stale deploy
      - a ship record carrying approval but no outcome surfaces as interrupted at re-entry and is never auto-resumed

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
                  tier: rote|standard|complex,     # decision-density, stamped at Plan; selects
                                                   #   the build.<tier> model binding (ADR-0030);
                                                   #   rote = nothing left to decide AND correctness
                                                   #   fully captured by the task's tests + lint
                  depends_on: [task-id],           # ordering; overlapping footprints chained
                  report: completion-report }] }   # folded in by Build
      # marker tasks — remediation (remediation: true, ADR-0029) and fix-N (fix: true,
      # ADR-0032) — are appended mechanically (spine plan remediate / fix), cover no
      # criterion, and are exempt from plan check's coverage rules both ways

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
        retried?: note,              # "<date> — <reason>", stamped by adjust's retry resolution
                                     #   (ADR-0032): a marked latest entry re-judges despite
                                     #   patch-id dedup; the fresh entry consumes the mark
        waivers: [{ obligation, reason, approver }] }  # human resolutions — never a verdict
                                     #   value; no expiry — permanent for the feature (ADR-0032)

  - id: model-binding
    body: |
      # config/model-bindings.json (plugin defaults) ⊕ settings "the-loop".modelBindings
      # (project, then local — whole-entry replacement per role), resolved by `spine models`
      # into args.models; the role registry is open (dotted ids, ADR-0030)
      { <role>: { model,      # claude alias | full model id | 'session' (explicit inherit)
                  effort?,    # low|medium|high|xhigh|max — absent inherits session effort
                  via? } }    # agent (default) | executor id — routes to that registered
                              #   delegated executor (executors/<id>.md playbook, ADR-0031)
      # resolved form adds per-role provenance: default | project | local | fallback(session)

  - id: escalation-record
    body: |
      # docs/escalations/<feature-id>.md — narrative + one structured block (ADR-0029);
      # written by the parking agent's booking, deleted at resolution by
      # spine escalation resolve (ADR-0009/0032)
      { feature, phase: plan|build|validate, kind: feature|environment,
        deviation,                      # summary; full detail in the narrative
        menu: [{ resolution, option }], # authored by the parking agent, recommended first;
                                        #   resolution: retry|fix-in-place|re-plan|waive|defer
                                        #   (the resolution kind — named `resolution` because
                                        #   `kind` above means feature|environment; ADR-0032);
                                        #   parsers lenient to pre-amendment bare strings
        branch }                        # the loop/<feature-id> ref, when one exists

  - id: ship-record
    body: |
      # docs/ships/ship-<N>.md — narrative + one structured block (ADR-0033);
      # written by the ship skill: commit 1 books evidence + approval pre-deploy,
      # commit 2 appends the outcome post-corridor
      { ship: N, ship_sha,                 # the evidence tree: target tip at assembly
        design_version,
        features: [feature-id],            # the frontier this ship deploys
        evidence: { integration,           # all-packs replay verdict, leg-shaped (ADR-0028)
                    security: [finding],   # verbatim, severity-ranked — inform-only
                    changelog,             # squash-commit skeleton + session prose
                    waivers },             # live waivers on the frontier (ADR-0032)
        approval: { approver, date },      # binds to ship_sha — "I approved this tree"
        outcome?: deployed|rolled-back|deploy-failed,  # absent = corridor never concluded:
                                           #   surfaced as interrupted, never auto-resumed
        rollback_verified? }               # the post-rollback smoke re-run's observation
      # tag loop/ship/<N> refs-last, deployed outcomes only

  - id: runtime-probe
    body: |
      bringUp() → handle ; exercise(handle, acceptance) → observations ; teardown(handle)
      # port

  - id: port-adapter
    body: |
      Port = { requires: [capability], guarantees: [flag] }
      # configure step asserts adapter.capabilities ⊇ Port.requires; surfaces guarantee-flag trades
```
