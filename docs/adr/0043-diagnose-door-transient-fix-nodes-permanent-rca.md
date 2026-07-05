---
status: accepted
date: 2026-07-05
---

# ADR-0043 · The diagnose door: transient fix nodes over a permanent RCA corpus

**Context.** The v1 `evolve` stub bundled bugs and feature requests into one intake
door, while the design skill's amendment mode already handles feature-shaped intakes
and the bypass lane (ADR-0038) already handles trivial maintenance — a second
general-purpose door would duplicate routing that exists. Separately, two pressures
pull on where a bug fix's record lives: the graph is the durable state machine and
plans die at validation precisely because git archives them, yet accumulated RCAs
have standing value (posterity, pattern recognition over recurring issue classes)
that `git log` alone surfaces poorly.

**Decision.** Post-ship intakes enter through **three doors converging on one
spine** — the human-gated graph amendment, then the unchanged engine. Frame
sharpens idea-shaped intakes; design amendments take obvious tweaks; **diagnose**
(renamed from `evolve` — bugs only, and a standard industry term) owns defects:
capture → triage → diagnosis via the diagnosing port (`/diagnosing-bugs` unless the
project binds another) → RCA + fix design → gate. The record splits by half-life:

- **Fix nodes are transient.** A fix is an ordinary feature node (`fix-<slug>`) with
  regression-shaped acceptance; the engine has no fix-specific branches. The ship
  flow's Record step prunes shipped fix nodes — the graph stays the picture of the
  system, not its repair log.
- **RCA docs are permanent.** `docs/rca/fix-<slug>.md` is born at intake, leads with
  root cause and evidence, and **doubles as the fix node's context slice** (launch
  falls back from `docs/design/features/` to `docs/rca/`). One doc, one home, whole
  life; the corpus header (date, affected features, class, cause-established-by) is
  the pattern-mining surface.
- **Reproduction is best-effort; degraded conditions surface, never silently
  downgrade.** The human may wave a fix through on an inspection-established cause;
  the RCA doc records `reproduced` or `inspected` with the waiver explicit. An
  environment-shaped obstacle to diagnosis (unavailable tooling, access, or logs)
  is reported to the human with its quality cost — the waiver is the human's grant,
  never the agent's fallback. A fix's regression probe folds into the affected
  feature's probe pack, never a standalone pack that would orphan at prune.

**Consequences.** The artifact set (ADR-0037) gains one row — the RCA corpus — and
ship's Record step gains the prune. A landscape survey
(`docs/research/diagnose-landscape-survey.md`, 2026-07-05) grounded the details:
the pre-fix human gate and oracle-first loop sit at or ahead of field convergence;
the intake fields (environment, determinism, regression window), the pluralized
causal vocabulary (root causes + trigger + why-no-test-caught-it), and the ten-step
bundled fallback discipline adopt the only convergent practices the design lacked. Severity tiering remains a separate feature: a
rigor dial on this door, not a lane of its own. **Amends** ADR-0037 (artifact set)
and ADR-0038 (the bypass lane's boundary: trivial-to-fix and trivially-caused skips
the loop; an RCA entry is filed only when diagnosis taught something worth keeping).
