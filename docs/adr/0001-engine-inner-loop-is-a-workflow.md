---
status: accepted
date: 2026-06-29
---

# ADR-0001 · Engine inner loop is a Claude Code Workflow; the human/autonomous boundary is the workflow edge

**Context.** The [[orchestrator]] — the driver of the autonomous [[inner loop]] (Plan → Build → Validate) — was deferred to solutioning (decisions §8). We needed a concrete mechanism to run the inner loop unattended, with parallel task execution, durable handoffs, a circuit breaker, and resumability.

**Decision.** The autonomous inner loop is implemented as a **Claude Code Workflow script** — the deterministic JS orchestration layer (`agent()` / `parallel()` / `pipeline()` / `budget` / `schema` / `runId`+`resume`). The human-gated phases (Frame, Design, the Adjust decision, Ship approval, escalation decisioning) remain in the **interactive session** as skills/commands. The human/autonomous boundary is the **workflow edge**: the session is the conductor; it invokes a Workflow for one autonomous run over a confirmed [[scope envelope]], and the Workflow runs only while no human input is required.

**Why.** The Workflow primitives map almost one-to-one onto the mechanisms §8 deferred: `parallel()`/`pipeline()` *are* parallel-execution coordination, structured `schema` handoffs *are* the artifact contract between phases, `budget` *is* the global [[circuit breaker]], `runId`/`resume` *is* resumability. A bespoke driver would reinvent all of it — a direct violation of "lean on what exists."

**Considered and rejected.** A prompt-driven **driver subagent** (an agent that spawns sub-subagents and adapts in-loop). It offers more adaptive judgment mid-run, but forfeits determinism, resume, and an enforceable token/dollar budget — the wrong trade for unattended autonomy, where predictability and a hard breaker matter more than improvisation.

**Consequences.**
- **Surfacing is stop-and-return, not pause-and-ask.** A Workflow cannot block mid-run for human input. This is *isomorphic* to the [[perfection bar]], which already makes every deviation / breaker trip / epistemic gap a **stop** point — so surfacing *is* the run reaching a [[run boundary]] and returning. Not a workaround; a fit.
- **[[park-and-drain]]** is the escalation policy: a [[deviation]] parks its [[slice]] and the run keeps executing the independent frontier; parked escalations batch and surface together at the run boundary. One deviation does not end the run.
- **Notification latency = run boundary.** The robust away-from-keyboard path is: workflow returns → main loop wakes on the task notification → main loop pushes. An *instant* mid-run FYI ping (a workflow agent calling a notification tool) is plausible but unverified — interactively-authenticated services can be absent in headless runs — so it is not load-bearing.
- **No surgical mid-thought interrupt.** Stop levers are graceful script-level early-return, hard `TaskStop`, and the `budget` ceiling. "Halt everything now" means "stop spawning new work; in-flight agents drain."
