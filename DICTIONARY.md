# the-loop — Project Dictionary

The ubiquitous language for **the-loop**. Proper nouns for the system, its phases, artifacts, concepts, and components — pinned so agents use them consistently instead of inventing synonyms.

## How this file works (schema v1)

Each entry is:

```
### Canonical Term
**category:** <category> · **aliases:** <comma list or —> · **status:** active
Prose definition — precise enough to check usage against.
*Not to be confused with:* [[Other Term]] — why they differ.   (optional)
*See:* ADR-00x / doc §y                                          (optional provenance)
```

**Machine-parsed fields:** the `###` canonical term, `category`, `aliases`, `status`. The **definition is prose** (its consistency check is semantic, run by an agent).

### The category taxonomy — closed but governed

The Dictionary covers the **operational ontology** across two planes — *Process* (what runs) and *Architecture* (how it's built). It deliberately does **not** cover **Doctrine** (principles and values — "earns its context," "lean on what exists," the uncertainty posture); those live in the design docs, not here.

| Plane | Category | Is it… |
|---|---|---|
| Architecture | **Structure** | static wiring/composition — apparatus that *doesn't run* |
| Architecture | **Primitive** | a reusable named *tool/technique* invoked to do work |
| Process | **Actor** | a thing with *agency* that performs work |
| Process | **Activity** | a *sustained* stage/process with duration |
| Process | **Event** | an *instantaneous* occurrence/trigger that fires at a moment |
| Process | **Work Unit** | a *quantum of work* with its own completion criteria |
| Process | **Artifact** | a *durable* thing produced, read, and versioned |
| Process | **State** | a *condition / measure / configuration* that obtains and changes |
| Process | **Control** | something that *governs* whether things proceed — a gate, budget, policy, or contract |

**To classify a term, ask these in order and stop at the first "yes"** (the order resolves multi-fit — e.g. a *task* reaches Work Unit before it can be mistaken for an Artifact; *escalation* the act reaches Event before Activity, while the *escalation contract* the rule reaches Control):

1. Has agency? → **Actor**
2. A quantum of work with its own completion criteria? → **Work Unit**
3. Durable — produced, read, versioned? → **Artifact**
4. Static wiring that *doesn't run*? → **Structure**
5. A reusable tool invoked to do work? → **Primitive**
6. An instantaneous occurrence/trigger? → **Event**
7. A sustained stage/process? → **Activity**
8. Governs whether things proceed? → **Control**
9. A condition/measure that obtains and changes? → **State**

**Tie-breaker:** classify by *primary function*, not implementation — a circuit breaker is built as a mechanism, but its job is to govern, so it is a Control.

**If a term fits none — surface it, do not shoehorn.** A term that resists all nine is a signal: either the taxonomy needs a new category, or it is not an operational term (it may be doctrine). The category set is **closed but governed** — amended only by a surfaced, ADR-recorded decision, exactly like the living design. Never jam a term into the nearest box to conform; non-fit is information.

**Status values:** `active` · `deprecated → Canonical Term` (a tombstone for a renamed/retired term, so old names resolve to new ones).

**Rules:**
- **Use canonical terms verbatim.** Validate flags an alias used where a canonical term exists, and usage inconsistent with a definition.
- **Register every new proper noun here** when you mint one. Validate flags a new term that collides or overlaps with an existing one — a collision is a surfaced [[deviation]].
- Relevant entries are **injected on demand** — you will not always be shown the whole file.

> Schema may harden to per-entry YAML frontmatter if a stricter parse is ever required; v1 favors readability.

---

## Structure

### the-loop
**category:** structure · **aliases:** the loop · **status:** active
The system itself: an augmentation layer of native harness primitives (skills, subagents, hooks, commands) that moves an idea through the full SDLC. Owned and composable, not a standalone agentic framework.
*Not to be confused with:* [[the engine]] (the shared core) or [[the inner loop]] (the per-feature cycle).

### the engine
**category:** structure · **aliases:** the shared engine · **status:** active
The single shared core every intake feeds: Frame → Design → ( Plan → Build → Validate → Adjust )\* → Ship. The non-swappable heart of the-loop.
*Not to be confused with:* [[the-loop]] (the whole product) or [[the inner loop]] (just the iterative middle).

### the inner loop
**category:** structure · **aliases:** per-feature loop · **status:** active
The autonomous per-feature cycle run inside [[the engine]]: Plan → Build → Validate → Adjust, repeated once per [[feature]].
*Not to be confused with:* [[the engine]] (which also includes Frame, Design, Ship).

### port
**category:** structure · **aliases:** component role · **status:** active
A typed component role the-loop defines and depends on (task tracker, artifact store, deploy target, observability backend, notification channel, research tool, component skill).

### adapter
**category:** structure · **aliases:** — · **status:** active
A concrete implementation that satisfies a [[port]]. Default adapters ship as opinionated defaults; users swap them without touching the workflow.

### capability contract
**category:** structure · **aliases:** — · **status:** active
What the loop requires of any [[adapter]] for a given [[port]], so swaps are safe.

### guarantee flag
**category:** structure · **aliases:** — · **status:** active
A loop guarantee (e.g. git-versioned resume) explicitly marked as dependent on a particular [[adapter]], so swapping it makes the trade visible rather than silent.

### non-swappable core
**category:** structure · **aliases:** — · **status:** active
The one thing that is not a [[port]]: the workflow and control policy — the engine, the gates, the escalation contract. What the-loop *is*.

---

## Primitive

### grilling
**category:** primitive · **aliases:** grill-me · **status:** active
The adversarial interview primitive (one question at a time, each with a recommended answer) that drives [[Frame]] and the [[configure step]]. Whittles a wide input to an actionable output.

### recommended-answer style
**category:** primitive · **aliases:** — · **status:** active
The default [[grilling]] mode: every question carries the agent's recommended answer, lowering human effort and surfacing assumptions for correction.

### configure step
**category:** primitive · **aliases:** /loop-config · **status:** active
The out-of-band, re-invokable setup primitive that elicits preferences via [[grilling]] and persists them to harness-native config layers.

### research
**category:** primitive · **aliases:** — · **status:** active
The cross-cutting capability for *outward* knowledge (prior art, libraries, state of the art) — the twin of the [[System Map]]'s inward comprehension. Produces [[Research Findings]].

---

## Actor

### independent validator
**category:** actor · **aliases:** — · **status:** active
The fresh-context, adversarial agent that runs [[Validate]] with no stake in the build — what makes the [[perfection bar]] trustworthy rather than self-graded.

### orchestrator
**category:** actor · **aliases:** the driver · **status:** active
The actor that drives the autonomous [[inner loop]] — sequencing Plan→Build→Validate, enforcing the [[circuit breaker]], and surfacing at gates. Its concrete implementation (likely the harness Workflows feature) is deferred to solutioning.

---

## Activity

### Frame
**category:** activity · **aliases:** — · **status:** active
First human-gated phase. A wide-funnel freeform brain-dump narrowed by [[grilling]] into an actionable [[Brief]]. Brownfield Frame also triggers [[System Map]] comprehension seeding.

### Design
**category:** activity · **aliases:** — · **status:** active
Second human-gated phase. Turns the [[Brief]] into the [[Design artifact]] plus the feature breakdown and ordering, and decides which lifecycle concerns the project instantiates.
*Not to be confused with:* [[Design artifact]] (the document this phase produces).

### Plan
**category:** activity · **aliases:** — · **status:** active
Autonomous phase. Decomposes the current [[feature]] into right-sized [[task]]s exposing the widest [[parallelizable frontier]]. Home of the [[sizing gate]].

### Build
**category:** activity · **aliases:** — · **status:** active
Autonomous phase. Executes a feature's tasks against the [[Design artifact]] to completion, with no human present unless an [[escalation]] fires.

### Validate
**category:** activity · **aliases:** — · **status:** active
Checks a built [[slice]] against the design via an [[independent validator]]: deterministic conformance + acceptance-criteria tests + real runtime observation.

### Adjust
**category:** activity · **aliases:** — · **status:** active
The human re-entry phase. Reconciles what building taught, presents the options at an [[escalation]], and governs [[drift]] management.

### Ship
**category:** activity · **aliases:** — · **status:** active
Human-gated deploy of the [[shippable frontier]], with automated health-gated rollback. Decoupled from build cadence.

### Operate
**category:** activity · **aliases:** — · **status:** active
A project-shaped, often-optional concern decided at [[Design]]. When present, an event-driven watcher that monitors prod and files intakes but **never acts on prod**.

### Evolve
**category:** activity · **aliases:** — · **status:** active
Re-entry for a bug or feature request: [[the engine]] run on a brownfield intake with the same Design and Ship gates. RCA + fix-design is agent-assisted, human-approved.

---

## Event

### escalation
**category:** event · **aliases:** surface · **status:** active
The moment the loop pulls the human back for decisioning — fired by a [[deviation]], a gate, or a [[circuit breaker]] trip. Always carries a *recommendation menu*: the options the human chooses among — fix-in-place, re-plan the slice, amend the design, or do specific [[research]].

### scope handshake
**category:** event · **aliases:** — · **status:** active
The moment, before autonomous execution begins, when the agent confirms the [[scope envelope]] with the human.

---

## Work Unit

### feature
**category:** work unit · **aliases:** slice · **status:** active
The unit of one [[inner loop]] pass: a vertical slice that decomposes into more than one [[task]] and is independently validatable and shippable. Used interchangeably with **slice** ("feature" stresses the unit of work, "slice" the vertical, shippable nature).

### task
**category:** work unit · **aliases:** — · **status:** active
The atomic unit of agent execution: fits within ≤50% of a 256k context window, carries its own acceptance criteria, and yields a reviewable diff. The output of [[Plan]] decomposition.

---

## Artifact

### Brief
**category:** artifact · **aliases:** sharpened brief · **status:** active
Output of [[Frame]]: the messy idea pressure-tested into an actionable statement of intent that [[Design]] consumes.

### Design artifact
**category:** artifact · **aliases:** the design · **status:** active
The living high-level design — architecture, data model, interface contracts, boundaries, feature breakdown. The *intended* contract; [[Validate]] checks fidelity to it.
*Not to be confused with:* [[Design]] (the phase) or [[System Map]] (the *as-built* reality).

### System Map
**category:** artifact · **aliases:** the map · **status:** active
The *as-built* model of the actual system (inward knowledge). Seeded by comprehension (brownfield) or grown as the loop builds (greenfield); self-maintained with fingerprint freshness.
*Not to be confused with:* [[Design artifact]] — intended contract vs. as-built reality; their divergence is [[drift]].

### Project Ledger
**category:** artifact · **aliases:** the Ledger · **status:** active
The top-level re-orientation/status artifact. Born when [[Design]] is finalized, self-maintained, built to pass the [[two-weeks-cold resume test]].

### ADR
**category:** artifact · **aliases:** Architecture Decision Record · **status:** active
A recorded decision (context · decision · consequences) emitted at every gated decision; cross-referenced from docs, the [[Project Ledger]], and code. Cites [[Research Findings]] when relevant.

### Project Dictionary
**category:** artifact · **aliases:** the Dictionary · **status:** active
This artifact (canonically `DICTIONARY.md`): the ubiquitous-language glossary that pins proper nouns to prevent vocabulary drift and name collisions.

### Research Findings
**category:** artifact · **aliases:** — · **status:** active
The durable, cited, timestamped output of the [[research]] primitive. Feeds [[ADR]]s.

### Calibration Memory
**category:** artifact · **aliases:** — · **status:** active
Accumulated decomposition and escalation signal (Markdown + frontmatter, like harness memory), recalled at Plan/Design to decompose better over time.

---

## State

### deviation
**category:** state · **aliases:** — · **status:** active
The condition of not clearing the [[perfection bar]], measured at the **outcome/contract** boundary (not the step boundary). Fires an [[escalation]].

### drift
**category:** state · **aliases:** — · **status:** active
Divergence between a built [[slice]] and an amended [[Design artifact]], or between [[Design artifact]] (intended) and [[System Map]] (as-built). Tracked as debt, never silent.

### drift stamp
**category:** state · **aliases:** — · **status:** active
The marker placed on a slice that still conforms to a superseded design version, flagging it for scoped re-validation or rework.

### blast radius
**category:** state · **aliases:** — · **status:** active
The scope of impact of a failure or change. Drives halt-vs-park (at [[escalation]]) and rework-vs-defer (at [[drift]]).

### shippable frontier
**category:** state · **aliases:** the frontier · **status:** active
The accumulated set of validated, independently-deployable slices awaiting a [[Ship]] decision. Build cadence is decoupled from ship cadence.
*Not to be confused with:* [[parallelizable frontier]] (concurrent tasks within a feature).

### parallelizable frontier
**category:** state · **aliases:** — · **status:** active
The set of mutually-independent [[task]]s within a feature that [[Plan]] exposes to run concurrently.
*Not to be confused with:* [[shippable frontier]] (validated slices awaiting deploy).

---

## Control

### perfection bar
**category:** control · **aliases:** — · **status:** active
The strict autonomous-proceed condition: went exactly as planned, fully validated, 100% design fidelity. Anything short is a [[deviation]] and surfaces.

### sizing gate
**category:** control · **aliases:** — · **status:** active
The hard check in [[Plan]] that every [[task]] fits ≤50% of a 256k window; bias to over-decompose; overflow bounces up to re-slice the [[feature]].

### circuit breaker
**category:** control · **aliases:** — · **status:** active
The aggregate safety backstop, in two scopes: **global** ($/time/feature-count → pause-and-check-in) and **per-task convergence** (token/iteration budget → surface thrash).

### scope envelope
**category:** control · **aliases:** — · **status:** active
The confirmed extent of an autonomous run — one task, one feature, or a whole app. The *primary* stop condition; the [[circuit breaker]] is the secondary backstop. Confirmed at the [[scope handshake]].

### two-weeks-cold resume test
**category:** control · **aliases:** — · **status:** active
The acceptance test for the [[Project Ledger]]: a human who has forgotten everything can re-orient and resume from it alone.
