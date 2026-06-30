---
status: accepted
date: 2026-06-29
---

# ADR-0007 · Calibration Memory is per-project; cross-project wisdom rides the defaults

**Context.** Calibration Memory captures decomposition/escalation signal so the loop decomposes better over time (§7). The open question was where it lives — user-global (cross-project, compounding) or per-project. Cross-project calibration risks poor generalization: the signal is conditioned on tech stack, codebase age, and domain, so averaging across dissimilar projects dilutes or corrupts it.

**Decision.**
- **Calibration Memory is per-project, in the [[target repo]]** (Markdown + frontmatter + index — the harness-memory pattern §7 named). It joins every other artifact in the target repo, removing the two-filesystem exception ADR-0002 had flagged.
- **Cross-project wisdom lives in the configurable defaults** (sizing budget, breaker thresholds, etc. — §6): defaults are the human-curated *prior*; per-project Calibration Memory is the *posterior* refined on this project's clean evidence. Cross-project transfer happens through deliberate human default-tuning (§7's "tune knobs by hand"), not automatic cross-project averaging.
- **v1 is capture-only**, human-glanceable, recalled at Plan/Design. Auto-feedback deferred (§7).

**Why.** Calibration signal's value depends on a tight subject matter; per-project keeps signal-to-noise high. The cold-start cost — each repo calibrates from zero — is absorbed by the defaults carrying the general prior, so nothing is truly lost: cross-project transfer simply moves from noisy auto-averaging to curated default-tuning, which is where it belongs.

**Considered and rejected.** User-global calibration (compounds across projects, but generalizes poorly — averages dissimilar projects into mush); a global + per-project hybrid memory (two calibration sources to reconcile, reintroducing dual-source ambiguity for marginal gain over defaults-as-prior).
