---
status: accepted
date: 2026-06-29
---

# ADR-0018 · Research: lightweight cited search by default, deep-research as the escalation tier

**Context.** §4 made the research port's default adapter the `deep-research` skill and required verification + citation of any adapter. But deep-research's rigor (fan-out, adversarial verification) is overkill — and a real cost — for the common case (idioms, "does this exist," a quick library scan), taxing every lookup.

**Decision.**
- **Default research adapter = a lightweight inline web-search-and-cite** (harness `WebSearch`/`WebFetch` + a cited synthesis). Fast and cheap; fits the common case.
- **`deep-research` becomes the escalation tier** — the heavier adapter the confidence-gate escalates to for consequential, low-confidence decisions (architecture, library selection) where rigor earns its cost.
- **Research rigor scales with consequence** (same shape as grill-intensity-scaling-with-scope). Concretely, softening §4: **citation stays required** (always cite — cheap, auditable, feeds ADRs); **adversarial verification becomes proportional to stakes** (light default = basic sanity; deep-research = fan-out + refutation).

**Why.** §4's "wrong research is worse than none" hazard is real but scales with blast radius: a wrong idiom is caught when the code doesn't run; a wrong architecture choice is expensive — and that is exactly where the confidence-gate escalates to deep-research. Matching mitigation to stakes keeps the common case cheap and the consequential case rigorous.

**Supersedes.** §4's deep-research-as-default and its blanket verification-required rule (citation remains required; verification is now proportional).

**Considered and rejected.** deep-research as the default (rigor/cost tax on every lookup); dropping verification entirely (loses the high-stakes guard the confidence-gate needs).
