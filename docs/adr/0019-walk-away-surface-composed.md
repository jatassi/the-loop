---
status: accepted
date: 2026-06-29
---

# ADR-0019 · Walk-away surface is composed from native harness tools, not built

**Context.** The intent doc named a "walk-away surface" — ambient "what is my loop doing" visibility + escalation notifications, distinct from debugging introspection — as a cross-cutting concern to design deliberately. The question was how much to build.

**Decision.** Build nothing new; **compose it from pieces we already have**, leaning heavily on native harness tools:
- **Live (mid-run):** the `/workflows` progress tree + `log()` narrator lines.
- **Resting (between runs):** the [[Project Ledger]] — glanceable "where is it / what needs me."
- **Push (when away):** the notification-channel [[port]], fired at a [[run boundary]] by the main loop (workflow returns → main loop pushes). **Default verbosity: minimal — push only when something needs you** (parked escalations, budget events); clean completion is opt-in.
- **Meta-observability** (the loop watching itself): the same `/workflows` tree (live) + the Ledger's run history (recent) + git history (durable trail). No separate system.

**Why.** A cross-cutting concern like this *should* be a view the architecture already affords, not a thing you build. Each piece already exists and is native; a bespoke dashboard would be redundant ceremony. Minimal push verbosity respects that you walked away deliberately — you want to hear about decisions, not progress.

**Considered and rejected.** A dedicated always-on dashboard beyond `/workflows` + Ledger (redundant; more to build and maintain); push-on-every-run-boundary (noise for something you deliberately left unattended).
