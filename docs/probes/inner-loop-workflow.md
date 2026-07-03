# Probe pack — inner-loop-workflow

First pin for this feature: the exercise the independent validator ran on its
`inner-loop-workflow` runtime leg (patch_id `e9efcf74bbc7368b13365412fca791da012fef98`),
re-validating a fix-in-place resolution of an earlier deviation. The Workflow
orchestration (`workflows/inner-loop.js`) drives Plan→Build→Derive→Validate over a
feature graph to a `BoundaryResult`; the fixture-repo probe binding's own recorded
soft spot is the live `claude -p` channel (agent-pack surfaces), so this pack's
replay leans on the deterministic shim channel, with the live channel's non-runnable
steps named rather than faked.

Volatile fields (temp-dir paths, exact durations, commit SHAs) are masked below;
replay re-derives them fresh each time.

```yaml
steps:
  - action: bring up the fixture-repo probe's populated variant — `node bin/probe-fixture.js populated`
    expected_observation: prints a temp git repo path ($FIX) seeded with a committed docs/design/design.md + docs/ledger/ledger.md
  - action: from $FIX, invoke the live agent-pack channel — `claude -p "/the-loop"`
    expected_observation: >-
      unrunnable in this installation — "Unknown command: /the-loop" (the-loop is not
      an installed plugin here); recorded as unobserved, not faked. When runnable, this
      is the leg's primary channel and should reproduce a BoundaryResult per the
      pinned shape.
  - action: deterministic channel — `npm run check`
    expected_observation: "OK   21 features, 10 contracts — 0 error(s), 0 warning(s)"
  - action: deterministic channel — `npm test`
    expected_observation: full suite green, including test/inner-loop-happy.test.js (BoundaryResult completed[]/parked[]/budget{spent,remaining}), test/inner-loop-park.test.js (a plan bounce, a feature-kind build block, a validate `deviation` return, and a validate `blocked`/`kind:feature` readiness block each park with deviation+menu carried verbatim while an independent feature drains to completion), and test/inner-loop-halt.test.js (an environment-kind block and a named budget-exhaustion error each set `halted`; an unnamed "budget"-mentioning error and agent death/ordinary throws stall instead, never halting)
  - action: delta proof — run `node --test test/inner-loop-happy.test.js test/inner-loop-park.test.js test/inner-loop-halt.test.js test/inner-loop-remediation.test.js` in a worktree at the merge-base (main's pre-merge tip)
    expected_observation: "Could not find" the test files — workflows/inner-loop.js and its shim-driven tests do not exist pre-merge; the same run on the merged tree passes 16/16
  - action: pack replay
    expected_observation: docs/probes/ carried no prior entries at validation time — trivially complete
```

**Unobserved**, named rather than silently skipped: the live `claude -p "/the-loop"`
run against either arm of criterion 3 (an environment-shaped block via a dirtied
$FIX tree, or a budget cap low enough to exhaust mid-run) — the plugin isn't
installed in this environment, and separately, `args` carries no budget/cap input
channel through which a live run could even be seeded to exhaust (a contract gap
the expectation sheet itself names). The populated fixture variant also seeds only
a two-feature graph (one validated, one building), not the two-independent-designed-
feature frontier (one to complete clean, one to deviate) the sheet's live probe
steps assume — a limitation of the existing fixture-repo probe binding, not of this
diff.
