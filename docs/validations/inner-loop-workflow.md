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

## Validation — patch_id `e9efcf74bbc7368b13365412fca791da012fef98`

**Booking-time observation, surfaced for a human, not a verdict input:** running this
feature's own `spine ledger render` for real against this repo's actual
`docs/ledger/ledger.md` (step 7's mechanical booking, the toolkit's first live
invocation ever — no prior perfect verdict had landed it) silently dropped the
Ledger's leading `# Ledger — the-loop · …` title line — content preceding the first
`## What this is` heading, which `renderLedger`'s `section()` helper never captures
(confirmed by reading `src/ledger.js`) and which `test/ledger.test.js`'s fixtures
never model (every fixture's `priorText` begins directly at `## What this is`). No
cited acceptance criterion, interface clause, or task-selected standards file names
preservation of a pre-heading title, so this doesn't cite as contract-breaking under
the leg-2 test, and per step 7's own rule the verdict below (fixed before this
booking action ran) doesn't reach back to absorb it — but it's a real, reproducible
content-loss gap worth a human's look, likely as a fast-follow fix.

```yaml
feature: inner-loop-workflow
design_version: 4
patch_id: e9efcf74bbc7368b13365412fca791da012fef98
readiness:
  rebase: clean
  resolutions: []
  preconditions: { test_harness: ok, probe: ok }
legs:
  forensics:
    verdict: PASS
    findings: []
    evidence: >-
      One scanner hit (existing-test-mutation, test/plan.test.js:5) dismissed: the
      only touched line is the import-list addition of appendRemediation for t2's
      own declared new tests appended below it; no existing assertion altered.
    unobserved: ""
  conformance:
    verdict: PASS
    findings: []
    evidence: >-
      Spec axis: t15's fix (commit 6e7083e, carried through the rebase) closes both
      prior findings — agents/validate.md's step-8 return now carries deviation/menu
      on result:deviation (confirmed by re-reading the file), and
      workflows/inner-loop.js gained parkEntry's r.detail fallback plus the
      recordVerdict result:blocked/kind:feature arm (confirmed by reading the current
      script). All three acceptance criteria's claimed surfaces exist and match the
      sheet. Standards axis: spot-checked src/escalation.js, src/status.js,
      src/ledger.js, src/plan.js's appendRemediation, bin/spine.js's new subcommands,
      eslint.config.js's workflow-file processor, and agents/plan.md, agents/build.md,
      agents/validate.md, commands/the-loop.md against docs/standards/pure-core-thin-cli.md,
      derived-and-hybrid-artifacts.md, and loop-surfaces.md (grepped all four
      surfaces for "ADR" — no hits, confirming self-containment) — no violations.
      No baseline-catalog smells found beyond the codebase's own pre-existing
      brace-spacing convention on guard-clause throws (src/plan.js:316, matching
      three sibling instances already in the tree) — not a new smell, not a finding.
    unobserved: ""
  acceptance:
    verdict: PASS
    findings: []
    evidence: "npm test: 105/105 green; npm run check: 'OK   21 features, 10 contracts — 0 error(s), 0 warning(s)' on the rebased branch tree"
    unobserved: ""
  runtime:
    verdict: PASS
    findings: []
    evidence: >-
      Fixture-repo probe brought up clean (bin/probe-fixture.js populated). New
      exercise: deterministic channel (npm run check && npm test) reproduces the
      pinned BoundaryResult shapes across test/inner-loop-happy.test.js,
      test/inner-loop-park.test.js (including the t15-fixed deviation-park and
      blocked/kind:feature-park-and-drain cases), and test/inner-loop-halt.test.js
      (environment-block and named budget-exhaustion halts; unnamed-error and
      agent-death stalls). Delta proof: `node --test` on the four inner-loop test
      files errored "Could not find" them on a worktree at the merge-base
      (5cc83ec, main's pre-merge tip — workflows/inner-loop.js and its tests do not
      exist there), then passed 16/16 on the merged tree — the diff caused the
      behavior. Pack replay: docs/probes/ carried no prior entries — trivially
      complete. Pinned to docs/probes/inner-loop-workflow.md.
    unobserved: >-
      The live claude -p "/the-loop" channel: invoked exactly as the sheet's probe
      steps specify from a populated fixture — "Unknown command: /the-loop"; the-loop
      is not an installed plugin in this environment. Covers both halted arms of
      criterion 3 (an environment-shaped block via a dirtied fixture tree, and
      budget exhaustion) and the live-elicited happy/deviation paths of criteria 1–2.
      Separately, the populated fixture variant seeds only a two-feature graph (one
      validated, one building), not the two-independent-designed-feature frontier
      (one to complete clean, one to deviate) the sheet's live steps assume — a
      fixture-repo probe binding limitation, not a defect of this diff. The
      budget-exhaustion arm additionally has no seedable input channel in `args`, as
      the sheet's own ambiguities note — undrivable live regardless of plugin
      installation.
result: perfect
merged: true
exercise:
  - action: bring up the fixture-repo probe's populated variant
    observed: "printed a temp git repo path, seeded with a committed docs/design/design.md + docs/ledger/ledger.md"
  - action: from the fixture, invoke `claude -p "/the-loop"`
    observed: "Unknown command: /the-loop"
  - action: "deterministic channel: npm run check"
    observed: "OK   21 features, 10 contracts — 0 error(s), 0 warning(s)"
  - action: "deterministic channel: npm test"
    observed: "105/105 tests pass, 0 fail"
  - action: delta proof — the four inner-loop test files under node --test
    observed: "\"Could not find\" the files on the merge-base worktree; 16/16 pass on the merged tree"
spec_ambiguities:
  - "terminal completed status: the contract slice never pins the graph status a completed booking lands on (validated is assumed from outside the slice) — carried forward from the pass-1 entry, unresolved by this diff (a Design-level gap, not a builder failure)"
  - "budget input channel and unit: boundary-result reports budget {spent, remaining} but args carries no cap/budget field and the contract names no unit — the budget-exhaustion arm cannot be deterministically provoked live as written — carried forward from the pass-1 entry"
waivers: []
```
