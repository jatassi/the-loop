# Agentic Development Loop — Design Decisions

**Status:** Resolved foundational decisions, produced by a `/grill-me` session (2026-06-29) against [the design-intent doc](agentic-dev-loop-design-intent.md). This is the bridge from *intent* to *design*: it records what is **decided** and what is **deliberately deferred** to solutioning. It is itself a worked example of a Frame → sharpened-brief handoff.

---

## 1. Foundational shape

**Substrate.** The-loop is built from **native Claude Code primitives** — skills, subagents, hooks, slash commands, context briefs. It runs in an interactive session. The autonomous inner loop will likely lean on the **Workflows** feature, but that wiring is deferred. The-loop is an **augmentation to consumer coding harnesses, not a standalone agentic system** — so durable artifacts are harness-agnostic plain files even where the orchestration glue is Claude-Code-specific.

**Architecture: ports-and-adapters at the workflow level.** The-loop owns the **workflow** and a **typed inventory of component roles (ports)**. It ships an opinionated **default adapter** for each (the author's taste). Users **swap adapters per role** via the configure step without touching the workflow.
- **Ports:** task tracker (GitHub Issues / Linear / local markdown), artifact store (in-repo markdown default), VCS host, deploy target, observability/Operate backend, notification channel, **research tool** (default adapter: the `deep-research` skill), and each phase's component skill.
- **Capability contracts + explicit guarantee flags.** Each port specifies what the loop *requires* of any adapter, and the loop flags which guarantees are adapter-dependent. Q2's in-repo git-versioned guarantee is a *property of the default markdown adapter*; swapping to e.g. Linear trades it for that system's properties — explicitly, never silently.
- **The non-swappable core is the workflow and control policy** — the engine, the gates, the escalation contract. That is what the-loop *is*.

**One engine, many intakes, variable scope.** A small set of intakes (greenfield idea, brownfield feature, brownfield bug) feed one shared engine: `Frame → Design → ( Plan → Build → Validate → Adjust )* → Ship`, with Operate turning deployed apps back into intakes. Every autonomous run opens with a **scope handshake**: the agent confirms the envelope — "one-shot the app," "build this feature," "do this task" — and the same engine handles each gracefully.

---

## 2. The control model

**Front-loaded control, happy-path-autonomous execution.** Human judgment concentrates in Frame and Design. The inner loop executes autonomously **only on the happy path**.

**The autonomy gate is a strict perfection bar (pure classifier).** The autonomous-proceed condition is binary: *went exactly as planned + fully validated + 100% design fidelity* → continue. **Anything else surfaces to the human for decisioning.** There is no autonomous fix-in-place or re-plan.

**Deviation is measured at the outcome/contract boundary, not the step boundary.** Because plans specify *contracts and acceptance criteria, not implementation* (see §4), "as planned" means "met the contract." An agent fixing its own lint/test failure while still landing on the specified contract is *not* a deviation. A deviation is: failed an acceptance criterion, altered an interface/contract, discovered a design assumption was wrong, validation flagged anything, or the intent couldn't be met without changing the spec.

**Every surface carries recommendations.** Never a bare "I'm stuck." The doc's three Adjust flavors (fix-in-place → re-plan → amend-design) are repurposed as the **recommendation menu** the agent presents *with* an escalation, plus the option to recommend specific research. The human decides.

**Halt vs. park is the agent's judgment call**, reasoned from blast radius and dependencies — not a fixed rule.

**Scope envelope is the primary stop condition. The circuit breaker is the secondary backstop**, in two scopes:
- **Global aggregate** — dollars / wall-time / feature-count → pause-and-check-in even when all is well.
- **Per-task convergence** — token / iteration / retry budget within a task → convert silent thrash into a surfaced deviation. *(Operationalization deferred — liked in principle, hard in practice.)*

---

## 3. The artifact spine

The handoff artifact contract, made concrete. Each member kills one class of drift.

| Artifact | Prevents | Maintained |
|---|---|---|
| **Design** | integration drift | amended at Adjust (human-gated) |
| **System Map** | stale/expensive comprehension; sizing-budget blowout | seeded (comprehension *or* built-up), then self-maintained |
| **Project Ledger** | disorientation; enables resume | self-maintained |
| **ADRs** | lost "why" / re-litigation | emitted at gated decisions (gate DoD) |
| **Project Dictionary** | vocabulary drift / name collisions | injected-on-demand + validated |

**Format.** Hybrid: Markdown narrative for everything human judgment lives in; structured frontmatter/blocks **only for fields a machine parses deterministically** (status, feature graph + ordering, acceptance criteria, interface signatures). In-repo, git-versioned (under the default adapter).

**Self-maintenance principle.** The loop keeps its own orienting artifacts current as a *side effect of working* — true for both the System Map and the Ledger.

- **System Map** is *universal* (not brownfield-only — "the field can't stay green forever"). Brownfield seeds it via an upfront **demand-driven, cached** comprehension pass with **fingerprint-gated freshness** (the map moves with the code in the same commit; outside edits caught by fingerprint check on next intake). Greenfield starts empty and grows as the loop builds. Steady state: **Design = intended contract, System Map = as-built reality**; their divergence *is* drift.
- **Project Ledger** is the re-orientation anchor, born when Design is finalized, designed to pass the **"two-weeks-cold resume test"**: a human who has forgotten everything can re-orient and resume from it alone (what is this / where are we / what needs me / what's next). Separate from the Design artifact (state vs. contract). Granularity matches the scope envelope.
- **ADRs** are emitted at every human-gated decision (Design choices, amend-design at Adjust, fix-design in Evolve), agent-drafted + human-approved, cross-referenced from docs and code.
- **Project Dictionary** is the ubiquitous-language glossary (maps onto the `domain-modeling` skill). Seeded at Design (greenfield) or harvested during comprehension (brownfield); continually updated. The Dictionary schema and the-loop's own instance live at [`DICTIONARY.md`](../DICTIONARY.md) — a self-documenting header defining a **closed-but-governed 9-category taxonomy** (Structure · Primitive · Actor · Activity · Event · Work Unit · Artifact · State · Control) across a Process and an Architecture plane, with an ordered decision tree and a *surface-don't-shoehorn* rule (non-fit is a signal, not a box to jam into; the taxonomy amends only by an ADR-recorded decision). Doctrine (principles) is explicitly out of Dictionary scope.

**Enforcement (principle: continuous-drift artifacts need an active check; discrete-decision artifacts need gate-DoD):**
- **Dictionary** → references injected on demand (progressive disclosure); Validate checks existing-term consistency *and* new-term collision/overlap; a collision is a surfaced deviation.
- **ADRs** → part of the gate's definition-of-done; a contract-changing decision isn't complete until its ADR is drafted and approved.

---

## 4. Research — the outward knowledge primitive

Research is a **cross-cutting capability invokable at any phase**, not a phase — the **outward twin of the System Map's inward comprehension.** The System Map answers "what is *our* system"; research answers "what does *the world* know" (prior art, libraries, state of the art). Same shape: demand-driven, cached, durable, freshness-aware, feeds decisions. It is the organ that makes **"lean on what exists" actionable** — anti-NIH is a value; research is how the loop *acts* on it. Invoked across the SDLC: Frame ("does this already exist?"), Design ("state of the art / which library"), Build ("idiom / usage"), Operate ("monitoring approaches"), Evolve ("how have others solved this bug class").

**Posture — refuse to barrel through uncertainty.** The perfection bar surfaces *outcome* uncertainty ("it didn't validate"); research surfaces *epistemic* uncertainty ("I don't know this"). The loop treats both identically. **"I don't know" is a first-class, surfaced state**, never papered over.

**Port + adapter.** A research port; default adapter is the `deep-research` skill (fan-out search, fetch, adversarial verification, cited synthesis), swappable like any port. Verification + citation are *required* capabilities — stale or wrong research is worse than none (same hazard as a stale System Map).

**Output.** A durable, **cited, timestamped** findings artifact (hybrid format, in-repo). It **feeds ADRs** — the ADR for a choice cites the research that informed it, so the two-weeks-cold human recovers not just *what* was chosen but *what was surveyed*. The timestamp makes currency visible. Recurring research questions are a calibration signal (bake findings into the context-brief library).

**Two roles.** *Preventive* — resolve unknowns up front so the happy path holds. *Responsive* — a recommendation at escalation (the §2 "research to clarify" path).

**Triggering framework** (ordered by teeth; the trigger cannot rely on agent self-awareness alone, since agents do not reliably know what they don't know):
1. **Confidence-gated consequential decisions** *(enforced)* — at gated choice-points (architecture/library selection, fix-design diagnosis) the agent declares confidence + assumptions; low confidence on a consequential choice triggers research before proceeding. The confidence threshold is itself calibratable (§7).
2. **Anti-NIH default brief** at Design/Plan/Build — "before reinventing, survey what exists."
3. **Escalation recommendation** (§2).
4. **Agent self-trigger** — allowed, never the sole line of defense.

---

## 5. The engine, phase by phase

**Frame** *(human-gated)* — Freeform, wide-funnel capture (lowest tax on input) → grilling whittles to an actionable, structured brief (structure is *produced by* grilling, not demanded at capture). Grill intensity scales with the scope envelope; exit condition is "the brief is sharp enough to design against." **Recommended-answer grilling** is the default style (every question carries the agent's recommended answer). Brownfield Frame also triggers comprehension seeding and grills *against* the emerging System Map.

**Design** *(human-gated)* — Turns the brief into the high-level design (architecture, data model, interface contracts, boundaries) plus the coarse feature breakdown + ordering. Human does **feature-level slicing**; agent does task-level decomposition later. The design is **living** — amended via Adjust. Design also decides **which lifecycle concerns this project instantiates and in what form** (Operate is the clearest nudge — first-class concern, project-shaped, may be absent). Seeds the Dictionary; establishes the Ledger on finalization.

**Plan** *(autonomous)* — Decomposes the current feature into right-sized tasks exposing the widest parallelizable frontier. **The sizing chokepoint, enforced as a hard gate.** Ideal task fits in **≤50% of a 256k context window**; **bias toward over-decomposition.** A feature that won't decompose into right-sized tasks bounces *up* to re-slice (a design-level signal), not a planning retry.
- *A feature/slice is operationally constrained:* it decomposes into >1 right-sized task, and is independently validatable *and* independently shippable.

**Build** *(autonomous)* — Executes the feature's tasks against the design contract to completion, no human unless escalation triggers. *(Parallel execution coordination — how concurrent agents share state and avoid collisions — is deferred to solutioning.)*

**Validate (against design)** — The linchpin of the perfection bar. **Independent validator** (fresh context, adversarial, sees only design contract + acceptance criteria + diff/runtime — no stake in the build). Three legs: **(1)** deterministic conformance checks on machine-parseable contract elements (architecture fitness), **(2)** acceptance criteria backed by runnable tests on the existing harness, **(3)** actual runtime observation (not just green unit tests). **Integration confidence** = contract (preventive) + per-slice runtime (local) + a mandatory **full-system integration check before any Ship** (global gate).

**Adjust** *(human re-entry)* — Reconciles what building taught the loop. Under the perfection bar, the three flavors are the *recommendation menu* surfaced to the human. **Design-drift management:** when an amendment moves the design, **impact-scoped selective re-validation** (not blanket) — slices touching changed contracts are stamped **drifted** and queued; untouched slices are left alone. Rework-now vs. defer-as-tracked-debt is driven by **downstream dependency** (rework now if a not-yet-built slice depends on the changed contract). Drift is tracked debt, never silent.

**Ship** — **Build and ship cadence are decoupled.** The loop accumulates a **continuously-shippable frontier**; shipping is a separate, **human-gated** action that deploys the accumulated frontier at whatever cadence you choose (per-increment / batched / terminal), without the build loop ever blocking on a ship decision. The human approves a deploy backed by an **evidence package** (full-system integration check + security review + changelog). **Automated, health-gated rollback** delegated to the deploy target's native mechanism — the one place autonomy is re-granted *after* the gate.

**Operate** — A **first-class concern surfaced at Design, not a fixed module.** Form is project-specific (none for a static webapp; an agent on the prod box for something complex). When present: an event-driven watcher that monitors, diagnoses, and **autonomously files structured intake artifacts** — but **never acts on prod.** Leans on existing observability backends + scheduled checks.

**Evolve** — Runs the **same engine on a bug-shaped intake** with the **same gates as greenfield** — no new gating regime, because brownfield is a peer. RCA + fix-design is the Design-gate equivalent (**heavily agent-assisted, human approval required before moving on**); Ship stays human-gated. *(Severity-tiering — a sev-1 hotfix express lane — deferred.)*

---

## 6. Configuration & adoptability

**Default/override model rides on harness-native config layering** (settings.json hierarchy, CLAUDE.md scoping, skill resolution) — no parallel config system. Two override tiers: **parameter overrides** via a project config file (sizing budget, breaker thresholds, default scope, ship cadence, lifecycle concerns, dictionary/ADR strictness) and **behavior overrides** via primitive substitution. Clean **engine/preference separation**: the author's preferences *are* the shipped defaults, structured as defaults — adoption means overriding the preference layer, never forking the engine. (v1 is within Claude Code; cross-harness portability is a future payoff kept open by harness-agnostic artifacts.)

**Configure meta-step** (placeholder `/loop-config`) — out-of-band and re-invokable; the adopter on-ramp from *installed* to *configured-to-taste* without hand-editing. Uses the recommended-answer grilling style. Two scopes: **user/global taste** (cross-project) and **project setup** (deploy target, conventions). Persists to the harness-native layers. **Boundary: config = stable preferences; lifecycle-concerns stay at Design** (a judgment that depends on understanding the project).

---

## 7. Calibration

The loop decomposes better over time. **v1 captures; auto-feedback is deferred.** The signal is a near-free side effect (actual-vs-budgeted context per task, re-slice events, recurring escalation classes); early review is **human-glanceable** (you tune knobs/briefs by hand, which is how you discover what's worth automating). Implemented as a **calibration memory** (same Markdown + frontmatter + index pattern as the harness memory system) recalled at Plan/Design time. Feeds the context-brief library, sizing heuristics, and default knobs.

---

## 8. Deliberately deferred to solutioning

- **Workflow wiring of the autonomous inner loop** — the concrete mechanism that drives Plan→Build→Validate unattended.
- **Parallel execution coordination** — worktrees vs. shared-tree ownership; how concurrent agents avoid collisions and merge.
- **Per-task convergence breaker** — operationalization.
- **Security review tiers** and **Evolve severity-tiering** — which tier applies when; the hotfix express lane.
- **Resumability commit-granularity** — the atomic resumable unit; crash-mid-task recovery.

---

## 9. Standing principle captured to memory

**Plans contain no implementation code** — only small illustrative snippets and interface/contract definitions. A plan expresses the *what* and the *contract*, never the full *how*. (Reaction to plan-mode tools that dump entire implementations as codeblocks.)
