# the-loop — Feature graph

The durable state machine (ADR-0034/0037/0045): each feature record carries the
four durable statuses — `proposed | designed | validated | shipped`, the backlog
stage first. Everything in-flight (plans, branches, task commits) is derived from
git at launch time. Narrative lives in [architecture.md](architecture.md) (system)
and [designs/](designs/) (per feature).

## Feature graph

```yaml
design_version: 22
features:
  # ── walking skeleton (v1.0): the minimal self-hosting core ──────────────
  - id: document-foundation
    title: Artifact files, schemas, and the graph/plan toolkit
    status: shipped
    acceptance:
      - a feature record resolves by id; the feature graph round-trips through parse-feature-graph/write-feature-graph

  - id: the-loop-entry
    title: /the-loop stateful command + unconfigured detection + minimal onboarding
    status: shipped
    depends_on: [document-foundation]
    acceptance:
      - fresh repo routes to onboarding; configured repo reads the graph and proposes the next action

  - id: define
    title: Define skill (interview → brief)
    status: shipped
    depends_on: [the-loop-entry]
    acceptance:
      - a brain-dump is whittled to a structured, actionable brief

  - id: design
    title: Design skill (brief → docs/architecture.md + docs/feature-graph.md + per-feature docs)
    status: shipped
    depends_on: [define, document-foundation]
    acceptance:
      - a brief yields a valid docs/architecture.md, docs/feature-graph.md, and per-feature design docs, with spine check printing OK

  - id: plan
    title: Plan agent + workflow-path sizing
    status: shipped
    depends_on: [document-foundation]
    acceptance:
      - a feature decomposes into comfortably-small tasks, or is declared small workflow path and handled whole; an irreducible feature needs refinement before re-slicing

  - id: build
    title: Build (task agents in isolated worktrees)
    status: shipped
    depends_on: [document-foundation, plan]
    acceptance:
      - a feature's tasks produce a single merged diff

  - id: code-quality-baseline
    title: Code-quality bundle (distilled system-prompt rules + reference pack)
    status: shipped
    depends_on: [plan, build]
    acceptance:
      - a build agent carries the distilled code-quality rules in its system prompt; the reference pack loads on demand

  - id: validate
    title: Independent validator (tests + one independent look)
    status: shipped
    depends_on: [build]
    acceptance:
      - a built slice is judged validated/fail against contract, tests, and runtime

  - id: execution-pipeline
    title: The Workflow orchestration (Plan→Build→Validate, concurrency policy, run summary)
    status: shipped
    depends_on: [plan, build, validate]
    acceptance:
      - a scoped graph runs to a run summary with validated features merged on the target branch
      - a blocked feature surfaces at the run boundary while independent features keep draining
      - an environment-shaped block or budget exhaustion halts the run with halted set

  - id: title-preservation
    title: Status renderer preserves pre-heading content (historical; superseded by render-on-demand)
    status: shipped
    depends_on: [execution-pipeline]
    acceptance:
      - the committed status-summary renderer preserved leading title content (retired by ADR-0037)

  - id: model-selection
    title: Model selection — per-role model/effort bindings at every spawn surface
    status: shipped
    depends_on: [execution-pipeline]
    acceptance:
      - spine models-list resolves every registered role by merging plugin defaults with project and local overrides, printing per-role provenance
      - every workflow spawn passes the model and effort resolved from the bindings riding the execution context (labels carried the model until 2026-07-05 — dropped as duplication; the workflow UI shows it)
      - an unbound role falls back to the session model with a logged, run-boundary-visible fallback line — never silently
      - plan stamps judgment level on every task, spine plan check validates it, and the workflow routes build tasks through their build.<judgment_level> bindings

  - id: executor-delegation
    title: Delegated executors — rote tasks driven through registered CLI executors by a thin drive agent
    status: shipped
    depends_on: [model-selection]
    acceptance:
      - a rote task whose binding names a registered executor executes through the drive agent and that executor's CLI in an isolated worktree, landing one verified commit
      - the drive agent verifies at the build bar (tests, lint, footprint) with one retry, then returns the standard blocked shape
      - spine models-list hard-fails a binding naming an unregistered executor or a model outside its playbook; spine executors-list prints the parsed registry

  - id: workflow-phase-grouping
    title: Workflow progress groups by SDLC phase (Plan | Build | Validate)
    status: shipped
    depends_on: [execution-pipeline]
    acceptance:
      - every workflow spawn's phase opt names its SDLC phase, with the feature id riding the label
      - meta declares phases as three title-only entries in Plan, Build, Validate order on its single line

  - id: escalation-queue
    title: Escalation queue / re-entry (historical; superseded by chat-boundary decisions)
    status: shipped
    depends_on: [execution-pipeline]
    acceptance:
      - v1's escalation fold-back machinery worked as designed (retired by ADR-0034; blocked entries now surface as run-boundary questions)

  - id: release
    title: Release (per-project release runbook behind one human gate)
    status: shipped
    depends_on: [validate, escalation-queue]
    acceptance:
      - release replays the runbooks and suite at a pinned tip, holds the human gate, deploys per the recorded release runbook, verifies health, and records the outcome

  # ── deferred: built BY self-hosting ─────────────────────────────────────
  - id: worktree-parallelism
    title: Worktree parallelism — trivial-merge relaxation (test-gated merge policy at every merge point)
    status: shipped
    depends_on: [build]
    notes:
      - ADR-0038 landed the substrate (worktrees everywhere, concurrency-policy scheduling); ADR-0042 closes the hub-file remainder declaration-free — the unordered-overlap lint dies, disjointness becomes plan bias, and all three merge points (sibling merge, integration merge, publish-rebase) resolve textual conflicts under the test-gated merge policy
    acceptance:
      - a plan whose unordered tasks share a footprint file passes plan check clean
      - no loop surface still promises conflict-free merges — build and validate carry the test-gated merge policy (resolve only with a resolution serving both sides' stated intents, proven by the merged suite including both branches' tests going green; otherwise blocked naming the conflicting paths)
      - in a two-branch fixture scenario editing the same file, a composable conflict lands both edits with the suite green, and a non-composable conflict returns blocked naming the paths

  - id: diagnose
    title: Diagnose — the bug channel (RCA → fix over a permanent RCA corpus)
    status: shipped
    depends_on: [execution-pipeline]
    notes:
      - renamed from `evolve` 2026-07-05 (ADR-0043); bugs only — feature requests route to amendments, idea-shaped intakes to define
      - the former depends_on design edge was a designs-better-knowing edge, spent when this design completed 2026-07-05; build surfaces are disjoint from the design feature's
    acceptance:
      - a bug intake yields a human-approved fix (id fix-<slug>) in the graph and a permanent RCA doc at docs/bugs/fix-<slug>.md that leads with the reproduction record (steps, expected vs actual, environment, determinism, regression window), then root cause(s) with evidence (reproduced, or inspection with the waiver recorded) and the fix design
      - an environment-shaped obstacle to diagnosis (unavailable tooling, access, or logs) is surfaced to the human as a named blocker with its quality cost before proceeding — the inspection waiver is the human's grant, never a silent fallback
      - the-loop prepare-execution-context --features fix-<slug> assembles the execution context with the RCA doc as the fix's designDoc via the designs/-then-bugs/ lookup fallback, and the fix runs the unmodified execution pipeline to a validated merge
      - a shipped fix is pruned from the graph in the release commit while its RCA doc survives; the fix's regression check rides the affected feature's runbook, never an orphaned fix runbook
      - /the-loop routes a bug-shaped intake to the diagnose skill, whose diagnosis loop is a port binding (/diagnosing-bugs unless the project binds another)

  - id: operate-tooling
    title: Operate (recorded per-project ops toolkit + thin operate skill + runbook-genre rename)
    status: designed
    depends_on: [diagnose]
    notes:
      - designed 2026-07-08 from docs/briefs/operate-tooling.md; guardrails are prescriptive routing, never enforcement — a direct human ask trumps the skill's routing; nothing scheduled or autonomous (ADR-0034 stands)
    acceptance:
      - the design skill's binding interview asks the ops-toolkit questions and "how will you know something's wrong?" (a recommendation fitted to the project offered; "skip"/"none" legal), and the answers land as a `## Operations toolkit` section in docs/architecture.md holding deployment targets, capability entries each tagged read or mutate, the observability answer with each recorded apprisal path naming the runbook it routes to, runbook pointers, and a never-do list — or a recorded opt-out
      - given an ops ask in a project with a recorded toolkit, the operate skill routes the ask onto the recorded capability entries and runbook pointers, reads a routed runbook fully before acting, and precedes any mutating action with a one-line preamble naming what will run and why — mutation only via entries tagged mutate
      - the operate skill carries the instance-vs-repo action boundary — read-only ops freely; mutating instance actions via the recorded toolkit only; repo changes never, exiting to a diagnose intake that names the originating operate session; observed toolkit/runbook doc drift corrected in the same session
      - invoked in a project with no `## Operations toolkit` section, the operate skill runs the binding interview first, records the section, then proceeds with the original ask — no graph amendment, no re-entering Design
      - this repo's docs/architecture.md carries its own recorded Operations toolkit section
      - the operate skill text names no particular deployment target, observability product, or vendor toolchain
      - the rename landed atomically with npm test and npm run check green — heading `## Validation procedure` replaces `## Validation runbook` everywhere living code reads it, validator-recorded procedures live at docs/validation/<feature-id>/procedure.md (the existing seven moved content-identical), and unqualified "runbook" means the operational genre on every living surface, the validation sense grepping to zero outside historical records (docs/adr/, docs/research/, docs/briefs/, docs/releases/, docs/bugs/) and the pinned eval corpus
      - the glossary's `runbook` entry is redefined to the operational genre and a `validation procedure` entry carries "runbook (validation sense)" as a historical alias, inheriting the pre-sweep alias already on today's `runbook` entry

  - id: calibration-capture
    title: Calibration Memory (per-project capture, recalled at Plan/Design)
    status: designed
    depends_on: [execution-pipeline, plan, design]
    notes:
      - designed 2026-07-08 from docs/briefs/calibration-capture.md; capture separates loop-overhead tokens from build tokens so "earns its context" is measured, not assumed (2026-07-01 review; seed methodology = the v2 benchmark forensics); ADR-0046 exempts the capture commit from ADR-0034's no-bookkeeping rule
      - "`record` (agent role) and `calibration-summarize` (CLI verb) blind-generated and human-approved 2026-07-08 per the naming standard"
    acceptance:
      - given a run that reaches its run summary, exactly one calibration commit lands on the target branch adding docs/calibration/runs/<date>-<seq>.md whose yaml payload carries per feature the workflow path, planned task sizes/judgment levels/footprints, per-role agent counts, outcome with reason, and any re-slice detail — and per run prepared_at, scope, target, and tokens spent with per-role sampled deltas and their serial-or-overlapped attribution flag — with zero human or session action
      - the payload is computed in the workflow script as a deterministic function of observed run events (same observations produce a byte-identical payload); the record agent writes it verbatim and adds only git-derived enrichment (per-feature duration, files touched, insertions/deletions, commit count) — no free-text interpretation appears anywhere in the record
      - the-loop calibration-summarize regenerates docs/calibration/index.md wholesale and deterministically from the record corpus (same corpus yields a byte-identical file; the digest section stays within 40 lines) with one line per run below the digest, and exits 1 naming the offending file on a malformed record
      - prepare-execution-context carries the index's digest section in the execution context when docs/calibration/index.md exists and omits the field otherwise; the plan prompt includes the digest only when present; a repo with no calibration history yields an execution context and prompts byte-identical to today's
      - a run ending blocked or environment-halted still lands its record; a record-agent failure or a budget-exhausted halt leaves the run summary unchanged, costing only that record and one log line
      - the record agent and calibration-summarize read and write only the target repository, and the design skill's slicing step consults docs/calibration/index.md when present

  - id: configure
    title: Configure — the hook inventory, four settings layers, and the recommended-answer interview
    status: designed
    depends_on: [the-loop-entry, model-selection]
    notes:
      - designed 2026-07-08 (ADR-0049) — replaces the configure-step-full backlog node together with onboard; brief at docs/briefs/configure-step-full.md
      - persistence is the namespaced "the-loop" settings key; the sanctioned userConfig/pluginConfigs path was re-verified 2026-07-08 and re-rejected (scalar-only types, no programmatic write)
    acceptance:
      - /the-loop configure (or the configure skill directly) prints every inventory hook with its resolved value, layer, and provenance (default|user|project|local|fallback), including the recorded bindings' present/absent/opted-out status
      - an interview answer persists to its stated settings layer under the "the-loop" key with a per-answer destination override honored, and unrelated keys in the target file byte-survive the write
      - the resolver merges defaults < user (~/.claude/settings.json) < project < local for every hook family, and models-list output is unchanged apart from the new layer and provenance stamp
      - an unbound hook behaves as its declared fallback-or-block — fallback families resolve with a visible fallback line, block families report the named gap
      - an artifact-store binding is captured per docs grouping with local as the default, readable back through the resolver (capture-only; adapters are ports-adapters-full)

  - id: onboard
    title: Onboard — configure's superset; greenfield hand-off and brownfield assess-and-fill
    status: designed
    depends_on: [configure, define, design]
    notes:
      - designed 2026-07-08 (ADR-0049) — replaces the configure-step-full backlog node together with configure
    acceptance:
      - on a fresh empty repo, the front door's onboarding route runs the configure leg before Define, with a recommended answer on every question
      - on a brownfield fixture repo (code + tests + CI, no loop artifacts), one onboard pass detects the infrastructure, interviews only the gaps, and leaves the settings-side hooks and the three recorded-binding sections populated or explicitly opted out with every write human-confirmed
      - Design's recorded-binding interviews confirm-or-fill instead of re-asking when onboard already recorded a section

  - id: role-agent-binding
    title: Phase-agent swap — an agent field on the role-binding table
    status: designed
    notes:
      - designed 2026-07-08 (ADR-0050) — split from ports-adapters-full; independently shippable, no configure dependency
    acceptance:
      - a role binding carrying an agent name makes the pipeline spawn that agent type for the role; every unbound role spawns its bundled agent, byte-for-byte today's behavior
      - a role binding carrying both agent and executor is rejected at resolution as a named configuration gap — the resolved view shows it and the pipeline treats the role as blocked, never silently picking one
      - the resolved-bindings output shows the agent field with its layer and provenance like every other binding

  - id: ports-adapters-full
    title: Adapters — documented external-surface bindings, consumed (features→Linear proof)
    status: designed
    depends_on: [configure]
    notes:
      - rescoped 2026-07-08 from "swapping + capability-contract enforcement" (brief docs/briefs/ports-adapters-full.md, ADR-0050) — documentation-as-adapter; enforcement machinery stays dead
    acceptance:
      - capturing a nondefault artifact-store binding surfaces its trade-offs for explicit human acceptance and runs a reachability probe before any write; a failed probe offers fix-now or bind-anyway; nothing is written silently
      - a swap that replaces an existing local artifact offers a backup (a pre-swap git tag by default) before the local file is retired
      - every captured nondefault binding has docs/adapters/<surface>.md answering what lives there, how to access it, which operations exist tagged read or mutate, and its caveats
      - on a sandbox project (scratch repo + scratch Linear team — never this repo's own graph) with features bound to Linear on a real account, a run derives its execution context from Linear truth (issues, blockedBy edges, acceptance prose) through an ephemeral materialized snapshot, and status transitions write back Linear-first; the snapshot is torn down, never committed
      - removing the binding (after the documented export path restores docs/feature-graph.md) returns the project to in-repo behavior with a visible fallback line
      - a bound-but-unreachable surface reports can't-run naming the surface — never a silent fallback to local state

  - id: research-tiers
    title: Research port (lightweight default + confidence-gate + deep-research escalation)
    status: proposed
    depends_on: [execution-pipeline]
    notes:
      - escalation-prompt prior art (surveyed 2026-07-05) — `research-prompt` in https://github.com/davidondrej/skills; a decision-led single-paragraph prompt with numbered sub-questions, fact-vs-inference separation, and a mandatory self-critique gap round before finishing
    acceptance:
      - low confidence on a consequential decision triggers research; rigor scales with consequence

  - id: severity-tiering
    title: Severity tiering (the sev-1 hotfix express workflow path through the diagnose channel)
    status: proposed
    depends_on: [diagnose]
    acceptance:
      - a sev-1 intake takes an expedited, still-gated path

  - id: plugin-dir-restructure
    title: Plugin content into a source subdirectory (repo root stops being the plugin root)
    status: shipped
    depends_on: [release]
    notes:
      - "blocks releasing: the installer copies the plugin root wholesale — no ignore mechanism exists (docs checked 2026-07-08), so eval/ and dev node_modules ship in the bundle; the sanctioned pattern is a marketplace source subdirectory (v0.4.6 release aborted at the gate on this)"
      - designed 2026-07-08 (ADR-0048) — plugin content → plugin/, marketplace source → ./plugin, the one runtime dep (yaml) vendored under the new root; PLUGIN_ROOT and braced CLAUDE_PLUGIN_ROOT self-rehome, so the move is near-mechanical
    acceptance:
      - a fresh copy of the plugin source subdirectory (the installed cache or a git-subdir clone) contains agents/, commands/, skills/, workflows/, config/, bin/, src/, and the vendored yaml, and contains no eval/, no docs/, no test/, no dev devDependencies, and no repo-root gitignored artifacts
      - the loop runs end to end from the installed plugin — the-loop status --json, prepare-execution-context, models-list, plan check, and check all succeed with ${CLAUDE_PLUGIN_ROOT} resolving to the subdirectory, and no plugin surface references a path outside the plugin root
      - the recorded Release runbook, run verbatim, deploys the plugin from the subdirectory source (marketplace.json source → ./plugin, plugin.json relocated under it) and its health check passes against the installed version
      - npm test and npm run check pass green from the repo root after the move — every src/bin import, package.json bin/scripts/exports, and eslint target resolves to the new plugin/ locations, and the feature graph still byte-round-trips

  # ── naming redesign (ADR-0044): clean-slate rename below the brand tier ──
  - id: naming-map
    title: Name inventory + blind candidates → the human-approved rename map
    status: shipped
    acceptance:
      - docs/design/naming-map.md enumerates every name below the brand tier from a recorded enumeration tip, grouped into the standard families (eight at design time; seam adjustments recorded in the map), each row carrying a jargon-free purpose line
      - every proposed name was generated by fresh-context agents shown only the purpose line, grammatical role, and family siblings — never the current name
      - every row carries an explicit human verdict (keep, or rename to a named replacement); no row is unresolved or silently dropped
      - a fresh no-context agent, shown each approved name plus its grammatical role, states a purpose the validator judges correct

  - id: rename-sweep
    title: Apply the approved rename map across every living surface in one atomic landing
    status: shipped
    depends_on: [naming-map]
    acceptance:
      - every approved rename is applied across living surfaces (docs, skills, agents, commands, workflows, bin, src, test) and each replaced old name greps to zero outside historical records (docs/adr/, docs/research/, docs/briefs/, the founding design docs, and the moved record corpora at docs/releases/ and docs/bugs/) and the frozen map
      - a coverage re-check at the sweep's branch point catches names born after the map's enumeration — each is standard-compliant or surfaced as a deviation, never silently skipped
      - every renamed term carries its old name as a `(historical)` alias in the swept glossary, and historical records are content-identical to their pre-sweep state — byte-identical in place, except the two approved content-identical moves (docs/ships/* → docs/releases/, docs/rca/* → docs/bugs/)
      - the approved map's sweep-mechanics notes are implemented — orient and ledger collapse into one status subcommand (human summary by default, --json for the machine orientation); literal branch, commit-subject, and fix- prefixes stay; the /grilling binding id survives; the deferred feature-status expansion is NOT implemented
      - paired data+code renames (status enum values, branch prefix, commit-subject shape, artifact-path constants) land atomically with npm test and npm run check green on the landed tree
      - the loop runs end to end under the new vocabulary — the machine orientation reads the swept graph and the run-preparation subcommand assembles a valid execution context — and the code-quality baseline carries the distilled naming rule

  # ── post-sweep amendments ────────────────────────────────────────────────
  - id: run-presentation
    title: Run presentation — scope-derived workflow description and prefix-free spawn labels
    status: shipped
    depends_on: [execution-pipeline, workflow-phase-grouping]
    notes:
      - the harness reads a workflow's description only from the script's pure-literal meta, so a per-run description requires the splice-a-per-run-script mechanism — see the design doc
    acceptance:
      - given a valid scope, prepare-execution-context with --script-out <path> writes a copy of the canonical workflow script differing only in its meta description — one line naming the target branch and every in-scope feature id (past 5 ids, the first 5 then +<k> more) — while stdout stays the unchanged execution context; without the flag nothing is written
      - the splice is quote-safe (the description value lands JSON-stringified, meta stays one physical line) and shape-gated — a canonical script whose meta line doesn't match the expected description shape makes the command exit 1 with nothing written
      - no spawn label in the workflow carries a phase or agentType prefix — plan and validate labels are the bare feature id, build labels are <feature>/<task>, drive labels are <feature>/<task> via <executor>
      - the /the-loop launch leg passes --script-out and the Workflow call's scriptPath is the spliced per-run script, never the canonical workflows/ file

  - id: proposed-status
    title: "`proposed` backlog stage — feature status enum expansion"
    status: shipped
    depends_on: [document-foundation, the-loop-entry]
    notes:
      - born from the naming-map's deferred feature-status expansion (the docs/TODO.md item this amendment deletes); value name blind-derived and human-approved 2026-07-05 per the naming standard
    acceptance:
      - a graph containing a feature with status `proposed` and no acceptance list passes `the-loop check` OK, while a `designed` feature missing acceptance still fails with missing-acceptance
      - given a scope naming a proposed feature, prepare-execution-context exits 1 with a gate error naming the feature and stating it must be designed first, printing nothing to stdout
      - a designed feature depending on a proposed one is excluded from the eligible set, and the machine orientation proposes kind `design` naming the blocking proposed id
      - on a graph whose only unshipped features are proposed, the machine orientation proposes kind `design` naming them (never `new-intake`), and the human status summary counts the proposed stage
      - the /the-loop route table maps a `design` proposal to the design skill, and every living surface stating the status enum lists the four values — the three-value statement greps to zero outside historical records

  - id: build-agent-title-progress
    title: Task-position prefix on divided-feature build agent titles
    status: shipped
    depends_on: [run-presentation]
    notes:
      - refines run-presentation's build/drive label shapes; run-presentation's shipped acceptance stays the historical record of what it delivered (bare labels), this feature's criteria carry the (i/N)-prefixed shapes
    acceptance:
      - given a feature built as 2+ tasks, each build agent's spawn label is `(<pos>/<N>) <feature>/<task>` — <pos> the task's 1-based position in the plan's task array, <N> the total — so the 2nd of 3 tasks reads `(2/3) <feature>/<task>`
      - given a task in a 2+-task feature that routes to a registered executor, its drive spawn label is `(<pos>/<N>) <feature>/<task> via <executor>`
      - given a feature built via the small workflow path, or a standard plan with exactly one task, the build spawn label carries no prefix (the bare `<feature>/feature` / `<feature>/<task>`) — `(1/1)` never appears
      - given any of the above, branch names, commit subjects, and merge order are byte-identical to before the prefix — the prefix lives only in the display label
```
