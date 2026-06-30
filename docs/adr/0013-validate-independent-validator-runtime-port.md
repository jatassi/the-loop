---
status: accepted
date: 2026-06-29
---

# ADR-0013 · Validate: independent validator, three legs, runtime observation as a project port

**Context.** Validate is the linchpin of the [[perfection bar]] (§5): a built slice is checked against the design by an independent validator. The legs are mostly tractable except runtime observation, which means something different for every project type (CLI vs. API vs. library).

**Decision.**
- **[[independent validator]]** — a fresh, adversarial agent per feature, given *only* the contract + acceptance criteria + diff + the ability to run the system (no stake in the build, no visibility into its reasoning).
- **It begins by integrating the feature's task branches** (the Build merge folds in here, ADR-0012) — assembly, not authoring, so independence holds — then runs three legs:
  1. **Conformance** — deterministic where possible (type-checker / linter / AST / arch-fitness vs. the machine-parseable contract) + agent judgment for boundaries.
  2. **Acceptance** — run the project's *existing* test harness; check the acceptance-criteria tests pass (anti-NIH).
  3. **Runtime observation** — via a project-configured **[[runtime probe]]** (a port): "how to bring the system up and exercise it." "What to observe" is the acceptance criteria, written to be runtime-observable. The loop standardizes the *contract* (bring it up, exercise it, observe the behaviors), never the *how*.
- **The runtime probe is reused at the pre-Ship full-system integration check** — same capability, full-system scope. (Operate stays separate — the observability-backend port watching prod telemetry — though it may reuse the same acceptance behaviors as prod smoke checks.)
- **Greenfield nudge.** Greenfield has no existing system to infer the probe from, so **Design actively nudges the user to provide it** during lifecycle shaping. Its absence is a **deliberate, surfaced opt-out** ("no separate runtime probe — acceptance tests are the runtime check for this project — confirm"), never a silent skip — because silently dropping leg 3 reduces Validate to "just green unit tests," the exact failure §5 warns against.
- **Verdict** — a structured per-leg result; a merge conflict or anything short of perfect on any leg → [[deviation]].

**Why a port, not built-in checks.** Project types are too varied for the loop to prescribe runtime checks out of the box; making "how to exercise the system" a configured capability (owned by the project, decided at Design alongside Operate) keeps the loop's runtime *contract* uniform while the *mechanism* stays project-shaped. Brownfield can seed the probe from comprehension; greenfield must be prompted — hence the nudge.

**Considered and rejected.** Built-in runtime checks per common project type (brittle; never covers the long tail; fights the ports-and-adapters posture); allowing a silent skip of leg 3 when no probe exists (guts the perfection bar); a separate integration agent before a pristine validator (one more agent than needed — assembly doesn't compromise independence).
