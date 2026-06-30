---
status: accepted
date: 2026-06-29
---

# ADR-0006 · Project Ledger is a persisted, derived projection (read-by-human, written-by-loop)

**Context.** The Ledger is the state artifact powering `/the-loop` (vs. Design = contract). It must be glanceable without invoking anything — open `ledger.md` and be oriented — yet must not become a second authored copy of feature status that drifts from the feature graph.

**Decision.**
- `ledger.md` is a **persisted, glanceable file** (axis 1) whose **status content is derived** from the [[feature graph]] (axis 2) — a *materialized projection*. The feature graph is the single source of truth for status; the Ledger renders it.
- The Ledger is **read-by-human, written-by-loop**: an output surface, not an input surface. Humans act through `/the-loop` and author into `design.md` / ADRs / Dictionary; the loop renders the Ledger. This role split is what makes regeneration safe — there are no hand-edits to clobber.
- It is **re-rendered at every [[run boundary]]** and on `/the-loop` invocation, and it stamps the graph [[fingerprint]] it was projected from, so out-of-band edits to the graph are detected and trigger a re-render before anything is shown.
- It **owns only non-derivable state**: orientation prose, run history, and the next-action proposal. Backbone = the four questions (what is this / where are we / what needs me / what's next).

**Why.** Persisted gives glanceability (the appeal of an independent file); derived gives zero drift (status printed from the graph cannot disagree with it). Separating the two axes captures both at once; an independently-authored status would reintroduce exactly the dual-source drift the artifact spine exists to kill.

**Considered and rejected.** Independently-maintained status in the Ledger (glanceable but dual-authored → drift between graph and Ledger, with no tiebreak); a computed-live view with no persisted file (no drift, but loses glance-without-invoking).
