# Validations — ship

## Validation — patch_id `45a64e2969fa33f276c52eb912c64ba5c809f4f3`

```yaml
feature: ship
design_version: 7
patch_id: 45a64e2969fa33f276c52eb912c64ba5c809f4f3
readiness: { rebase: clean, resolutions: [], preconditions: { test_harness: ok, probe: ok } }
legs: { forensics: PASS, conformance: PASS, acceptance: PASS, runtime: PASS }
result: perfect
exercise:
  - "fixture-repo populated variant (non-empty validated frontier: greet-core); node bin/spine.js ship status: {ships:0, next:1, previous_ship_sha:null, latest:null}"
  - "deployed path: authored docs/ships/ship-1.md (evidence+approval, no outcome) pinned to the fixture tip, committed; ship status immediately reports latest.interrupted true (mid-corridor state)"
  - "spine ship corridor - with the scripted deploy-target fixture, all green: concludes {outcome: deployed, health_signal: true}; journal [deploy, smoke], no repeats, no prompts"
  - "spine ship book 1 - fed the corridor JSON; commit 2 + git tag loop/ship/1: greet-core flips validated->shipped in design.md, one Ledger bullet, tag exists, ship status now outcome deployed / interrupted false"
  - "rolled-back path (fresh fixture, smoke forced false): journal [deploy, smoke, rollback, smoke]; concludes {outcome: rolled-back, rollback_verified: false}; spine ship book leaves design.md byte-unchanged, adds one Ledger bullet with rollback_verified: false, no tag"
  - "deploy-failed path (fresh fixture, deploy forced false): journal [deploy, rollback, smoke]; concludes {outcome: deploy-failed, rollback_verified: true}; spine ship book leaves design.md byte-unchanged, adds one Ledger bullet with rollback_verified: true, no tag"
  - "interrupted re-entry: a fresh approved-no-outcome ship record reports ship status latest.interrupted true, outcome null; no spine ship subcommand auto-resumes a corridor"
  - "delta proof: node bin/spine.js ship status unrecognized (usage-string fallback, exit 1) at the merge-base; recognized (exit 0, status JSON) on the merged tree"
  - "pack replay: inner-loop-workflow.md, ledger-title-preservation.md, model-selection.md, surfacing.md all reproduce their pinned deterministic steps live against freshly seeded fixtures — npm test full suite green, npm run check 0 error/0 warning (counts drift with the graph, unpinned), Ledger-render preamble/seed cases byte-identical, model-bindings resolution/precedence/spawn-plumbing/tier-routing hold, the full surfacing fold-in choreography (orient signal, kind-stamped menu render, all four escalation-resolve kinds, append-run insertion) reproduces"
spec_ambiguities: []
waivers: []
```

Forensics: one scanner hit (`existing-test-mutation`, `test/ledger.test.js:4`) —
dismissed. The sole removed/rewritten line is the import statement extended to
add `appendShip` alongside the pre-existing `appendRun`/`renderLedger` imports,
a mechanical consequence of t4's declared footprint (new `appendShip` tests
added later in the same file). No existing test's body, assertion, or name
changed; every other line in the file is new content appended after the
existing tests.

Conformance: spec axis matches the contract and the expectation sheet on all
four acceptance criteria (verified by direct exercise for the corridor/booking
mechanics and the interrupted healing scan; by reading `skills/ship/SKILL.md`
against the criterion for the session-prose-only evidence assembly, red-blocks
-hard gate, approval gate, and freshness reassembly — none of which the
fixture-repo probe binding can host live, its own documented soft spot for
agent-pack surfaces). Standards axis: one advisory (baseline review-catalog,
not a task-selected standard, so non-blocking) — `src/ledger.js`'s `appendRun`
(~L97-105) and `appendShip` (~L129-139) contain near-identical bullet
-insertion logic (locate `## Run history`, throw if absent, splice after it)
that could consolidate into one shared helper; Duplicate Code, the review
catalog's own signature agent smell.

Runtime: full pack replay (4/4 packs) plus a fresh new exercise pinned to
`docs/probes/ship.md`; one advisory surfaced during the exercise (not
contract-breaking — no acceptance criterion or task-selected standard cites
it): `spine ship book` on a non-deployed outcome writes the ship record's
outcome before the Ledger's `appendShip` insertion, so a Ledger missing its
`## Run history` heading throws mid-command leaving the record already
mutated — outside the five guard conditions t5's acceptance criteria enumerate
and test, and unreachable against this repo's own self-hosted target Ledger
(which always carries that heading via the render pipeline's seeding). See
`docs/probes/ship.md` for the reproduction recipe. Unobserved: the ship
skill's session-prose legs (full four-leg evidence-package presentation, the
red-blocks-hard live enforcement, the freshness reassembly judgment) — no code
path implements them for the fixture-repo probe to drive; the prose was read
against its acceptance criterion and matches, but not exercised live, matching
the class of limitation already recorded for the live `claude -p "/the-loop"`
channel in `docs/probes/surfacing.md` and `docs/probes/inner-loop-workflow.md`.
