# the-loop — Project Dictionary

The ubiquitous language for **the-loop**. Proper nouns for the system, its phases, artifacts, concepts, and components — pinned so agents use them consistently instead of inventing synonyms.

## How this file works (schema v2)

Each entry is:

```
### Canonical Term
**aliases:** <comma list or —> · **status:** active
Prose definition — precise enough to check usage against.
*Not to be confused with:* [[Other Term]] — why they differ.   (optional)
*See:* ADR-00x / doc §y                                          (optional provenance)
```

**Machine-parsed fields:** the `###` canonical term, `aliases`, `status`. The **definition is prose** (its consistency check is semantic, run by an agent).

### Scope

The Dictionary covers **operational terms** — the things the loop runs, produces, and governs. It deliberately does **not** cover **Doctrine** (principles and values — "earns its context," "lean on what exists," the uncertainty posture); those live in the design docs, not here. A candidate term that isn't operational is a signal, not a gap — leave it to the design docs rather than minting an entry.

The section headings below are informal wayfinding, nothing more — place a new entry wherever it reads best. (Schema v1's closed nine-category taxonomy was retired by ADR-0022: nothing consumed the category, so classification was labor without a payoff.)

**Status values:** `active` · `deprecated → Canonical Term` (a tombstone for a renamed/retired term, so old names resolve to new ones).

**Rules:**
- **Use canonical terms verbatim.** Validate flags an alias used where a canonical term exists, and usage inconsistent with a definition.
- **Register every new proper noun here** when you mint one. Validate flags a new term that collides or overlaps with an existing one — a collision is a surfaced [[deviation]].
- Relevant entries are **injected on demand** — you will not always be shown the whole file.

> Schema may harden to per-entry YAML frontmatter if a stricter parse is ever required; v2 favors readability.

---

## Structure

### the-loop
**aliases:** the loop · **status:** active
The system itself: an augmentation layer of native harness primitives (skills, subagents, hooks, commands) that moves an idea through the full SDLC. Owned and composable, not a standalone agentic framework. Packaged as a Claude Code plugin (its own code), separate from the [[target repo]] where the artifacts it produces live.
*Not to be confused with:* [[the engine]] (the shared core) or [[the inner loop]] (the per-feature cycle).

### the engine
**aliases:** the shared engine · **status:** active
The single shared core every intake feeds: Frame → Design → ( Plan → Build → Validate → Adjust )\* → Ship. The non-swappable heart of the-loop.
*Not to be confused with:* [[the-loop]] (the whole product) or [[the inner loop]] (just the iterative middle).

### the inner loop
**aliases:** per-feature loop · **status:** active
The autonomous per-feature cycle run inside [[the engine]]: Plan → Build → Validate → Adjust, repeated once per [[feature]].
*Not to be confused with:* [[the engine]] (which also includes Frame, Design, Ship).

### port
**aliases:** component role · **status:** active
A typed component role the-loop defines and depends on (task tracker, artifact store, deploy target, observability backend, notification channel, research tool, component skill). The full tiered inventory lives in [ports.md](../ports/ports.md).
*See:* ADR-0024

### adapter
**aliases:** — · **status:** active
A concrete implementation that satisfies a [[port]], realized as a native primitive — a skill, subagent, MCP server, or configured command/script. Bound per-port via the loop's project config (harness-native layering); the [[configure step]] checks it against the port's [[capability contract]] and surfaces any [[guarantee flag]] trade. Default adapters ship with the plugin; swaps never touch the workflow.
*See:* ADR-0016

### capability contract
**aliases:** — · **status:** active
What the loop requires of any [[adapter]] for a given [[port]], so swaps are safe.

### guarantee flag
**aliases:** — · **status:** active
A loop guarantee (e.g. git-versioned resume) explicitly marked as dependent on a particular [[adapter]], so swapping it makes the trade visible rather than silent.

### non-swappable core
**aliases:** — · **status:** active
The one thing that is not a [[port]]: the workflow and control policy — the engine, the gates, the escalation contract. What the-loop *is*.

### target repo
**aliases:** project repo · **status:** active
The project repository the-loop is currently operating on — where every per-project artifact lives, git-versioned in-repo. Distinct from the plugin that holds the-loop's own code: the plugin is disposable and swappable, the target repo's artifacts are durable.
*See:* ADR-0002

### runtime probe
**aliases:** runtime-exercise capability · **status:** active
The project-configured [[port]] for bringing the system up and exercising it ("how to run it"), driving the runtime-observable acceptance criteria ("what to observe"). Powers [[Validate]]'s runtime leg and the pre-Ship full-system integration check at larger scope. Greenfield has nothing to infer it from, so [[Design]] **nudges** the user to provide it; its absence is a deliberate, surfaced opt-out, never a silent skip.
*See:* ADR-0013

### walk-away surface
**aliases:** — · **status:** active
The ambient "what is my loop doing" visibility + escalation-notification surface — *composed*, not built: the `/workflows` progress tree + `log()` narrator lines (live, mid-run), the [[Project Ledger]] (resting, between runs), and the notification-channel [[port]] (push at a [[run boundary]], default: only when something needs you). Meta-observability of the loop's own execution rides the same pieces plus git history. Distinct from debugging introspection.
*See:* ADR-0019

---

## Primitive

### grilling
**aliases:** grill-me · **status:** active
The adversarial interview primitive (one question at a time, each with a recommended answer) that drives [[Frame]], [[Design]], and the [[configure step]]. Whittles a wide input to an actionable output. A [[port]]: the default adapter is the user-level `/grilling` skill, loaded by whichever phase needs the interview.

### recommended-answer style
**aliases:** — · **status:** active
The default [[grilling]] mode: every question carries the agent's recommended answer, lowering human effort and surfacing assumptions for correction.

### configure step
**aliases:** /loop-config · **status:** active
The re-invokable setup primitive that elicits preferences via [[grilling]] and persists them to harness-native config layers — binding [[port]]s to [[adapter]]s (checking each [[capability contract]]) and setting parameter defaults. Runs out-of-band *and* as the first leg of [[greenfield onboarding]] (the cold-start branch of [[/the-loop]]).
*See:* ADR-0017 / ADR-0016

### research
**aliases:** — · **status:** active
The cross-cutting capability for *outward* knowledge (prior art, libraries, state of the art) — the twin of the [[System Map]]'s inward comprehension. Produces [[Research Findings]]. Default adapter is a **lightweight cited web search**; the `deep-research` skill is the **escalation tier** the confidence-gate reaches for on consequential, low-confidence decisions. Rigor scales with consequence: citation always, adversarial verification proportional to stakes.
*See:* ADR-0018

### /the-loop
**aliases:** — · **status:** active
The single stateful entry command — the system's front door. Consults the [[Project Ledger]], states its inferred position, and proposes the next action (the [[scope handshake]] in practice); `/the-loop <phase>` jumps directly to a phase. Named `/the-loop` because `/loop` is a reserved word in most harnesses.
*See:* ADR-0002

### injection-on-demand
**aliases:** — · **status:** active
The technique that realizes "earns its context": an agent is handed only the slice of an artifact it needs, addressed by stable `id`, never the whole document. A single session-side **resolver** maps id → physical location (the only layer that knows whether an artifact is one file or split), so layout changes are transparent to every consumer. Across the workflow edge the session extracts a compact **feature graph index** and seeds the Workflow via `args`; task agents demand-read their addressed slice for detail.
*See:* ADR-0004

### Operate
**aliases:** — · **status:** active
On-demand agent tooling to conduct production operations and debugging — invoked *reactively* by the human when something went wrong or needs doing, **not** a scheduled always-on agent. The always-on layer is instead an **observability solution** (sized to the project at [[Design]], possibly none) that apprises the human directly; the agent is pulled in only when needed, and a resulting code change becomes a brownfield intake → [[Evolve]]. Never acts on prod unless the human is driving.
*See:* ADR-0015

---

## Actor

### independent validator
**aliases:** — · **status:** active
The fresh-context, adversarial agent that runs [[Validate]] with no stake in the build — what makes the [[perfection bar]] trustworthy rather than self-graded.

### orchestrator
**aliases:** the driver · **status:** active
The actor that drives the autonomous [[inner loop]] — sequencing Plan→Build→Validate, enforcing the [[circuit breaker]], and surfacing at gates. Concretely a **Claude Code Workflow script** (deterministic JS orchestration); the human/autonomous boundary is the workflow edge.
*See:* ADR-0001

---

## Activity

### Frame
**aliases:** — · **status:** active
First human-gated phase. A wide-funnel freeform brain-dump narrowed by [[grilling]] into an actionable [[Brief]]. Brownfield Frame also triggers [[System Map]] comprehension seeding.

### Design
**aliases:** — · **status:** active
Second human-gated phase. Turns the [[Brief]] into the [[Design artifact]] plus the feature breakdown and ordering, and decides which lifecycle concerns the project instantiates.
*Not to be confused with:* [[Design artifact]] (the document this phase produces).

### Plan
**aliases:** — · **status:** active
Autonomous phase. Decomposes the current [[feature]] into right-sized [[task]]s exposing the widest [[parallelizable frontier]]. Home of the [[sizing gate]]. Gateless — no human plan approval; mechanical checks (criterion coverage, overlap ordering, sizing, edges) plus a conditional fresh-context audit compensate. Emits the [[plan artifact]].
*See:* ADR-0025

### Build
**aliases:** — · **status:** active
Autonomous phase. Executes a feature's tasks against the [[Design artifact]] to completion, with no human present unless an [[escalation]] fires. Concurrent tasks run **isolated in per-task git worktrees** (Plan keeps them file-disjoint so merge-back is clean); tasks produce diffs and defer testing/runtime to [[Validate]]; a merge conflict surfaces as a [[deviation]] (a re-plan signal). Merge-back is agent-performed and script-sequenced — the workflow script can't run git.
*See:* ADR-0012

### Validate
**aliases:** — · **status:** active
Checks a built [[slice]] against the design via an [[independent validator]] (fresh, adversarial, sees only contract + acceptance + diff/runtime). Begins by integrating the feature's task branches (the Build merge folds in here — assembly, not authoring, so independence holds), then runs three legs: deterministic conformance, acceptance-criteria tests on the existing harness, and runtime observation via the project's [[runtime probe]]. A merge conflict or any short-of-perfect leg → [[deviation]].
*See:* ADR-0013 / ADR-0012

### Adjust
**aliases:** — · **status:** active
The human re-entry phase. Reconciles what building taught, presents the options at an [[escalation]], and governs [[drift]] management.

### Ship
**aliases:** — · **status:** active
Human-gated deploy of the [[shippable frontier]], decoupled from build cadence. The human approves an **evidence package** = full-system integration check (the [[runtime probe]] at full scope) + a baseline security review (a port; default adapter the harness `/security-review`) + an auto-derived changelog. Rollback is **health-gated and delegated**: post-deploy, the runtime probe's smoke checks run against prod; failure → the deploy target's native rollback. The one place autonomy is re-granted after the gate.
*See:* ADR-0014

### Evolve
**aliases:** — · **status:** active
Re-entry for a bug or feature request: [[the engine]] run on a brownfield intake with the same Design and Ship gates. RCA + fix-design is agent-assisted, human-approved.

### autonomous run
**aliases:** run · **status:** active
One stateless pass of the [[orchestrator]] over the [[feature graph]]: read the graph, process the dependency-ready [[feature]]s (Plan→Build→Validate each), commit results, and return a `BoundaryResult` at the [[run boundary]]. Holds no durable state of its own — the feature graph is the durable state machine, so "resuming" is just a fresh run over the updated graph, never a replay.
*Not to be confused with:* [[the inner loop]] (the cycle-concept) — a run is one concrete execution of it over a [[scope envelope]].
*See:* ADR-0009 / ADR-0008

### greenfield onboarding
**aliases:** cold-start branch · **status:** active
The guided new-project setup experience — the cold-start branch of [[/the-loop]] when a project has no config and no [[Project Ledger]] to resume. Sequences [[configure step]] (bind ports/adapters + parameter defaults) → [[Frame]] → [[Design]] (runtime-probe, observability, and lifecycle nudges), all in [[recommended-answer style]]. Stable bindings at Configure, project-judgment shaping at Design.
*See:* ADR-0017

---

## Event

### escalation
**aliases:** surface · **status:** active
The moment the loop pulls the human back for decisioning — fired by a [[deviation]], a gate, or a [[circuit breaker]] trip. Always carries a *recommendation menu*: the options the human chooses among — fix-in-place, re-plan the slice, amend the design, or do specific [[research]]. Under [[park-and-drain]] an escalation is *raised* when its trigger fires (the slice is parked) but *surfaced* batched at the next [[run boundary]].

### scope handshake
**aliases:** — · **status:** active
The moment, before autonomous execution begins, when the agent confirms the [[scope envelope]] with the human.

### run boundary
**aliases:** — · **status:** active
The instant an autonomous [[orchestrator]] run concludes and returns control to the interactive session — the only point at which parked decisions are surfaced. Reached when the [[parallelizable frontier]] is exhausted, the [[circuit breaker]] trips, or a halt-class [[deviation]] fires. Under [[park-and-drain]], escalations accumulate and surface here as a batch.
*Not to be confused with:* [[escalation]] — one surfaced decision, vs. the run boundary, the return moment that may carry a batch of them.
*See:* ADR-0001

---

## Work Unit

### feature
**aliases:** slice · **status:** active
The unit of one [[inner loop]] pass: a vertical slice that decomposes into more than one [[task]] and is independently validatable and shippable. Used interchangeably with **slice** ("feature" stresses the unit of work, "slice" the vertical, shippable nature).

### task
**aliases:** — · **status:** active
The atomic unit of agent execution: fits within ≤50% of a 256k context window, carries its own acceptance criteria, and yields a reviewable diff. The output of [[Plan]] decomposition; its handoff shape is the [[task contract]].

### task contract
**aliases:** — · **status:** active
The Plan → Build handoff shape carried per [[task]] in the [[plan artifact]]: id, title, status, `covers` (which feature acceptance criteria it claims), its own acceptance criteria (one or more, each observable and binary — written for a build agent weaker than the planner), `injects` (contract slices the build agent gets), expected file `footprint`, `size` (xs|s|m — m is the comfort ceiling, justified in the narrative), and `depends_on` ordering (overlapping footprints must be chained). Carries no implementation code; Build folds a [[completion report]] into it.
*See:* ADR-0025

### completion report
**aliases:** — · **status:** active
Build's return value per [[task]], folded into its [[task contract]]: result, actual footprint (checkpoint diff), actual diff size, deviations, and a summary. [[Validate]] reads the deviations; [[Calibration Memory]] mines estimate-vs-actual; an actual footprint far beyond the expected one is a re-plan/re-slice signal.
*See:* ADR-0025

---

## Artifact

### Brief
**aliases:** sharpened brief · **status:** active
Output of [[Frame]]: the messy idea pressure-tested into an actionable statement of intent that [[Design]] consumes. Lives at `docs/briefs/brief.md` in the [[target repo]] — one intake at a time; a superseded Brief survives in git history.

### Design artifact
**aliases:** the design · **status:** active
The living high-level design — architecture, data model, interface contracts, boundaries, feature breakdown. The *intended* contract; [[Validate]] checks fidelity to it. Lives at `docs/design/design.md` in the [[target repo]] (narrative prose + embedded structured blocks, including the [[feature graph]]); scales from a single file to additional split files within `docs/design/` past ~1k lines.
*Not to be confused with:* [[Design]] (the phase) or [[System Map]] (the *as-built* reality).
*See:* ADR-0003

### feature graph
**aliases:** — · **status:** active
The DAG embedded in the [[Design artifact]]: feature nodes (each with a stable `id`, `status`, `depends_on`, `interfaces`, acceptance, and `design_version`) wired by `depends_on` edges. Orders the features, exposes what [[Plan]] can pick up, and carries the per-node [[drift stamp]].
*Not to be confused with:* [[Design artifact]] (the whole document; the feature graph is one block within it) or [[parallelizable frontier]] (the task-level concurrency within a single feature).
*See:* ADR-0003

### System Map
**aliases:** the map · **status:** active
The *as-built* model of the actual system (inward knowledge). Lives at `docs/system-map/system-map.md` in the [[target repo]], addressed by `id` through the same resolver as the Design ([[injection-on-demand]]). Nodes are as-built modules/components (per-module default, configurable), each carrying its real interfaces, a `realizes` reference to the Design [[feature]](s) it implements, and a [[fingerprint]]. Seeded by comprehension (brownfield) or grown as the loop builds (greenfield); self-maintained, with scoped re-comprehension when a node goes stale.
*Not to be confused with:* [[Design artifact]] — intended contract vs. as-built reality; their divergence is [[drift]].
*See:* ADR-0005

### Project Ledger
**aliases:** the Ledger · **status:** active
The top-level re-orientation/status artifact: a persisted, glanceable `docs/ledger/ledger.md` that powers [[/the-loop]]. **Read-by-human, written-by-loop** — an output surface, never hand-authored. Its status is *derived* (rendered from the [[feature graph]], the single source of truth, so it cannot drift from it) and stamped with the graph [[fingerprint]] it was projected from; it owns only what lives nowhere else (orientation prose, run history, the next-action proposal). Backbone is the four questions — what is this / where are we / what needs me / what's next. Born when [[Design]] is finalized; re-rendered at each [[run boundary]]; built to pass the [[two-weeks-cold resume test]].
*See:* ADR-0006

### plan artifact
**aliases:** the plan · **status:** active
Output of [[Plan]] for one [[feature]]: `docs/plans/<feature-id>.md` in the [[target repo]], loop-written — a short decomposition narrative plus the machine-parsed `## Tasks` block of [[task contract]]s, stamped with the `design_version` it was cut from. Build and [[Validate]] consume it; Build folds each task's [[completion report]] back in; [[Calibration Memory]] mines its estimate-vs-actual.
*Not to be confused with:* [[Plan]] (the phase that writes it).
*See:* ADR-0025

### ADR
**aliases:** Architecture Decision Record · **status:** active
A recorded decision (context · decision · consequences) emitted at every gated decision; cross-referenced from docs, the [[Project Ledger]], and code. Cites [[Research Findings]] when relevant.

### Project Dictionary
**aliases:** the Dictionary · **status:** active
This artifact (canonically `docs/dictionary/DICTIONARY.md`): the ubiquitous-language glossary that pins proper nouns to prevent vocabulary drift and name collisions.

### Research Findings
**aliases:** — · **status:** active
The durable, cited, timestamped output of the [[research]] primitive. Feeds [[ADR]]s.

### Calibration Memory
**aliases:** — · **status:** active
Accumulated decomposition and escalation signal (Markdown + frontmatter + index, the harness-memory pattern), held **per-project in the [[target repo]]** for tight signal-to-noise, recalled at Plan/Design to decompose better over time. Cross-project wisdom is *not* stored here — it rides the configurable defaults (the human-curated prior); this is the per-project posterior. v1 is capture-only.
*See:* ADR-0007

### escalation record
**aliases:** — · **status:** active
The ephemeral file (`docs/escalations/<feature-id>.md`) holding a parked [[escalation]]'s detail — validator findings, recommendation menu, context. Born when a [[feature]] parks; survives across sessions while *open* so [[/the-loop]] can re-surface it; **deleted when the escalation is resolved**. Git history is its archive — deletion keeps the working tree lean without losing recoverability.
*Not to be confused with:* [[escalation]] (the decision-moment event) — this is the transient working file that informs it.
*See:* ADR-0009

---

## State

### deviation
**aliases:** — · **status:** active
The condition of not clearing the [[perfection bar]], measured at the **outcome/contract** boundary (not the step boundary). Fires an [[escalation]].

### drift
**aliases:** — · **status:** active
Divergence between a built [[slice]] and an amended [[Design artifact]], or between [[Design artifact]] (intended) and [[System Map]] (as-built). Tracked as debt, never silent.

### drift stamp
**aliases:** — · **status:** active
The marker placed on a slice that still conforms to a superseded design version, flagging it for scoped re-validation or rework.

### blast radius
**aliases:** — · **status:** active
The scope of impact of a failure or change. Drives halt-vs-park (at [[escalation]]) and rework-vs-defer (at [[drift]]).

### shippable frontier
**aliases:** the frontier · **status:** active
The accumulated set of validated, independently-deployable slices awaiting a [[Ship]] decision. Build cadence is decoupled from ship cadence.
*Not to be confused with:* [[parallelizable frontier]] (concurrent tasks within a feature).

### parallelizable frontier
**aliases:** — · **status:** active
The set of mutually-independent [[task]]s within a feature that [[Plan]] exposes to run concurrently.
*Not to be confused with:* [[shippable frontier]] (validated slices awaiting deploy).

### fingerprint
**aliases:** — · **status:** active
The git content hash (tree/blob) of the code paths a [[System Map]] node covers, stored on the node. Recomputed at intake and [[Plan]]; a mismatch marks the node stale and triggers scoped re-comprehension. The mechanism behind fingerprint-gated freshness.
*See:* ADR-0005

---

## Control

### perfection bar
**aliases:** — · **status:** active
The strict autonomous-proceed condition: went exactly as planned, fully validated, 100% design fidelity. Anything short is a [[deviation]] and surfaces.

### sizing gate
**aliases:** — · **status:** active
The hard check in [[Plan]] that every [[task]] fits ≤50% of a 256k window. Rather than precisely estimate, it **over-decomposes until each task is comfortably small** — a loose threshold check fed by soft proxies (files/read-size, interface contracts touched, expected diff size) plus agent judgment, sharpened over time by [[Calibration Memory]]. Unclear/over → split again; irreducibly-too-big → bounce up to re-slice the [[feature]] (a design signal), carrying a **reslice brief** — why irreducible plus suggested re-slices.
*See:* ADR-0011 / ADR-0025

### circuit breaker
**aliases:** — · **status:** active
Not a loop-managed subsystem (retired, ADR-0010). An [[autonomous run]] is bounded *structurally* — by the [[scope envelope]], [[park-and-drain]] frontier-exhaustion, the [[sizing gate]], and the harness's hard 1000-agent cap. A tighter *cost* cap is opt-in and ad hoc: the human passes a budget at launch; the loop never auto-calculates one.
*See:* ADR-0010

### scope envelope
**aliases:** — · **status:** active
The confirmed extent of an autonomous run — one task, one feature, or a whole app. The *primary* stop condition; the structural bounds (frontier-exhaustion, [[sizing gate]], the harness agent cap) are the backstop. Confirmed at the [[scope handshake]].

### two-weeks-cold resume test
**aliases:** — · **status:** active
The acceptance test for the [[Project Ledger]]: a human who has forgotten everything can re-orient and resume from it alone.

### park-and-drain
**aliases:** — · **status:** active
The escalation policy under the [[perfection bar]]: a [[deviation]] *parks* its [[slice]] (drift-stamps or blocks it) instead of halting the run, and the [[orchestrator]] keeps executing the independent frontier; parked escalations batch and surface at the next [[run boundary]]. One deviation does not end the run — the run ends only when the frontier is exhausted, the [[circuit breaker]] trips, or a halt-class deviation's [[blast radius]] forces a full stop.
*See:* ADR-0001
