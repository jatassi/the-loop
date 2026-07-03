# Escalation — model-selection (parked at validate)

The independent validator judged the built feature `deviation` (validations entry
`25a66a57`, 2026-07-03): readiness clean, forensics/conformance/runtime all PASS, one
contract-breaking finding on the acceptance leg (machine test pass/fail).

**The full test suite is not green.** `test/spine-cli.test.js`'s pre-existing test
"spine plan remediate appends the round-marker so plan check passes..." asserts
`spine plan check` output matches `/^OK/`. This feature's task t4 added a
`missing-tier` warning (acceptance criterion 4's own grandfather posture: a plan cut
before this feature keeps parsing, warned rather than errored) that now prints a warn
line ahead of `OK` for that fixture's untiered round-marker task, breaking the
regex. `npm test` reports 119/119 pass, 1 fail — reproduced identically on three
separate runs, not flaky. Both t4's and t5's own completion reports already declare
this exact regression: `test/spine-cli.test.js` sits inside t3's declared footprint,
not t4's or t5's, so both builders correctly left it untouched under footprint
discipline rather than editing a file outside their lease — but the leg's protocol is
mechanical (a declared deviation still reads red), so the acceptance leg fails on it.

Everything else about the diff is clean: no forensics hits survive triage, the spec
and standards axes both hold exactly to the plan's pinned conventions (resolver
surface, CLI, merge semantics, tier field, workflow plumbing, label prefixes, log
lines, the three consuming surfaces), and the runtime leg's own replay of this same
underlying failure qualifies as a supersession of the `inner-loop-workflow` probe
pack's pinned "full suite green" observation — the contract itself names this changed
behavior — not an independent regression.

## Escalation

```yaml
feature: model-selection
phase: validate
kind: feature
deviation: >-
  One contract-breaking acceptance-leg finding: test/spine-cli.test.js's
  pre-existing "spine plan remediate ... plan check passes" test asserts
  `spine plan check` output matches /^OK/, but t4's new missing-tier warning
  (acceptance criterion 4's grandfather posture) now prints a warn line before OK
  for that fixture's untiered round-marker task, breaking the match. npm test is
  119/119 pass, 1 fail, reproduced consistently across three runs. Both t4's and
  t5's completion reports already declare this exact regression as an
  out-of-footprint deviation (the file sits in t3's lease, not theirs) and left it
  red by design rather than touch a file outside their declared footprint. All
  other legs (forensics, conformance, runtime) are clean.
menu:
  - fix-in-place — append one task updating test/spine-cli.test.js's stale /^OK/
    assertion (accept the new leading warn line, or stamp the fixture's
    REMEDIATE_PLAN task with a tier so no warning fires), build it on the branch,
    re-validate
  - waive — merge on human authority, recording the one red pre-existing assertion
    as an accepted transitional gap until a future diff touches
    test/spine-cli.test.js
  - re-plan — fold test/spine-cli.test.js into a task's footprint at the next Plan
    pass for this feature (or a follow-up feature) rather than a standalone fix
    task
branch: loop/model-selection
```
