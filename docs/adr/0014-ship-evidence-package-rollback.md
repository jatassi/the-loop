---
status: superseded by ADR-0039
date: 2026-06-29
---

# ADR-0014 · Ship: evidence package + health-gated rollback, all reusing the runtime probe

**Context.** Ship is human-gated, decoupled from build cadence, deploys the [[shippable frontier]], and backs the deploy with an evidence package; rollback is automated, health-gated, and delegated to the deploy target (§5). We needed the concrete shape without adding ceremony.

**Decision.**
- **Evidence package** = (a) the full-system integration check (the [[runtime probe]] at full scope), (b) a baseline security review, (c) an auto-derived changelog (from the shipped slices' ADRs + diffs). The session assembles it; the human approves the deploy.
- **Security review = one baseline scan at Ship**, as a **port** whose default adapter is the harness's existing `/security-review` skill (anti-NIH). **Tiering is deferred** (§8) — a single configurable-depth scan suffices for v1; tiers are ceremony until proven necessary.
- **Health-gated rollback** reuses the runtime probe a third time: post-deploy, run the probe's acceptance smoke checks against the *deployed* system; failure → trigger the **deploy target's native rollback**. The loop delegates both rollback (to the target) and health-judgment (to the acceptance behaviors it already uses). This is the one place autonomy is re-granted after the human gate.

**Why.** Ship needs no new machinery: it's the runtime probe at two new scopes (full-system integration check + post-deploy health gate), a security-review port, and a changelog generator — gated by one human approval. Deferring security tiers and delegating rollback keep it anti-ceremony and anti-NIH.

**Considered and rejected.** Designing security review tiers now (ceremony before need; §8 deferral stands); a bespoke health/rollback mechanism (the deploy target has one — delegate); a richer observability-backend health signal in the gate (the runtime probe's acceptance checks suffice and are already defined; the observability backend is Operate's concern).
