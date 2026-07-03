# Validations — inner-loop-workflow

Append-only verdict record; one entry per validation, keyed by `patch_id`, never
rewritten. This first entry was computed by the independent validator but
**transcribed by the session**: the validator's post-verdict booking failed on the
self-hosting bootstrap gap (the booking toolkit — `spine set-status`, `spine ledger
render` — is part of this feature's own unmerged diff, so it does not exist on the
integration target until a perfect verdict merges it), and the hand-maintenance rule
covers the mirror. The gap is one-time: any post-merge validation books mechanically.

## Validation — patch_id `5166bd78a6a5c4274843e3f8f05e6c5e9e78c4a3`

```yaml
feature: inner-loop-workflow
design_version: 4
patch_id: 5166bd78a6a5c4274843e3f8f05e6c5e9e78c4a3
readiness:
  rebase: clean
  resolutions: []
  preconditions: { test_harness: ok, probe: ok }
legs:
  forensics:
    verdict: PASS
    findings: []
    evidence: >-
      One scanner hit (existing-test-mutation, test/plan.test.js:5) dismissed:
      the only touched line in that pre-existing test file is an import-list
      addition for task t2's own declared new tests; no existing assertion
      altered. Dismissal recorded per triage rule.
    unobserved: ""
  conformance:
    verdict: FAIL
    findings:
      - severity: contract-breaking
        cites: >-
          feature acceptance #2 — "a deviation parks its slice"; pinned
          return-shape delta "validate adds menu: [option] when it booked a
          park" (docs/plans/inner-loop-workflow.md)
        location: workflows/inner-loop.js parkEntry() × agents/validate.md §8
        observation: >-
          A validate-sourced deviation verdict carries no deviation/menu fields
          on validate's documented return shape, so parkEntry() produces a
          parked entry of just {feature} — no deviation, no recommendation-menu.
          Reproduced against the real script with reply shapes taken verbatim
          from agents/validate.md.
        reobserve: shim-drive workflows/inner-loop.js with a deviation verdict reply per agents/validate.md §8
      - severity: contract-breaking
        cites: >-
          feature acceptance #2 — the run drains and the parked feature is
          booked; a feature that vanishes from completed, parked, and stalled
          falsifies the BoundaryResult contract
        location: workflows/inner-loop.js verdict switch × agents/validate.md §8 blocked shape
        observation: >-
          A validate readiness-stage feature-shaped blocked return
          (result: "blocked", kind: "feature") is unrecognized by the outer
          loop — the feature appears in neither completed, parked, nor stalled.
          Reproduced against the real script.
        reobserve: shim-drive workflows/inner-loop.js with a blocked/kind=feature validate reply
    evidence: both findings reproduced live against the merged tree via the shim harness
    unobserved: ""
  acceptance:
    verdict: PASS
    findings: []
    evidence: npm test 104/104 green; npm run check clean on the rebased branch tree
    unobserved: ""
  runtime:
    verdict: FAIL
    findings: []
    evidence: >-
      Same two findings surfaced via the new-exercise probe (recorded once,
      under conformance). Pack replay: docs/probes/ empty, trivially complete.
      Delta proof executed: the new exercise fails (ENOENT) on the merge-base
      worktree and passes on the merged tree — the diff caused the behavior.
    unobserved: >-
      The live claude -p "/the-loop" channel: attempted three ways (fixture
      populated variant, fixture with --plugin-dir, repo root) — "Unknown
      command: /the-loop" every time; the-loop is not an installed plugin in
      this environment. Both halted arms of criterion #3 via live launch.
result: deviation
merged: false
exercise:
  - action: shim-channel — npm run check && npm test over the merged tree
    observed: 104/104 green; BoundaryResult shapes per the shim scenarios
  - action: delta proof — new exercise on merge-base worktree vs merged tree
    observed: red (ENOENT) on merge-base; green on merged tree
spec_ambiguities:
  - "terminal completed status: the contract slice never pins the graph status a completed booking lands on (validated is assumed from outside the slice)"
  - "budget input channel and unit: boundary-result reports budget {spent, remaining} but the contract names no channel to seed a cap and no unit — the budget-exhaustion arm cannot be deterministically provoked as written"
waivers: []
```
