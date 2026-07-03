# Validations — ledger-title-preservation

Append-only verdict record; one entry per validation, keyed by `patch_id`, never
rewritten.

## Validation — patch_id `da9d372eb996854d7e4e900972ccdc491dd3d392`

```yaml
feature: ledger-title-preservation
design_version: 4
patch_id: da9d372eb996854d7e4e900972ccdc491dd3d392
readiness:
  rebase: clean
  resolutions: []
  preconditions: { test_harness: ok, probe: ok }
legs:
  forensics:
    verdict: PASS
    findings: []
    evidence: >-
      Two scanner hits, both dismissed with structured justifications.
      (1) existing-test-mutation, test/ledger.test.js:43 — t1 acceptance
      criterion 4 explicitly orders the pre-existing tests "updated to expect
      the seeded standard title line"; the rewrite renames EXPECTED to BODY,
      prepends a SEEDED_TITLE constant, and strengthens the missing-section
      test from a heading-anchored match to a seeded-title-prefixed
      startsWith — assertions strengthened, none deleted. (2)
      existing-test-mutation, test/spine-cli.test.js:115 — a single assertion
      prefix updated from /^## What this is/ to expect the pinned seeded
      title constant first, a stricter assertion matching the contracted
      seeding behavior; declared in t1's completion report as an
      out-of-footprint deviation.
    unobserved: ""
  conformance:
    verdict: PASS
    findings:
      - severity: advisory
        cites: ""
        location: test/spine-cli.test.js:115 (t1 footprint overrun)
        observation: >-
          t1 touched test/spine-cli.test.js outside its declared footprint
          [src/ledger.js, test/ledger.test.js]. Declared in t1's report and
          necessitated by criterion 4's full-suite-pass requirement; a task
          footprint is contract metadata, not a citable acceptance criterion,
          interface clause, or task-selected standards rule — advisory.
    evidence: >-
      Spec axis: preamble() (src/ledger.js:37-41) realizes criterion 1 — the
      slice before the first /^## /m match is carried verbatim, an empty
      preamble seeds the pinned constant plus one blank line, and a
      heading-less priorText is kept whole per the plan's pinned degenerate
      case. docs/ledger/ledger.md's first two lines compared byte-identical
      (node Buffer.equals: true) to the first two lines of
      "git show 705eed7:docs/ledger/ledger.md" per t2 criterion 1. Nothing
      built beyond the contract. Standards axis:
      docs/standards/pure-core-thin-cli.md — renderLedger and preamble stay
      pure (no fs/clock/process in src/ledger.js);
      docs/standards/derived-and-hybrid-artifacts.md — t2's committed
      ledger.md is the verbatim output of a real render (re-running the
      render on the merged tree produced a zero-byte diff); no review-catalog
      smells on the diff.
    unobserved: ""
  acceptance:
    verdict: PASS
    findings: []
    evidence: >-
      npm test on the rebased tree: 108/108 pass, 0 fail. npm run check:
      "OK   22 features, 10 contracts — 0 error(s), 0 warning(s)" and eslint
      zero findings.
    unobserved: ""
  runtime:
    verdict: PASS
    findings:
      - severity: advisory
        cites: ""
        location: docs/probes/inner-loop-workflow.md (npm run check step)
        observation: >-
          Pinned "OK   21 features, 10 contracts" — observed "OK   22
          features, 10 contracts — 0 error(s), 0 warning(s)" on the merged
          tree AND byte-identically at merge-base 73d46e7 without this diff;
          the count drifted with the graph's own growth (this feature's
          intake, main commit 7d9a910). An unmasked volatile field in the
          pin, not a regression of this diff — the deterministic-channel
          intent (0 errors, 0 warnings) reproduces.
        reobserve: npm run check at 73d46e7 and at the merged tree
      - severity: advisory
        cites: ""
        location: docs/probes/inner-loop-workflow.md (delta-proof step)
        observation: >-
          Pinned "passes 16/16" — observed 17 tests / 17 pass / 0 fail on the
          merged tree AND identically at merge-base 73d46e7; the extra test
          landed on main (b74c4c0) after the pin. Unmasked volatile count;
          full pass reproduces.
        reobserve: node --test the four inner-loop test files at 73d46e7 and merged
    evidence: >-
      Pack replay (docs/probes/inner-loop-workflow.md, oldest first): fixture
      bring-up printed a temp repo path seeded with committed
      docs/design/design.md + docs/ledger/ledger.md; live channel attempt
      from $FIX printed exactly "Unknown command: /the-loop" (exit 0),
      reproducing its pin; npm run check as above; npm test full-suite green
      including inner-loop-happy/park/halt; the delta-proof pin's pre-merge
      half reproduced at inner-loop-workflow's own pre-merge tip (cc7eba9^:
      "Could not find" the four test files) and its merged half passed in
      full; the pack-replay meta step needed nothing. New exercise: all
      expectation-sheet steps green on the merged tree (see exercise). Delta
      proof at merge-base 73d46e7 (temp worktree, removed after): the
      sentinel prefix rendered to "" (dropped), the heading-first seed case
      stayed title-less ("## What this is" first line), and the repo-tree
      render left ledger.md title-less — red on base, green on merged, not
      vacuous.
    unobserved: >-
      Exhaustive arbitrary-priorText byte-identity beyond the probed
      sentinel/seed/empty cases — observable only through the unit harness
      (the probe binding forbids in-process imports); covered there by
      test/ledger.test.js. The live claude -p BoundaryResult channel remains
      unrunnable here ("Unknown command: /the-loop" — the plugin is not
      installed), matching the pack's pinned soft spot.
result: perfect
exercise:
  - 'bring up: node bin/probe-fixture.js populated → temp repo $FIX with committed docs/design/design.md + docs/ledger/ledger.md'
  - 'overwrite $FIX/docs/ledger/ledger.md with "# Custom Title\n\n<!-- sentinel-prior-text -->\n\n## First Section\n\ncontent\n"; captured pre-heading prefix "# Custom Title\n\n<!-- sentinel-prior-text -->\n\n"'
  - 'from $FIX: node <the-loop>/bin/spine.js ledger render → {"written": "docs/ledger/ledger.md"}, exit 0'
  - 're-extract the pre-heading prefix → byte-identical to the captured prefix (=== true)'
  - 'seed case: fresh $FIX, ledger.md set to "## First Section\n\ncontent\n"; render → first lines ["# Ledger — projected from design.md (feature graph)", "", "## What this is"]'
  - 'repo case: head -1 docs/ledger/ledger.md = "# Ledger — the-loop   ·   projected from design.md (feature graph) · established at Design finalize, 2026-06-29"; node bin/spine.js ledger render → written; head -1 unchanged, not "## "; git diff -- docs/ledger/ledger.md = 0 bytes'
  - 'harness: npm test 108/108; npm run check OK — 0 error(s), 0 warning(s)'
  - 'delta proof at 73d46e7 worktree: sentinel prefix dropped to "", seed case left title-less, repo render left "## What this is" as line 1 — all red on base'
spec_ambiguities:
  - >-
    Criterion 1's "the standard title line" is contract-undefined — no repo
    artifact names its text. The plan pinned the constant "# Ledger —
    projected from design.md (feature graph)"; the blind sheet could only
    check that some title precedes the first "## " heading. Both readings
    (any reasonable title vs. this exact constant) fit the contract; routes
    to Design if the exact text is load-bearing.
waivers: []
```
