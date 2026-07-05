# calibration-capture — Calibration Memory

**Status:** designed.

Capture which decompositions held, what task sizes actually fit, and which blocks
recur, then recall it at Plan/Design so the loop decomposes better over time.

Constraint carried from the 2026-07-01 review: capture must separate loop-overhead
tokens (validator, orchestration) from build tokens, so **"earns its context" is
measured against the founding thesis, not assumed**. The v2 benchmark's transcript
forensics (docs/actions/actions.md) are the seed methodology — per-feature agent
counts, cache-read totals, wall clock, commits.

## Acceptance

- Actual-vs-estimated task cost + re-slice events are captured and recalled.
