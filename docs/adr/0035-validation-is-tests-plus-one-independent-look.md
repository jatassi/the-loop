---
status: accepted
date: 2026-07-04
---

# ADR-0035 · Validation is tests plus one independent look

**Context.** Validate had grown into a zero-trust tribunal: a blind derive agent
restating acceptance criteria, four legs including integrity *forensics* against a
lying build agent, a delta-proof bring-up on a second merge-base worktree, and a replay
of every prior feature's probe pack (O(features²)) — ~8M cache-read tokens and ~100
shell calls per feature, governed by the repo's largest instruction file (24KB). The
observed failure modes were contract drift and environment breakage, never fraud.

**Decision.** The default bar is **tests + one independent look**: build agents do
red-green TDD against acceptance criteria; one fresh-context validator reads the
contract and the diff, runs the full suite once, exercises the runtime probe once for
features with a runtime surface, and merges. The derive agent, the forensics leg, the
delta proof, and per-feature pack replay are deleted. Cumulative regression protection
is the test suite's job; end-to-end pack replay happens once, at ship. Verdicts are
run-boundary messages, not filed artifacts. Validation depth scales with the lane
(ADR-0038): small-lane features skip the probe.

**Supersedes** ADR-0028. **Amends** ADR-0013 (the independent validator and the
runtime probe survive; the protocol around them shrinks to a page).
