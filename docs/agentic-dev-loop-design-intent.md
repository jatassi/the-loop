# Agentic Development Loop — Design Intent

**Status:** Intent only. No solutioning. Captures *what* the loop is for and *what good looks like* at each stage, so the follow-up session can focus on *how*. The four foundational decisions are resolved (see Scope). The pipeline is iterative, not a single linear pass: a high-level Design step anchors an inner Plan → Build → Validate → Adjust loop run per feature.

---

## Purpose

Compress the time from a raw idea to a deployed, monitored application while removing friction from both sides of the keyboard — the human steering and the agents doing the work. The loop should be *owned*, not inherited: composable primitives assembled to taste, rather than a heavyweight framework that imposes ceremony and burns context whether or not a given step needs it.

The reaction this is born from: existing frameworks are overbearing and token-intensive. That sets the tone for everything below.

---

## Design Principles

**Earns its context.** Every component justifies its token cost. Default to loading nothing; pull in skills, briefs, and tooling only when the active step needs them. Progressive disclosure over always-on. (Note the standing tension with brownfield comprehension below — the Design step is where that cost is meant to be paid once and amortized.)

**Right-sized units of work.** The atomic unit is a task that fits comfortably in a single agent's context window with headroom. Sizing discipline is what makes autonomous execution reliable; most failure traces back to a unit that was too big.

**Design before decomposition.** Planning aligns to a shared high-level design rather than to nothing. The design is the contract that lets parallel agents make compatible local choices instead of diverging and colliding at integration. It is a living artifact, amended through the Adjust step — not a frozen up-front spec.

**Control front-loaded, execution hands-off.** Human judgment concentrates early — refining the idea and shaping the design. The per-feature Plan → Build → Validate loop then runs autonomously, with **Adjust** as the defined re-entry point: the loop pulls the human back only when validation reveals the design itself needs to change.

**Opinionated defaults, open to override.** Ships configured to one set of preferences and runs well on them out of the box, but every default is a default, not a mandate. Adoptability is a design constraint, not an afterthought.

**Symmetric friction removal.** Agent ergonomics matter as much as human ergonomics. An ambiguous task spec, a blocking dependency, a missing context brief cost the agent the way a clunky CLI costs the human. Both are in scope.

**Composable primitives, not a monolith.** Each phase is a discrete, swappable tool. Any part can be replaced without rewriting the whole.

**Durable handoffs.** Each phase consumes a structured input and emits a structured output. These artifacts are the contract between phases and the spine of the system — what lets the loop be resumable, inspectable, and partially re-run. The design artifact is the central one.

**Resumable and self-observable.** The loop can crash, be inspected, and resume from the last good artifact. It watches *itself*, not just the app it produces.

**Lean on what exists.** Anti-NIH. Build the orchestration and connective tissue; don't reinvent agent runtimes, deploy targets, or test harnesses that already work.

---

## Scope

### In scope
- The meta-tooling and orchestration that moves an idea through the full lifecycle.
- The per-phase primitives (skills, subagent definitions, MCP servers, prompts, context briefs, hooks — which primitive serves which phase is deferred to solutioning).
- The handoff artifact contract that connects phases, with the design artifact at its center.
- Greenfield builds **and** brownfield maintenance/improvement, both first-class.
- Adoptability by others, with one set of preferences as shipped defaults.

### Out of scope
- The applications themselves. The loop is the factory, not the product.
- Reinventing existing infrastructure — agent runtime, deploy pipeline, observability backend. The loop orchestrates these.
- Team / multi-developer collaboration workflows (at least v1) — adoptable by individuals, not yet a shared team surface.

### Resolved decisions
1. **Audience: personal-first, adoption-friendly.** Built for one workflow; designed so others can adopt it. Preferences ship as defaults; everything overridable.
2. **Autonomy: semi-autonomous, front-loaded.** Human judgment concentrates in Frame and Design. The per-feature loop runs autonomously, with Adjust as the re-entry point.
3. **Concurrency: parallelize where possible.** Within a feature, tasks run concurrently against the design; features are sequenced by the inner loop. Parallelize within a slice, sequence the slices.
4. **Codebase posture: greenfield and brownfield are both first-class.** New builds and ongoing work against deployed systems are peers.

---

## The Loop

Two human-gated framing phases up front, then an autonomous inner loop run once per feature, then ship/operate/evolve.

### Frame  *(human-gated)*
*Brain dump → refine (`/grill-me`)*

Get the messy idea out with the lowest capture tax, then pressure-test it adversarially before a token is spent building. Catches ambiguity, hidden scope, and bad assumptions cheaply. For brownfield work, this is also where the loop begins priming on the existing system. Output: a sharpened brief.

*Open: freeform brain dump or light template? How hard does grill-me push?*

### Design  *(human-gated)*
*High-level architecture → feature breakdown + ordering*

Turn the brief into the high-level design that everything downstream aligns to: architecture, data model, interface contracts, system boundaries, tech posture. Also produce the coarse feature/epic breakdown and the order to build them — the judgment-heavy slicing stays here with the human, while fine task decomposition is deferred to the autonomous loop. For brownfield, this is where comprehension of the existing system is paid for *once* and encoded into the design artifact, so downstream build agents read a cheap contract instead of re-reading the codebase. The design is living: the Adjust step amends it.

*Open: how much design up front vs. left emergent? How are existing-system constraints folded into the contract for brownfield?*

### Inner loop — per feature  *(autonomous; Adjust is the human re-entry point)*

**Plan.** Decompose the current feature into right-sized tasks and order them to expose the widest parallelizable frontier within the slice.

**Build.** Execute the feature's tasks concurrently against the design contract, to completion, with no human presence unless escalation triggers.

**Validate (against design).** Check the built slice against the design: conformance to the contract (interfaces, data model, boundaries honored) *and* functional correctness. A failure is a candidate Adjust/escalation trigger.

**Adjust (optional).** Reconcile what building taught you. Three flavors, escalating in cost: fix the slice in place, re-plan the slice, or amend the shared design. The third is the human re-entry point and carries a drift consequence (below). Then loop to the next feature.

*Open: is each Plan iteration autonomous, or does the human gate every feature's plan? (Working assumption: autonomous, with Adjust as the only re-entry — keeps control front-loaded.) When Adjust amends the shared design, what happens to already-built features that conformed to the prior version — re-validate them, accept drift, or version the design with migration? Does per-feature design-conformance give enough integration confidence, or is a periodic/final end-to-end runtime check still needed?*

### Ship
*Deploy*

Low-ceremony, repeatable push to the target; delegates to existing infrastructure. The vertical-slice + iterative model makes per-increment delivery natural, but per-increment vs. terminal ship is a real cost/benefit choice and the highest-consequence autonomous action — it needs its own gate, review, and rollback story.

*Open: ship each validated increment, or once at the end? What gates the deploy, and what's the automated rollback path when a deploy breaks prod?*

### Operate
*Monitor → debug → file bug reports*

Close the loop from production back to the front. The intent is capturing operational signal in a form the loop can *re-ingest* as a brownfield intake. (Note: Operate is continuous and event-driven — a different runtime shape than the batch inner loop, worth designing as such.)

### Evolve
*RCA + fix design → implement fix → design new features*

A bug or feature request is a small idea entering through a different door. RCA + fix design is a refinement-and-design activity; the fix runs through the same inner loop; a new feature re-enters at Frame. Because brownfield is first-class, this path is a peer of greenfield, not a lesser one.

*Open: what gates a production fix that goes RCA → fix → deploy autonomously? The front-loaded gating was specified for greenfield; the brownfield/Evolve path needs its own gate definition.*

---

## Key Structural Observation

The steps are not many distinct things to build. A small number of **intakes** — a greenfield idea, a brownfield feature, a brownfield bug — feed **one shared engine**: refine → design → ( plan → build → validate → adjust )\* → ship. Operate turns deployed apps back into intakes.

Greenfield vs. brownfield is not a second engine — it's a difference in how the intake primes the Design step (brownfield requires comprehending the existing system first). A bug enters at fix-design rather than brain dump, but runs the same inner loop downstream.

Design the engine *once* — with thin intake adapters (one being brownfield comprehension), the living design artifact at its center, and an operational feedback path — rather than building twelve bespoke stages. The one thing to carry into solutioning: find the shared core, and resist building the same thing twice.

---

## Cross-Cutting Concerns

Design these deliberately rather than letting them emerge:

- **The handoff artifact contract**, with the **design artifact** at its center — the structured I/O between phases, and the thing Validate checks against. Design first.
- **Definition-of-done / acceptance criteria** carried per task, so an autonomous agent knows complete vs. abandoned.
- **Design-drift management.** When Adjust amends the shared design, the policy for already-built slices that conformed to the old version.
- **The escalation contract.** The single rule set deciding when the autonomous loop stops and surfaces — Adjust is its primary surface; Validate failures and Build blockers are its triggers.
- **Brownfield comprehension.** How the engine primes itself on an existing system at Design time — the shared dependency of every brownfield intake.
- **Parallel execution coordination.** How concurrent agents within a slice share state and avoid collisions.
- **Safety rails for unattended autonomy:** a global circuit breaker (aggregate dollars / time / retries, not just per-component context budget), a security/secrets/dependency review before Ship, and automated rollback on a bad deploy.
- **A calibration loop.** Capture which decompositions held, what task sizes actually fit, and which escalations recur, and feed it back into the context-brief library so the loop decomposes better over time.
- **Default + override model.** How preferences are encoded as shipped defaults and overridden without forking.
- **The walk-away surface.** Ambient "what is my loop doing right now" visibility and escalation notifications, distinct from debugging introspection.
- **State, resumability, and artifact versioning.** How progress persists and how resumability and inspection rely on versioned artifacts.
- **Meta-observability.** Visibility into the loop's *own* execution, distinct from the deployed app's.
