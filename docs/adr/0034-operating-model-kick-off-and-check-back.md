---
status: accepted
date: 2026-07-04
---

# ADR-0034 · Operating model: kick off and check back

**Context.** The loop was built to survive fully unattended operation: every phase
transition durably booked in git, escalations filed as YAML records with resolution
taxonomies, crash-healing rituals in five surfaces. Four days of transcript forensics
(2026-07-04 taming session) showed the insured scenario never occurs — the human was
present at every run boundary — while the insurance consumed the majority of the
system's cost: 108 of 254 commits were bookkeeping, and the shepherding main session
was the single largest token sink (~39%).

**Decision.** The loop is designed for **kick off and check back**: autonomous within a
run, human reachable at run boundaries. Durable state shrinks to **code commits + the
feature graph's status field**. A blocked feature is a question in the chat at the run
boundary, not a filed escalation. Consequences: booking commits, escalation records
(`docs/escalations/`), the resolution-kind taxonomy, the docket, the adjust skill, and
the per-surface crash-healing rituals are all deleted; interrupted work is handled by
idempotent re-run from the last good state. If true walk-away operation is ever needed,
it returns as a notification layer — never as provenance baked into every step.

**Supersedes** ADR-0009, ADR-0019, ADR-0032. **Amends** ADR-0026 (feature branches
survive; bookings die) and ADR-0029 (run mechanics carry no booking obligations).
