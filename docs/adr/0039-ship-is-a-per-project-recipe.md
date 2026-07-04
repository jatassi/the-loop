---
status: accepted
date: 2026-07-04
---

# ADR-0039 · Ship is a per-project recipe

**Context.** Ship had grown to a 10-section skill — three entry gates, a four-leg
evidence dossier, whole-frontier-only scope, freshness rules that void the entire
package on any drift. But what "ship" means varies so much by project that prescribing
mechanics centrally was the mistake; the durable intent was only ever "a single command
that triggers an end-to-end release."

**Decision.** The loop prescribes the skeleton only: **verify ready → human gate →
deploy → verify working**, plus a rollback pointer and a one-line release record. The
particulars — ready-check commands, deploy commands, health-check command, rollback
path — are elicited from the project at Design/spin-up and recorded as that project's
own recipe (the same pattern as the runtime-probe binding). The ship skill is a thin
runner of the recipe: probe packs + full suite replay on the candidate tip (the one
place pack replay lives, per ADR-0035), a diff-stat + results message at the gate,
deploy, health check, tag. Freshness drift re-runs the replay, never a from-scratch
dossier. Subset ships are allowed — the release train is the human's call.

**Supersedes** ADR-0033, ADR-0014 (the evidence package becomes the gate message; the
rollback pointer survives in the release record).
