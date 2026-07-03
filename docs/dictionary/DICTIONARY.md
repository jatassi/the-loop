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

### craft baseline
**aliases:** craft pack · **status:** active
The universal engineering-craft layer — architecture patterns, code standards, smells, dev approach — bound via the `craft-baseline` [[port]] (optional tier). The default adapter is the plugin's bundled pack: three pieces matched to insertion points — the [[build constitution]] (build-time), design vocabulary & principles (Design/Plan), and the review catalog (the validator's **standards axis**). Always overridden by [[project standards]]: a documented repo standard wins, and an endorsed pattern suppresses the baseline smell that would flag it. Admission test for every rule: would the model or the linter already know this? Then it doesn't land.
*Not to be confused with:* [[project standards]] — the per-repo layer that outranks it.
*See:* ADR-0027

### build constitution
**aliases:** the constitution · **status:** active
The [[craft baseline]]'s one-page build-time piece: reuse-before-build ladder, completeness rules, banned reasoning moves, anti-speculation. Injected **unconditionally** into every build agent as a mandatory read step — deterministic, never model-triggered. Everything larger stays out of the builder's window; catalogs belong to review.
*See:* ADR-0027

### project standards
**aliases:** — · **status:** active
The per-repo craft layer: `docs/standards/<topic>.md` (one concept per file, lead with the rule, code example) plus an `index.md` of one-line descriptions the [[Plan]] agent matches against. Seeded greenfield / mined brownfield at [[Design]] (a lifecycle nudge beside runtime-probe, observability, lint-regime), each rule human-confirmed, unobvious-only. Selected per task into the [[task contract]]'s `standards` field. **Shrinks over time**: a rule the codebase demonstrably exemplifies is retired.
*Not to be confused with:* [[craft baseline]] — the shipped universal layer these standards override.
*See:* ADR-0027

### remediation brief
**aliases:** — · **status:** active
The [[independent validator]]'s batched standards-axis findings (file:line, named smell or standard, suggested direction) — the input to the **one** refactor task the validator's [[booking]] appends to the feature's [[plan artifact]] via the mechanical `spine plan remediate` (flags-not-fixes: the command shapes the task, a fresh build agent executes it). The appended task doubles as the durable round-marker: its presence in the plan means the round is burned. Hard-bounded to a single round per feature, and triggered only when standards findings are the *sole* blocker between the verdict and perfect — composed mechanically as the verdict value `remediation-pending` (merge withheld; never `perfect`, so ADR-0026's only-validated-work-merges invariant holds); findings that survive re-validation are recorded advisory or park per the deviation-severity axis. The sibling of the [[sizing gate]]'s reslice brief — a structured message from one phase back to another.
*See:* ADR-0027 / ADR-0029

### integration target
**aliases:** — · **status:** active
The bound git ref that validated [[feature]]s squash-merge into — where "done" work integrates. One knob, bound at [[Design]] (human-gated) and recorded in the [[Design artifact]]; default `main` (trunk-based: `main` = everything validated so far, [[Ship]] gates deployment, not integration). A rewrite-scale intake binds an intake branch (`loop/intake/<name>`) instead, which Ship merges to `main`. The run machinery is target-agnostic.
*See:* ADR-0026

### blind derivation
**aliases:** — · **status:** active
The independence protocol at the head of [[Validate]]: a separate **blind deriver** agent receives only the feature-level contract slice (feature node, acceptance criteria, interface contracts) plus the [[runtime probe]] binding — its inputs are its blindfold: no diff, no builder tests, no completion reports, and no plan artifact (task contracts carry footprints, the implementation's file layout; task-level checking lives in legs 2 and 3) — and writes the [[expectation sheet]] before any builder output is opened. The slice arrives by injection from the run's `args` snapshot (resolved by the session at launch) — the deriver stays Read-only and prompt-fed, holding no way to fetch what the blindfold excludes. **Control-group posture:** the deriver's surface is procedural only — it is never told it is blind, what it is blind to, or that anything judges against its sheet; the protocol lives in the orchestrator and the validator, never in the deriver's prompt. Interpretation divergence discovered downstream routes as a **spec-ambiguity** advisory folded back to the [[Design artifact]], not just the verdict record.

### expectation sheet
**aliases:** — · **status:** active
The blind deriver's output: per **feature** acceptance criterion, the expected observable behavior and the probe steps that would elicit it, each written to be falsifiable. Anchors the conformance leg's spec axis, scripts the runtime leg's exercise, and seeds the feature's [[probe pack]] entry.

### probe pack
**aliases:** — · **status:** active
The accreting suite of validated features' pinned probe exercises: `docs/probes/<feature-id>.md`, steps + expected observations captured from the green validation run (volatile fields masked at pin time so replays are judgment-free). Emitted and pinned by the validator's post-verdict [[booking]]. Full-pack replay runs in every validation's runtime leg (the regression half of the behavioral diff) and *is* [[Ship]]'s full-system check. A failed replay retries twice: consistent red → contract-breaking regression citing the pinning feature; intermittent → entry marked `flaky` (advisory once, then a Ledger attention item). A replay failure is legitimate only when the new feature's contract citably supersedes the pinned behavior — then the booking re-pins.

### delta proof
**aliases:** — · **status:** active
The runtime leg's causality check: the new feature's blind-derived exercise must run **red on the merge-base tree and green on the merged tree** — proof the diff caused the claimed behavior, TDD's watch-it-fail lifted to the probe level. Green on both trees is a **vacuous exercise**: contract-breaking, citing the acceptance criterion whose runtime-observability failed to discriminate.

### integrity forensics
**aliases:** forensics leg · **status:** active
[[Validate]]'s first leg: a deterministic spine scanner over the merge-base diff, plan artifact, and completion reports, hunting constitution-banned moves (existing-test mutation, disabling directives, suppressions, harness/config tampering, test-environment sniffing, exit-code manipulation, undeclared footprint excursions). Hits are **presumed findings**: the validator triages each — confirm (contract-breaking; short-circuits the run) or dismiss with a structured justification recorded in leg evidence, never silently. The one sanctioned downgrade of a mechanical signal, bounded by per-hit structure and audit visibility.

### runtime probe
**aliases:** runtime-exercise capability · **status:** active
The project-configured [[port]] for bringing the system up and exercising it ("how to run it"), driving the runtime-observable acceptance criteria ("what to observe"). Powers [[Validate]]'s runtime leg and the pre-Ship full-system integration check at larger scope. Greenfield has nothing to infer it from, so [[Design]] **nudges** the user to provide it; its absence is a deliberate, surfaced opt-out, never a silent skip.
*See:* ADR-0013

### walk-away surface
**aliases:** — · **status:** active
The ambient "what is my loop doing" visibility + escalation-notification surface — *composed*, not built: the `/workflows` progress tree + `log()` narrator lines (live, mid-run), the [[Project Ledger]] (resting, between runs), and the notification-channel [[port]] (push at a [[run boundary]], default: only when something needs you). Meta-observability of the loop's own execution rides the same pieces plus git history. Distinct from debugging introspection.
*See:* ADR-0019

### model binding table
**aliases:** model bindings, binding table · **status:** active
The per-role table mapping each [[spawn role]] to a model, optional effort, and executor (`via`). Ships as plugin defaults, overridable per project and per user in harness-native settings; resolved with per-role provenance (default | project | local | fallback) by the spine resolver, which is the single source for every spawn surface. An unbound role falls back to the session model — visibly, never silently.
*See:* ADR-0030

### spawn role
**aliases:** role · **status:** active
The typed identity a spawn surface declares when it launches a subagent — bare phase names for the workflow roles (`plan`, `derive`, `validate`), dotted ids elsewhere (`plan.audit`, `build.rote`, `design.reader`, `drive`, …). The registry is open: any surface may declare one; the [[model binding table]] binds the known ones and the rest ride the visible session-model fallback.
*See:* ADR-0030

### delegated executor
**aliases:** executor · **status:** active
A non-Claude headless coding CLI that a rote-tier task's binding may route to (`via` naming its registered executor id), always operated and verified by the [[driver]] — its self-reported success is never trusted. Registered by an **executor playbook** (`executors/<id>.md`: a machine block for the resolver and pre-flight, operational lore for the driver) behind the `delegate-executor` [[port]], which binds its adapters concurrently, keyed by executor id. The grok CLI ships first; codex- or gemini-style CLIs register the same way. Off unless a project rebinds `build.rote`.
*See:* ADR-0031

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
The fresh-context, adversarial agent that runs [[Validate]] with no stake in the build — what makes the [[perfection bar]] trustworthy rather than self-graded. Judges against the [[expectation sheet]] (written blind before any builder output is opened) and checks acceptance *differently* from the builder: real-world-shaped behavior via the [[runtime probe]], never trust in the builder's tests. Flags-not-fixes; its only sanctioned tree mutations are mechanical git operations and union-rule conflict resolutions, each declared in verdict evidence (the declared-mutation invariant); it cannot spawn agents.
*See:* ADR-0028

### orchestrator
**aliases:** — · **status:** active
The actor that drives the autonomous [[inner loop]] — sequencing Plan→Build→Validate, enforcing the [[circuit breaker]], and surfacing at gates. Concretely a **Claude Code Workflow script** (deterministic JS orchestration); the human/autonomous boundary is the workflow edge. (Formerly aliased "the driver"; that name now belongs to the [[driver]] actor, ADR-0031.)
*See:* ADR-0001

### driver
**aliases:** drive agent · **status:** active
The one Claude agent that executes rote-tier [[task]]s through any [[delegated executor]], parameterized by the executor's playbook: it assembles the prompt from the [[task contract]] plus the craft baseline, runs the CLI in an isolated worktree per the playbook's invocation template, verifies the result itself (per-criterion tests, lint, diff review, commit presence — the executor's self-report is never trusted), folds the commit onto the [[feature branch]], and books like any build agent. Spawned by the `drive` [[spawn role]] when a task's binding routes `via` a registered executor.
*See:* ADR-0031

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
Checks a built [[slice]] against the design via an [[independent validator]]. [[blind derivation]] first produces the [[expectation sheet]]; readiness then integrates the feature's task branches and rebases onto the [[integration target]] (assembly, not authoring — [[trivial conflict]]s union-resolve, [[semantic conflict]]s park), and four legs follow: [[integrity forensics]], two-axis conformance (spec vs standards, never merged), acceptance-criteria tests on the existing harness, and runtime observation via the project's [[runtime probe]] (full [[probe pack]] replay + the [[delta proof]]). Per-leg verdicts (PASS/FAIL/BLOCKED/SKIP, fail-closed) compose mechanically into perfect|deviation; only a perfect verdict squash-merges. Verdicts persist append-only at `docs/validations/`.
*See:* ADR-0028 / ADR-0013 / ADR-0012

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

### booking
**aliases:** self-booking · **status:** active
The durable, target-side commit(s) a phase agent makes recording its own phase's ending — the rule being: **the agent that ends a feature's run-participation books that ending.** The plan agent books the plan artifact + `designed→planned` (or its bounce-park); each build agent books its own completion-report fold-in (first task also `planned→building`); a blocked build agent books the park; the [[independent validator]] books validate-or-park post-verdict (validations append, [[probe pack]] pin, graph flip, Ledger re-render, [[escalation record]] on deviation). Bookings use the mechanical toolkit (`spine plan report` / `set-status` / `ledger render` / `plan remediate`) — no agent hand-edits graph YAML or Ledger prose. Any booking that flips graph status re-renders the Ledger in the same commit.
*Not to be confused with:* the phase's *work product* (a diff, a verdict) — booking is the bookkeeping that records it on the [[integration target]].
*See:* ADR-0029

### greenfield onboarding
**aliases:** cold-start branch · **status:** active
The guided new-project setup experience — the cold-start branch of [[/the-loop]] when a project has no config and no [[Project Ledger]] to resume. Sequences [[configure step]] (bind ports/adapters + parameter defaults) → [[Frame]] → [[Design]] (runtime-probe, observability, and lifecycle nudges), all in [[recommended-answer style]]. Stable bindings at Configure, project-judgment shaping at Design.
*See:* ADR-0017

---

## Event

### escalation
**aliases:** surface · **status:** active
The moment the loop pulls the human back for decisioning — fired by a [[deviation]], a gate, or a [[circuit breaker]] trip. Always carries a *recommendation menu*: the options the human chooses among — fix-in-place, re-plan the slice, amend the design, or do specific [[research]]. Under [[park-and-drain]] an escalation is *raised* when its trigger fires (the slice is parked) but *surfaced* batched at the next [[run boundary]].

### waiver
**aliases:** — · **status:** active
A typed human resolution on a contract-breaking [[finding]]: "this obligation-violation doesn't matter for this feature; merge anyway." Shape: the obligation cited (never file:line — obligations are stable, lines aren't), reason, approver, optional expiry (a date or a feature-id condition). The verdict stays `deviation` — a waiver is a **resolution, never a verdict value** — and the fold-back squash-merges on human authority with the waiver recorded. Suppresses re-flagging of that obligation-violation on re-validations of the same feature only; never generalizes. Expired-unresolved waivers surface as Ledger attention items; [[Ship]]'s evidence package lists all waivers on the frontier.
*Not to be confused with:* [[deviation]] — the machine-observed state a waiver resolves, which it never erases.

### scope handshake
**aliases:** — · **status:** active
The moment, before autonomous execution begins, when the agent confirms the [[scope envelope]] with the human.

### run boundary
**aliases:** — · **status:** active
The instant an autonomous [[orchestrator]] run concludes and returns control to the interactive session — the only point at which parked decisions are surfaced. Reached when the dependency-ready frontier is exhausted or a [[run halt]] fires. Under [[park-and-drain]], escalations accumulate and surface here as a batch.
*Not to be confused with:* [[escalation]] — one surfaced decision, vs. the run boundary, the return moment that may carry a batch of them.
*See:* ADR-0001

### run halt
**aliases:** halt · **status:** active
Run-level early termination — distinct from a park, which is feature-level. Two causes: an **environment block** (dirty tree, test-harness or probe precondition down — a condition that would fail every subsequent feature identically, typed as such in the blocking agent's return) and **budget exhaustion** (the harness ceiling throws at the next spawn; in-flight agents complete and their [[booking]]s land). A halting run books nothing for the halting condition and returns a `BoundaryResult` with `halted: {reason, detail}` set, so the session distinguishes "decide something" from "fix the environment / raise the budget."
*Not to be confused with:* [[park-and-drain]] — feature-shaped failures park and the run drains on; run-shaped failures halt.
*See:* ADR-0029

---

## Work Unit

### feature
**aliases:** slice · **status:** active
The unit of one [[inner loop]] pass: a vertical slice that decomposes into more than one [[task]] and is independently validatable and shippable. Used interchangeably with **slice** ("feature" stresses the unit of work, "slice" the vertical, shippable nature).

### feature branch
**aliases:** — · **status:** active
The one git branch a [[feature]]'s build lives on: `loop/<feature-id>`, cut from the [[integration target]] when Build picks the feature up. Tasks commit onto it (one commit per task; the task is the crash-recovery quantum); it carries **code only** — bookkeeping commits on the integration target. Lifecycle invariant: the branch exists iff its feature is building or parked — a clean squash-merge or a work-discarding resolution deletes it, so the branch inventory always mirrors the graph's in-flight set.
*See:* ADR-0026

### task
**aliases:** — · **status:** active
The atomic unit of agent execution: fits within ≤50% of a 256k context window, carries its own acceptance criteria, and yields a reviewable diff. The output of [[Plan]] decomposition; its handoff shape is the [[task contract]].

### task contract
**aliases:** — · **status:** active
The Plan → Build handoff shape carried per [[task]] in the [[plan artifact]]: id, title, status, `covers` (which feature acceptance criteria it claims), its own acceptance criteria (one or more, each observable and binary — written for a build agent weaker than the planner), `injects` (contract slices the build agent gets), expected file `footprint`, `size` (xs|s|m — m is the comfort ceiling, justified in the narrative), `tier` (the [[decision-density tier]]), and `depends_on` ordering (overlapping footprints must be chained). Carries no implementation code; Build folds a [[completion report]] into it.
*See:* ADR-0025 / ADR-0030

### completion report
**aliases:** — · **status:** active
Build's return value per [[task]], folded into its [[task contract]]: result, actual footprint (checkpoint diff), actual diff size, deviations, and a summary. [[Validate]] reads the deviations; [[Calibration Memory]] mines estimate-vs-actual; an actual footprint far beyond the expected one is a re-plan/re-slice signal.
*See:* ADR-0025

### decision-density tier
**aliases:** tier · **status:** active
[[Plan]]'s per-task judgment of *how much the task leaves to decide* — `rote` (nothing left to decide, and correctness fully captured by the task's own tests + lint), `standard`, or `complex` — stamped in the [[task contract]] and selecting the `build.<tier>` entry of the [[model binding table]]. Deliberately not the footprint-proxy `size`: tier exists for the decision-dense-small and rote-large corners size mislabels. Rote is the stratum a project may rebind to a [[delegated executor]]; its eligibility clause is provisional, to be recalibrated from observed outcomes.
*See:* ADR-0030

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
The ephemeral file (`docs/escalations/<feature-id>.md`) holding a parked [[escalation]]'s detail — validator findings, recommendation menu, context. Born when a [[feature]] parks — written by the parking agent's [[booking]] (the plan agent on bounce, the blocked build agent, the validator on deviation); survives across sessions while *open* so [[/the-loop]] can re-surface it; **deleted when the escalation is resolved**. Git history is its archive — deletion keeps the working tree lean without losing recoverability.
*Not to be confused with:* [[escalation]] (the decision-moment event) — this is the transient working file that informs it.
*See:* ADR-0009

---

## State

### deviation
**aliases:** — · **status:** active
The condition of not clearing the [[perfection bar]], measured at the **outcome/contract** boundary (not the step boundary). Fires an [[escalation]].

### stall
**aliases:** stalled feature · **status:** active
A [[feature]] the run could neither advance nor park: its phase agent died (a `null` return — user skip or terminal API error). Nothing is booked and nothing retried in-run — the graph never advanced, so the next stateless pass simply re-runs the phase. Reported in `BoundaryResult.stalled` `{feature, phase, note}` so a dead agent is never silently absorbed.
*Not to be confused with:* a park — a stall leaves no [[escalation record]] and needs no human decision, only a re-run.
*See:* ADR-0029

### finding
**aliases:** validator finding · **status:** active
The unit the [[independent validator]] emits: one observation citing its location (file:line or probe observation), naming what it violates or suggests. Carries exactly one of two severities — **contract-breaking** (falsifies a citable obligation: an acceptance criterion, an interface-contract clause, a task-selected [[project standards]] rule, or an integrity rule; the citation is mandatory, and a finding that cannot cite an obligation is not contract-breaking, by construction) or **advisory** (recorded, never parks). Leg verdicts derive mechanically from finding severities; no judgment sits at the composition step.

### trivial conflict
**aliases:** union-resolvable conflict · **status:** active
A merge/rebase conflict whose resolution is the pure union of both sides — every conflicted hunk resolves by keeping both sides' lines, authoring no new tokens and discarding none (the barrel-export / route-table case). The [[independent validator]] resolves it mechanically during Validate's readiness stage and records the resolution as verdict evidence; the downstream legs validate the resolved tree, so a semantically-wrong union surfaces as a leg failure rather than landing silently.
*Not to be confused with:* [[semantic conflict]] — anything past the union line, which parks.

### semantic conflict
**aliases:** — · **status:** active
A merge/rebase conflict that is not a [[trivial conflict]]: resolution would require choosing a side, editing content, or authoring new tokens — authoring, which the [[independent validator]] must never do. Blocks Validate's readiness stage and parks the feature as a conflict-shaped [[deviation]].

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
