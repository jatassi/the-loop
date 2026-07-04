---
status: accepted
date: 2026-07-04
---

# ADR-0036 · Progressive disclosure context architecture

**Context.** Worker agents received 29-byte prompts and were then ordered to
reconstruct context from disk — the whole 50KB plan to extract one task, the
constitution, standards, and protocol docs, unconditionally, every spawn (~66–84KB of
identical fixed overhead × ~53 API calls per task × 40 spawns). This violated the
founding "earns its context" principle in both dimensions: *when* (unconditional
mandates) and *how much* (whole-file granularity).

**Decision.** Context is layered, disclosure-first, for every agent:

1. **Role card** (system prompt, ~1KB): what you are, the integrity lines that deviate
   from model priors, the return shape. Craft rules distill to ~10–15 resident lines
   (test budget, no suppression, footprint lease); mechanical rules move to the linter.
2. **Kernel** (in the prompt): only what no task can start without — the task contract
   (criteria, footprint, interface contracts). The orchestrator already holds it and
   pushes it; this is the only push.
3. **Index** (in the prompt, ~10 lines): a menu of fetchable context units — one line
   each with a command and a when-to-use hint, like skill descriptions. Most tasks
   fetch nothing.
4. **On-demand units**: every artifact addressable *below file granularity* via one
   command returning KB, not tens of KB. No agent contract may say "read this whole
   file."

Consequence: artifacts are authored to be fetched in slices — plans become contract
lists with short per-task wiring notes, not essays. The same principle governs the main
session (orient returns small JSON + a menu; no whole-design.md reads).

**Extends** ADR-0004 to all surfaces. **Amends** ADR-0027 (craft bundle distills into
role cards + linter) and ADR-0025 (plan format becomes slice-addressable).
