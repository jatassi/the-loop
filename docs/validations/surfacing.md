# Validations — surfacing

## Validation — patch_id `b1912aa8e994dd1c8ee75f747384dcbea2b2a229`

```yaml
feature: surfacing
design_version: 6
patch_id: b1912aa8e994dd1c8ee75f747384dcbea2b2a229
readiness: { rebase: clean, resolutions: [], preconditions: { test_harness: ok, probe: ok } }
legs: { forensics: PASS, conformance: PASS, acceptance: PASS, runtime: PASS }
result: perfect
exercise:
  - "fixture-repo populated variant, feature parked at validate, kind-stamped escalation record seeded"
  - "node bin/the-loop.js orient <fixture>: mode active, parked names the feature, proposal.kind resolve-parked"
  - "node bin/spine.js ledger render: What-needs-you renders [<resolution>] <option> per menu entry"
  - "node bin/spine.js escalation resolve <feature> fix-in-place | re-plan | waive | retry --reason <text>: status flip table, record/plan deletion, retried-mark stamping all confirmed live"
  - "full choreography (resolve + stage/commit): one commit carries the status flip, deleted record, and re-rendered Ledger together"
  - "node bin/spine.js ledger append-run -, thrice (two distinct summaries + one repeat): one newest-first bullet per call, byte-identical on the repeated input"
  - "delta proof on the merge-base worktree: ledger append-run / escalation resolve / note all unrecognized; the same kind-stamped record renders as [object Object] pre-surfacing vs [<resolution>] <option> post-surfacing"
  - "live claude -p \"/the-loop\" from the fixture: Unknown command: /the-loop — unobserved, matching the recorded soft spot already logged in docs/probes/inner-loop-workflow.md"
  - "pack replay: inner-loop-workflow.md, ledger-title-preservation.md, model-selection.md all reproduce their deterministic steps; inner-loop-workflow.md's pinned feature/contract count is stale drift reproduced identically on the merge-base, not a regression"
spec_ambiguities:
  - "surfacing acceptance criterion 2 ('folds back mechanically ... in one booking commit') and criterion 4 ('does so in its own booking commit') read naturally as the raw CLI command committing; the built system (and t7/t11's own task contracts) assign the commit to the adjust skill's choreography, with spine escalation resolve/ledger append-run deliberately never committing — consistent with every other spine subcommand's write-but-never-commit convention. Both readings are supportable from the design-level acceptance text alone; the full choreography (CLI + skill-owned commit) was exercised directly and satisfies the criterion's letter."
waivers: []
```
