---
status: accepted
date: 2026-06-29
---

# ADR-0015 · Operate is on-demand ops/debug tooling, not an always-on scheduled agent

**Context.** Decisions §5 framed Operate as an event-driven *watcher* — a scheduled agent that continuously monitors prod and autonomously files intakes. On reflection that makes an agent the always-on monitor, which is the wrong default: expensive, and a reinvention of what observability tooling already does well.

**Decision.** Reframe Operate into two parts:
- **The always-on layer is an observability solution, not an agent.** At Design, the loop **guides the user to an appropriate observability solution** (sized to the project — possibly *none* for a simple one) that apprises **the human** directly (alerts, dashboards, uptime checks). The observability backend is the thing that's always on; no scheduled agent.
- **The agent layer is on-demand tooling.** Operate is **agent tooling to conduct production operations and debugging on demand** — invoked *reactively* by the human when their observability solution shows something went wrong or something needs doing. When that work is a code change, it files/becomes a brownfield intake → [[Evolve]] → the engine.
- **Still never acts on prod** unless the human is driving — and now there is no autonomous prod agent at all by default.

**Why.** Always-on monitoring is what observability tools are *built for* — cheap, reliable, and they alert the human directly; a scheduled agent doing it burns context continuously for the rare incident ("earns its context" violation) and reinvents the wheel (anti-NIH). The agent's real value in Operate is *reasoning* — diagnosis and operations — which is inherently on-demand. Keeping the human as the one who pulls the agent in also preserves front-loaded control and removes the standing risk of an always-on agent near prod.

**Consequences.**
- Operate is reclassified in the Dictionary from **Activity** (a scheduled stage) to **Primitive** (on-demand tooling) — a governed taxonomy move; the reframe revealed it was never a pipeline stage.
- Design's lifecycle shaping now includes guiding the observability-solution choice (alongside the runtime-probe nudge).
- The Operate → intake → Evolve path remains, but is human-triggered, not scheduled-agent-triggered.

**Supersedes.** The "event-driven scheduled watcher that autonomously files intakes" of decisions §5.

**Considered and rejected.** An always-on scheduled-routine watcher agent (the original §5 conception — continuous cost, anti-NIH, an autonomous agent near prod); dropping the Operate concept entirely (loses the on-demand ops/debug tooling and the Design-time observability guidance that even simple projects benefit from naming, if only to answer "none").
