# Escalation — inner-loop-workflow (parked at validate)

The independent validator judged the built feature `deviation` (validations entry
`5166bd78`, 2026-07-03): readiness clean, forensics and acceptance PASS, conformance
and runtime FAIL on two confirmed contract-breaking findings at the same seam — the
workflow script's park handling of validate-sourced failures.

1. **Empty park entry on a validate deviation.** `agents/validate.md`'s deviation
   verdict return carries no `deviation`/`menu` fields, and `workflows/inner-loop.js`
   `parkEntry()` expects them — a deviation-parked feature reaches `BoundaryResult.parked`
   as bare `{feature}`, losing the deviation and the recommendation menu.
2. **Feature-shaped validate readiness block vanishes.** A
   `result: "blocked", kind: "feature"` return from validate matches no arm of the
   script's verdict handling; the feature drops out of `completed`, `parked`, and
   `stalled` entirely.

Both reproduce mechanically via the shim harness with reply shapes taken verbatim
from the validator surface. One-time context: the verdict itself could not be booked
by the validator (the booking toolkit rides this feature's own unmerged diff), so
this record is session-mirrored per the hand-maintenance rule.

## Escalation

```yaml
feature: inner-loop-workflow
phase: validate
kind: feature
deviation: >-
  Validate-sourced parks are mishandled by the workflow script: a deviation
  verdict produces a parked entry with no deviation/menu (the validator's
  return shape never carried them), and a feature-shaped readiness block is
  unrecognized entirely, vanishing from the BoundaryResult. Two
  contract-breaking findings, both reproduced; all other legs PASS.
menu:
  - fix-in-place — append one fix task to the plan (align agents/validate.md's
    deviation-verdict return to the pinned "menu when it booked a park" delta,
    add the blocked/feature arm to the script's verdict handling), build it on
    the branch, re-validate
  - re-plan — bounce the park seam back to Plan for a re-cut of t8/t11's
    contract boundary before any fix
  - waive — merge on human authority with both findings recorded as open
    obligations (not recommended: criterion #2 is falsified outright)
branch: loop/inner-loop-workflow
```
