---
status: accepted
date: 2026-07-04
---

# ADR-0040 · Executor delegation simplified into the build path

**Context.** Routing rote tasks to cheap CLI executors is sound token-economics, but
the implementation wrapped it in a 12.9KB driver contract (prompt files, a 5-check
verify gate, 3-way failure typing, driven-via provenance bookings) plus playbook prose
and a launch-time auth smoke that re-ran on every launch. With worktrees everywhere
(ADR-0038) and bookings gone (ADR-0034), the driver's distinctive machinery is just the
normal build path.

**Decision.** Keep the capability, collapse the apparatus. The `via` routing in
`config/model-bindings.json` and a minimal registry entry per executor (availability
command, run command, prompt format — config, not prose) survive. The drive agent
shrinks to a thin build-path variant: assemble the prompt from the same contract kernel
every build agent gets (ADR-0036), run the executor CLI, verify at the same bar as any
build task (tests + lint + diff-stays-in-footprint), commit once with `via <executor>`
in the message, return the standard build report; one retry, then the standard blocked
return. Deleted: launch-time auth smoke (an auth failure at use is an ordinary typed
environment failure), the separate verify-gate checklist, the failure taxonomy, the
provenance ceremony, playbook documents.

**Amends** ADR-0031. ADR-0030 (per-role model bindings) is unchanged and remains the
primary cost lever.
