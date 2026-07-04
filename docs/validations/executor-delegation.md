# Validations — executor-delegation

## Validation — patch_id `0fcad572050c500ba491ce056523dbb0cc7360fc`

```yaml
feature: executor-delegation
design_version: 6
patch_id: 0fcad572050c500ba491ce056523dbb0cc7360fc
readiness:
  rebase: clean
  resolutions: []
  preconditions: { test_harness: ok, probe: ok }
legs:
  forensics:
    verdict: PASS
    findings: []
    evidence: >-
      `node bin/spine.js validate scan executor-delegation worktree-executor-delegation`
      (the feature's bound integration target, per design.md's "Current target binding,
      this branch only" sentence) returned one hit: suppression-directive,
      agents/drive.md:154, matched on "(`eslint-disable`, `noqa`, a rule-config edit, any
      equivalent), a footprint". Dismissed: reading the surrounding lines (agents/drive.md
      140-157, "## 7 · Type the failure") shows this is narrative prose in a Markdown agent
      surface, enumerating what a judgment-defect diff can look like ("a lint suppression
      (`eslint-disable`, `noqa`, a rule-config edit, any equivalent)") — not executed code,
      not a config edit, not a suppression directive applied anywhere in this diff. No other
      tripwire fired; no confirmed hit.
    unobserved: ""
  conformance:
    verdict: PASS
    findings: []
    evidence: >-
      Spec axis, read fresh against the plan's pinned conventions and the expectation sheet
      (not taken on the completion reports' word). src/executors.js: parseExecutor/
      parseExecutors/validateBindings match the pinned field spec, error codes, and warning
      codes exactly — re-verified independently against a fresh out-of-repo executors/
      fixture and settings fixture (not the shipped test files): unregistered-executor hard
      error ("role \"build.rote\" binds via \"unregistered-exec\", which names no registered
      executor"), model-outside-playbook hard error, and all three warnings
      (no-routing-surface, off-rubric-tier, ignored-effort) each fired in isolation, table
      still printed to stdout, exit 0 for warnings / exit 1 for errors. bin/spine.js's
      `executors`/`models` wiring matches the pinned CLI convention exactly (dir defaults,
      malformed-playbook exit 1 naming file+field, absent-dir → `{}`). executors/grok.md
      carries the plan's pinned machine block verbatim (byte-diffed by eye against the plan's
      pinned block) plus every named lore item. workflows/inner-loop.js's isViaBound/
      spawnDrive match the pinned route condition, driver-resolution rule (silent
      `drive.<via>` lookup vs. logged `roleBinding('drive')` fallback), four-line prompt,
      dual-model label, and single pinned log line — confirmed both by reading the diff and
      by test/inner-loop-drive.test.js's five tests, each read line-by-line against the
      criterion it claims. agents/drive.md's ten numbered steps match the plan's pinned
      choreography, failure-typing table, and booking deltas exactly, verified by a live,
      unscripted end-to-end run (see runtime leg): a real `claude -p --agent drive` session
      (agents/drive.md's body as its only agent definition) driving the real `grok` CLI
      against a fresh fixture repo produced exactly the described shape — one driver-authored
      `widget/t1: add() — sum two numbers` commit on `loop/widget`, a disposed
      `.claude/worktrees/drive-widget-t1` worktree, and a completion-report summary opening
      "Driven via grok/grok-build — ". protocols/branch-and-booking.md carries build.md's
      former §2/§5 near-verbatim, agent-neutrally parameterized; agents/build.md's remaining
      cross-references (§1/§3/§4/§6) all still resolve. commands/the-loop.md's new step 4
      (pre-flight) matches the pinned wording and command strings; step 5 lists `drive` as a
      fifth agent type. docs/research/2026-07-03-grok-native-worktree.md states the question,
      real commands, and an observed (not guessed) negative result, plus the standing
      consequence. `git diff worktree-executor-delegation...loop/executor-delegation --stat`
      lists exactly the nine tasks' declared footprints, nothing unclaimed. Standards axis:
      docs/standards/pure-core-thin-cli.md (t1/t2/t4) — src/executors.js imports only
      node:path (pure filename-stem extraction) and `./blocks.js`, no fs/process; all fs work
      (readRegistry, readDefaults, readSettingsLayer) sits in bin/spine.js, confirmed by
      reading every import. docs/standards/loop-surfaces.md (t3/t5/t6/t8) — grok.md,
      drive.md, build.md, protocols/branch-and-booking.md, commands/the-loop.md all grep
      clean for "ADR" (verified directly, zero hits across all five). No baseline-catalog
      smell found: no duplicated lookup logic between spawnDrive and the ordinary build spawn
      site (spawnDrive is a distinct, single-purpose helper); agents/build.md's and
      agents/drive.md's duplicated Return-shape sections are a documented, deliberate design
      decision (design.md's executor-delegation node notes: "return shapes stay duplicated
      per agent since they diverge"), not an unflagged Duplicate Code smell. `npm run lint`:
      "ESLint: No issues found". test/executors.test.js (16 tests) and
      test/executors-cli.test.js (9 tests) were read directly and independently
      re-derived against fresh fixtures with matching results (see runtime-leg exercise).
    unobserved: >-
      Live, unscripted reproduction of each specific failure-typing branch in
      agents/drive.md §7 (truncation-then-retry, mechanical-defect-then-retry,
      judgment-defect-immediate-park, second-failure-parks-with-both-runs'-evidence) — the
      grok CLI's own output is not deterministically steerable into a chosen defect shape
      from this environment (matching the expectation sheet's own ambiguity note); verified
      by close reading against the criterion text instead, which matches verbatim. One
      incidental, real data point on the disposal/crash-healing path did surface during the
      live exercise below (see runtime-leg evidence) but does not stand in for the four typed
      branches.
  acceptance:
    verdict: FAIL
    findings:
      - severity: contract-breaking
        cites: >-
          model-selection acceptance criterion 1 ("spine models resolves every registered
          role to model, effort, and executor by merging plugin defaults with project and
          local settings overrides, printing per-role provenance") — proven by
          test/spine-cli.test.js:224, "spine models merges an overridden defaults file with
          project < local settings overrides (whole-entry replacement), stamping per-role
          provenance and carrying a bound via through untouched"
        location: test/spine-cli.test.js:224
        observation: >-
          `npm test` on the rebased branch: 153 tests, 152 pass, 1 fail — the test above.
          Its fixture binds `drive` via the placeholder value "my-executor" (never a
          registered executor; the test's own point is that an arbitrary `via` value rides
          through settings-layer merges untouched). t4's task wires `validateBindings`
          unconditionally into `spine models`, so this fixture's via now hard-fails
          unregistered-executor and `spine models` exits 1 printing no table at all,
          breaking every assertion in the test (`Command failed: node bin/spine.js models
          defaults.json`, stderr: `error unregistered-executor: role "drive" binds via
          "my-executor", which names no registered executor (drive)`). Confirmed not
          pre-existing: reproduced the identical test against the integration target's
          pre-diff tip (`worktree-executor-delegation`, commit 8aae8c6) in an isolated
          worktree — 121/121 tests pass there, including this one, cleanly. Reproduced
          twice on the merged branch, consistently red both times, not flaky. Four
          completion reports (t4, t5, t6, t7 — t8 as well) each recorded this failure as "a
          pre-existing, unrelated" regression left red under the no-unrelated-fixes rule
          because the file sits outside their own declared footprints — that framing is
          inaccurate (it is not pre-existing; it is introduced by t4's own wiring, confirmed
          by the target-tip delta-proof above), though the underlying facts each report
          quotes (fixture, error text, file:line) are accurate.
        reobserve: "node --test test/spine-cli.test.js"
    evidence: >-
      `npm test`: 152/153 pass (the single finding above), reproduced identically across two
      full-suite runs. `npm run lint` and `node bin/spine.js check`: both zero-finding clean
      ("ESLint: No issues found"; "OK   25 features, 11 contracts — 0 error(s), 0
      warning(s)"). `node bin/spine.js plan check executor-delegation`: 0 errors, 1
      pre-existing size-at-ceiling warning on t6, justified in the plan's own
      "Size-ceiling justification" section. This is the only acceptance-leg finding.
    unobserved: ""
  runtime:
    verdict: FAIL
    findings:
      - severity: contract-breaking
        cites: >-
          docs/probes/inner-loop-workflow.md "deterministic channel — npm test" pinned
          expectation ("full suite green...") and docs/probes/ledger-title-preservation.md
          "deterministic corroboration" pinned expectation ("full suite green (0 fail)...")
        location: test/spine-cli.test.js:224
        observation: >-
          Identical root cause as the acceptance-leg finding above, not an independently
          introduced second regression: replaying both existing probe-pack entries' `npm
          test` steps on the merged tree reproduces the same 152/153-pass, 1-fail result,
          breaking each entry's pinned "full suite green" observation. No clause of
          executor-delegation's own four acceptance criteria names or supersedes
          model-selection's via-pass-through behavior, so the supersession exception does
          not apply. Consistently red across two reproductions, not flaky.
        reobserve: "node --test test/spine-cli.test.js"
    evidence: >-
      Fixture-repo probe brought up clean (`node bin/probe-fixture.js populated` → temp git
      repo, clean tree). Pack replay, oldest first — docs/probes/model-selection.md: step
      "resolve the shipped table" reproduced exactly (every config/model-bindings.json role
      prints provenance `default`); step "layer precedence" reproduced exactly (a project
      override on build.rote → provenance project; a local override on derive → provenance
      local; `plan` untouched, still default) — both re-derived directly against a fresh
      fixture, not taken from the shipped test suite. docs/probes/ledger-title-preservation.md:
      the sentinel-prefix byte-identity step reproduced exactly (pre-heading bytes
      byte-identical before/after render); the "full suite green" corroboration line is red,
      per the finding above; the live-repo-root head/diff step was not re-run against this
      actual judged checkout, to avoid an undeclared write to the judged tree — recorded as
      unobserved rather than skipped silently. docs/probes/inner-loop-workflow.md: `npm run
      check` matches ("OK   25 features, 11 contracts — 0 error(s), 0 warning(s)", counts
      drift as pinned); the live `claude -p "/the-loop"` step was not attempted (out of
      scope for this pack's own pinned unobserved note); the deterministic-channel "full
      suite green" line is red, per the finding above. New exercise (this feature's own
      expectation sheet, executed directly): criterion 1 — a real, unscripted headless Claude
      session (`claude -p --agent drive`, agents/drive.md's exact body as the only agent
      definition, `--model sonnet --permission-mode bypassPermissions
      --max-budget-usd 3`) was run against a fresh throwaway git fixture repo (design.md +
      plan.md seeding one rote task, `build.rote` bound `via: grok`/`model: grok-build`),
      with `CLAUDE_PLUGIN_ROOT` pointed at this checkout. The session ran 60 turns,
      $1.44, ~7.3 minutes, and returned `{"task":"widget/t1","result":"built", …,
      "summary":"Driven via grok/grok-build — …"}`. Independently verified on disk
      afterward (not taken on the session's own word): `loop/widget` carries exactly one new
      commit beyond the fixture's seed commit, `widget/t1: add() — sum two numbers`; `git
      show` on it touches exactly src/widget.js (3 lines) and test/widget.test.js (7
      lines); `node --test` inside that commit's tree passes (1/1); `.claude/worktrees/`
      is empty afterward (the worktree and its sibling `.prompt.md` were disposed); the
      booked completion report in docs/plans/widget.md carries `result: built` and a summary
      opening "Driven via grok/grok-build — " verbatim; the feature flipped `planned` →
      `building` and the ledger re-rendered. One real, incidental data point on crash-healing
      surfaced during this run: an earlier attempt of the same command was killed (2-minute
      shell timeout) before producing output; the successful run's own `deviations` field
      states it found "stale scratch debris from a prior interrupted drive run (an empty
      detached worktree and a stale prompt file at the same pinned paths, no committed
      work)... disposed it and drove fresh" — consistent with agents/drive.md §5's
      unconditional-disposal rule, though this is one incidental observation, not a
      controlled exercise of that path. Criterion 3 — re-derived directly against a fresh
      out-of-repo fixture (not the shipped test files): `spine executors` prints the real
      grok registry (worktree driver-made, models [grok-build, grok-composer-2.5-fast]);
      `spine models` hard-fails an unregistered-executor via and a model-outside-playbook
      via, each naming the offender, exit 1, no table; all three warnings
      (no-routing-surface, off-rubric-tier, ignored-effort) each print their pinned stderr
      line, table still prints, exit 0; a malformed fixture playbook (empty `models`) exits
      1 naming file+field; an absent dir prints `{}`. Criterion 4 (partial) — the real `grok`
      CLI is installed and authenticated in this environment: `grok --version` → "grok 0.2.82
      (6d0b07d2de0f) [stable]"; the playbook's own auth smoke, `grok -p "say PONG"
      --max-turns 1`, printed exactly "PONG" — confirming the shipped playbook's
      availability/auth_smoke commands are accurate, real commands, not just
      plausible-looking strings. The launch-leg pre-flight procedure itself
      (commands/the-loop.md step 4) is prose a session follows, not code with its own test
      surface — text-verified against the criterion, not independently executed as a gate.
      Delta proof: `git show 8aae8c6:agents/drive.md`, `:executors/grok.md`, and
      `:protocols/branch-and-booking.md` all fail with "exists on disk, but not in
      '8aae8c6'" — the entire driven-execution capability this exercise depends on is
      absent at the integration target's pre-diff tip; `git show
      8aae8c6:workflows/inner-loop.js | grep -c 'spawnDrive|isViaBound'` → 0. The exercise
      is definitionally impossible pre-diff and fully functional post-diff — non-vacuous.
      Worktrees and the throwaway fixture repo removed after use.
    unobserved: >-
      Live reproduction of agents/drive.md §7's four typed failure branches
      (truncation-then-retry, mechanical-defect-then-retry, judgment-defect-immediate-park,
      second-failure-park-with-both-runs'-evidence-and-kind-stamped-menu) — reliably eliciting
      a chosen defect shape from grok's own nondeterministic output is not controllable from
      this environment (the expectation sheet's own ambiguity note anticipates exactly this).
      The launch-leg pre-flight's live "stops the launch with nothing run" enforcement against
      a real failing availability/auth check, end to end through an actual `/the-loop` launch
      — procedural prose followed by a session, not independently exercisable as code from
      here. grok's `--worktree`/`--worktree-ref` native mode — already the subject of t9's own
      probe record, out of this leg's scope to re-observe. docs/probes/ledger-title-
      preservation.md's live-repo-root render/diff step, deliberately not re-run against this
      judged checkout to avoid an undeclared write to the tree under judgment.
result: deviation
deviation: >-
  One contract-breaking acceptance-leg finding, propagating identically into the runtime
  leg's pack replay: t4 wires `validateBindings` unconditionally into `spine models`, and
  test/spine-cli.test.js:224 (model-selection's own acceptance-criterion-1 test) uses a
  fixture binding `drive` via the placeholder value "my-executor" — never a registered
  executor, used only to prove that an arbitrary `via` value survives settings-layer merges
  untouched. That via now trips the new `unregistered-executor` hard error, so `spine models`
  exits 1 with no table, breaking the test's every assertion. Confirmed not pre-existing: the
  identical test passes cleanly (121/121) at the integration target's pre-diff tip
  (`worktree-executor-delegation`, commit 8aae8c6); it only fails (152/153) once
  executor-delegation's diff lands, reproduced consistently across two full-suite runs, not
  flaky. The same failure also breaks the "full suite green" pinned observation replayed from
  two existing probe-pack entries (docs/probes/inner-loop-workflow.md and
  docs/probes/ledger-title-preservation.md), recorded as its own runtime-leg finding since no
  clause of executor-delegation's own contract supersedes model-selection's via-pass-through
  behavior. Four completion reports (t4, t5, t6, t7, t8) each characterize the failure as
  "pre-existing, unrelated" and leave it red under the no-unrelated-fixes rule — the quoted
  facts (fixture, error text, file:line) are accurate, but "pre-existing" is not: it is this
  diff's own regression into an already-validated feature's acceptance criterion. All other
  legs are clean: forensics found zero confirmed hits (one dismissed, prose-only); conformance
  found zero findings on either axis, with every criterion independently re-exercised live
  against fresh fixtures (including a real, unscripted end-to-end `claude -p --agent drive`
  run against the real `grok` CLI, reproducing criterion 1's exact shape) rather than taken on
  the completion reports' word.
menu:
  - fix-in-place — append a task updating test/spine-cli.test.js:224's fixture to bind `drive`
    via either the literal `agent` (or no via) or a real registered executor id instead of the
    placeholder "my-executor" (preserving the test's actual point — via rides through merges
    untouched — without tripping the new hard-validation), build it on the branch, re-validate
  - waive — merge on human authority, recording the one red model-selection acceptance-
    criterion-1 regression as an accepted transitional gap until a separate commit updates the
    stale fixture
  - re-plan — route t4 back to Plan to scope `spine models`'s new hard-validation (e.g. an
    explicit opt-in flag, or a documented one-time fixture update alongside the wiring change)
    so a pre-existing, already-validated feature's test fixture isn't broken by a later
    feature's unconditional CLI change, then rebuild and re-validate
branch: loop/executor-delegation
merged: false
exercise:
  - action: "spine executors / spine models against fresh out-of-repo fixtures — hard-fail A (unregistered via), hard-fail B (model outside playbook), warn A/B/C (no-routing-surface, off-rubric-tier, ignored-effort), malformed playbook, absent dir"
    observed: "hard-fail A/B: exit 1, error line naming the offending role and via/model, no table; warn A/B/C: exit 0, one pinned stderr line each, table still printed to stdout; malformed playbook: exit 1 naming file+field; absent dir: prints {}"
  - action: "real grok CLI availability + auth smoke: `grok --version`, `grok -p \"say PONG\" --max-turns 1`"
    observed: "\"grok 0.2.82 (6d0b07d2de0f) [stable]\"; auth smoke printed exactly \"PONG\" — the shipped playbook's pinned commands are real and functional in this environment"
  - action: "live, unscripted end-to-end drive: `claude -p --agent drive` (agents/drive.md's own body as the agent definition) against a fresh fixture repo with build.rote bound via grok/grok-build on one rote task"
    observed: "one driver-authored commit `widget/t1: add() — sum two numbers` on loop/widget (2 files, 10 insertions), .claude/worktrees/ empty afterward, node --test 1/1 green on that commit's tree, completion report summary opening \"Driven via grok/grok-build — \", feature flipped planned→building, ledger re-rendered; the run's own deviations note it found and disposed stale worktree/prompt debris from an earlier killed attempt before driving fresh"
  - action: "delta proof — git show 8aae8c6:agents/drive.md / :executors/grok.md / :protocols/branch-and-booking.md; grep for spawnDrive/isViaBound in 8aae8c6's workflows/inner-loop.js"
    observed: "all three files 'exist on disk, but not in 8aae8c6'; zero matches for spawnDrive/isViaBound — the driven-execution capability the live exercise depends on is entirely absent at the integration target's pre-diff tip"
  - action: "full-tree acceptance: npm test, npm run lint, node bin/spine.js check, node bin/spine.js plan check executor-delegation — twice each"
    observed: "npm test 152/153 both times (test/spine-cli.test.js:224 fails both times); npm run lint clean; spine check 'OK 25 features, 11 contracts — 0 error(s), 0 warning(s)'; plan check 0 errors, 1 pre-justified size-at-ceiling warning on t6"
  - action: "isolate the regression's cause — reproduce npm test against the integration target's pre-diff tip (worktree-executor-delegation, commit 8aae8c6) in an isolated worktree"
    observed: "121/121 pass, including test/spine-cli.test.js:224 cleanly — the failure is introduced by this diff's own t4, not pre-existing"
  - action: "pack replay — docs/probes/model-selection.md's 'resolve the shipped table' and 'layer precedence' steps, against a fresh fixture"
    observed: "every default-table role prints provenance default; a project override on build.rote and a local override on derive each flip provenance correctly, other roles untouched — matches pinned shape exactly"
  - action: "pack replay — docs/probes/ledger-title-preservation.md's sentinel byte-identity step"
    observed: "pre-heading bytes ('# Custom Title\\n\\n<!-- sentinel-prior-text -->\\n\\n') byte-identical before and after a fresh render"
spec_ambiguities: []
waivers: []
```

## Validation — patch_id `88b13138b8da074e465d3aac7894f2841d88ebb1`

```yaml
feature: executor-delegation
design_version: 6
patch_id: 88b13138b8da074e465d3aac7894f2841d88ebb1
readiness:
  rebase: clean
  resolutions: []
  preconditions: { test_harness: ok, probe: ok }
legs:
  forensics:
    verdict: PASS
    findings: []
    evidence: >-
      `node bin/spine.js validate scan executor-delegation worktree-executor-delegation`
      (the bound integration target) returned two hits, both dismissed. (1)
      suppression-directive, agents/drive.md:154 — reading the surrounding lines
      (agents/drive.md's "## 7 · Type the failure") shows narrative prose enumerating
      what a judgment-defect diff can look like ("a lint suppression (`eslint-disable`,
      `noqa`, a rule-config edit, any equivalent)") — not executed code, not an actual
      suppression applied anywhere in this diff; identical to the hit the prior
      validation round (patch_id 0fcad572…) already dismissed on the same file/line,
      unchanged by this round's diff. (2) existing-test-mutation,
      test/spine-cli.test.js:378 — this is fix-1's own declared fix: 3 lines rewritten
      in the CUSTOM_DEFAULTS fixture, swapping the placeholder `{model: 'sonnet', via:
      'my-executor'}` for a real registered value `{model: 'grok-build', via: 'grok'}`.
      Read the full diff (`git show HEAD -- test/spine-cli.test.js` on the pre-squash
      branch): the change is exclusively literal-value substitution inside three
      pre-existing `assert.deepEqual` calls — same count, same structure, same rigor;
      no assertion loosened, no test deleted. The test's documented point ("carrying a
      bound via through untouched") is unchanged and still proven — confirmed the new
      value rides through `spine models`' real, unmodified validation path (via: grok
      is registered by executors/grok.md, model: grok-build is in grok's own playbook
      models list) rather than bypassing it. The edit is required by this feature's own
      acceptance criterion 3 (spine models must hard-fail an unregistered via, which the
      old placeholder now legitimately is once t4's validateBindings wiring lands) — not
      a dodge of a check, a correction of an input a prior feature's test never
      anticipated a later, contracted feature would invalidate.
    unobserved: ""
  conformance:
    verdict: PASS
    findings: []
    evidence: >-
      Spec axis, read fresh against the plan's pinned conventions and the expectation
      sheet. Everything unchanged from the prior validation round (t1–t9: src/executors.js,
      src/index.js, executors/grok.md, bin/spine.js's `executors`/`models` wiring,
      workflows/inner-loop.js's isViaBound/spawnDrive, agents/drive.md,
      protocols/branch-and-booking.md, agents/build.md, commands/the-loop.md,
      docs/research/2026-07-03-grok-native-worktree.md) re-confirmed by direct, fresh
      exercise rather than re-quoted: `spine executors` against the real plugin dir prints
      grok with worktree driver-made and the pinned models list; `spine models` against
      fresh out-of-repo fixtures reproduces both hard-fail codes (unregistered-executor,
      model-outside-playbook) and all three warnings (no-routing-surface, off-rubric-tier,
      ignored-effort) exactly per the pinned CLI convention, plus a malformed-playbook
      exit 1 naming file+field and an absent-dir `{}`; `test/inner-loop-drive.test.js`
      (5/5) and `test/inner-loop-happy.test.js`/`test/inner-loop-park.test.js`/
      `test/inner-loop-halt.test.js`/`test/inner-loop-remediation.test.js` (22/22) all
      pass; a live, unscripted end-to-end `claude -p --agent drive` run against a fresh
      throwaway fixture (see runtime leg) reproduced agents/drive.md's full choreography
      exactly. fix-1's own diff (new this round): bin/spine.js shrank to 129 lines of
      pure argv dispatch; bin/spine-commands.js (390 raw lines) holds every command body
      and imports only from `../src/*` (no import-direction violation, confirmed by
      reading every import line) with no cycle back into bin/spine.js (spine.js is the
      only file that imports across the pair); `npx eslint bin/spine-commands.js
      bin/spine.js` is clean with no suppression and no `eslint.config.js` edit (confirmed
      via `git diff` on that file — untouched). Footprint check: the union of every task's
      declared footprint (t1–t9 + fix-1) accounts for exactly the 15 files in
      `git diff --stat worktree-executor-delegation...loop/executor-delegation` — nothing
      unclaimed. Standards axis: docs/standards/pure-core-thin-cli.md (t1/t2/t4) —
      src/executors.js imports only node:path + ./blocks.js, no fs/process, confirmed by
      reading every import; docs/standards/loop-surfaces.md (t3/t5/t6/t8) — grok.md,
      drive.md, build.md, protocols/branch-and-booking.md, commands/the-loop.md all grep
      clean for "ADR" (0 hits across all five, re-confirmed). No baseline-catalog smell
      found; the duplicated Return-shape sections between build.md/drive.md remain a
      documented, deliberate decision (design.md's own node notes), not an unflagged
      smell. `npm run lint`: "ESLint: No issues found". One administrative note, not a
      finding: `spine plan check executor-delegation` warns `stale-plan` (plan cut from
      design_version 6, graph now at 7) — traced via `git show 498e7c1 --
      docs/design/design.md`: the only design.md edit between versions 6 and 7 inserts
      the unrelated `workflow-phase-grouping` node after this feature's; executor-delegation's
      own acceptance text is byte-unchanged, matching its own node's note that "design_version
      stays 6" for this build's authoritative spec.
    unobserved: ""
  acceptance:
    verdict: PASS
    findings: []
    evidence: >-
      `npm test`: 187/187 pass, reproduced twice. `npm run lint`: clean. `node
      bin/spine.js check`: "OK   25 features, 12 contracts — 0 error(s), 0 warning(s)".
      `node bin/spine.js plan check executor-delegation`: 0 errors, 2 warnings
      (stale-plan — administrative, traced above, no criterion text changed;
      size-at-ceiling on t6 — pre-justified in the plan's own "Size-ceiling
      justification" section). test/spine-cli.test.js:224 (the prior round's sole
      contract-breaking finding) is green: fix-1's fixture now binds a via/model pair
      (grok/grok-build) that survives spine models' registry validation while still
      proving the via-passthrough behavior the test names.
    unobserved: ""
  runtime:
    verdict: PASS
    findings: []
    evidence: >-
      Fixture-repo probe brought up clean each time (`node bin/probe-fixture.js
      populated`). Pack replay, oldest first, every deterministic step reproduced fresh
      against new fixtures (not re-quoted from any prior round): docs/probes/model-
      selection.md — all five steps (resolve the shipped table; layer precedence;
      workflow spawn plumbing via test/inner-loop-happy.test.js's tier-routing test;
      tier routing + grandfather, same test; tier validation via test/plan.test.js's
      tier tests plus a fresh CLI fixture exercising bad-tier/absent-tier) all match
      pinned shapes exactly. docs/probes/ledger-title-preservation.md — sentinel
      byte-identity preserved across a fresh render, the no-pre-heading seed case
      produces the standard title line; the live-repo-root render/diff step
      deliberately not re-run against this judged checkout, to avoid an undeclared
      write to the tree under judgment (recorded unobserved, matching the prior round's
      same caution). docs/probes/inner-loop-workflow.md — `claude -p "/the-loop"`
      reproduces "Unknown command: /the-loop" exactly; `npm run check` and `npm test`
      both green (the prior round's sole break, now fixed); the pinned test-file
      delta-proof re-run (`node --test test/inner-loop-happy.test.js
      test/inner-loop-park.test.js test/inner-loop-halt.test.js
      test/inner-loop-remediation.test.js`, 22/22 pass). docs/probes/surfacing.md — all
      nine practically-reproducible deterministic steps replayed against a fresh
      fixture: `the-loop orient` reports mode active / parked names the feature /
      proposal.kind resolve-parked; `ledger render` renders the kind-stamped menu as
      `[fix-in-place] …; [waive] …` (never `[object Object]`); all four `escalation
      resolve` kinds (fix-in-place, re-plan, waive, retry) reproduced their exact pinned
      JSON shapes and side effects (status flips, deleted files, the retried-mark
      stamp); a `validate scan` on the same patch_id flips dedup true→false after the
      retry, `retried` surfaced verbatim; `ledger append-run` inserts newest-first with
      a byte-identical repeat bullet; the full-choreography commit lands the status
      flip, deleted record, and re-rendered Ledger together. The historical
      merge-base delta-proof and the live `/the-loop` narration inside that pack are
      each already-sealed history from surfacing's own validation / this binding's
      already-recorded soft spot — not re-executed here, consistent with how the prior
      round treated the same two packs' own delta-proof/live-channel steps. New
      exercise (this feature's own expectation sheet, executed live): criterion 1 — a
      real, unscripted `claude -p --agent drive` session (agents/drive.md copied
      verbatim into a fresh fixture's `.claude/agents/drive.md`, `--model sonnet
      --permission-mode bypassPermissions --max-budget-usd 3`, `CLAUDE_PLUGIN_ROOT`
      pointed at this checkout) was run against a fresh throwaway git fixture (design.md
      + a one-rote-task plan seeding `gadget/t1`, prompt lines `feature: gadget / task:
      t1 / executor: grok / executor-model: grok-build`). Verified on disk, not on the
      session's own word: `loop/gadget` gained exactly one commit beyond the seed,
      `gadget/t1: add() — sum two numbers`; `git show --stat` on it touches exactly
      `src/gadget.js` (3 lines) and `test/gadget.test.js` (8 lines), 11 insertions, 0
      deletions; `node --test` on that commit's tree passes 1/1; the prompt file
      assembled at the pinned path carried the task-contract slice, the full build
      constitution, an explicit "no standards selected" note, the imperative footer
      (one test per criterion, watch-red-then-green, footprint-only, no suppression, no
      test deletion, the exact commit message), and grok-specific lore advice pulled
      from executors/grok.md; `ps` during the run showed the exact pinned invocation
      (`grok -m grok-build --prompt-file … --cwd … --always-approve --no-subagents
      --max-turns 500 --output-format plain`) running inside a `git worktree add
      --detach` worktree; after the run, `git worktree list` shows only the main
      checkout (the detached worktree disposed) and `.claude/worktrees/` no longer
      exists (prompt file disposed too); HEAD was left on `main` (the fixture's
      target); the booking commit "gadget: book task t1" landed there, flipping
      gadget's status planned→building, re-rendering the fixture's Ledger, and folding
      a completion report whose `summary` opens verbatim "Driven via grok/grok-build —
      "; `deviations: []` (a clean run). Two earlier attempts of the same command were
      killed by this validator's own tooling (a 2-minute foreground-shell timeout)
      before grok finished, leaving a stale detached worktree and prompt file at the
      exact pinned paths — the third, backgrounded attempt proceeded past that
      collision to a clean result, an incidental real observation of the same
      stale-debris-at-pinned-path shape the prior round's own live run encountered,
      not a controlled exercise of drive.md's own crash-healing branch. Delta proof
      (freshly re-derived, not re-quoted): `git show worktree-executor-delegation:
      agents/drive.md` / `:executors/grok.md` / `:protocols/branch-and-booking.md` each
      fail "exists on disk, but not in 'worktree-executor-delegation'"; `git show
      worktree-executor-delegation:workflows/inner-loop.js | grep -c
      'spawnDrive\|isViaBound'` → 0 — the entire driven-execution capability the live
      exercise depends on is absent at this round's own pre-diff target tip; fully
      functional post-diff — non-vacuous. Criterion 3 — re-derived directly against
      fresh out-of-repo fixtures (not the shipped test files): both hard-fail codes,
      all three warnings, the malformed-playbook exit 1, and the absent-dir `{}` all
      reproduce exactly (see conformance-leg evidence for the exact transcripts).
      Criterion 4 — `grok --version` → "grok 0.2.82 (6d0b07d2de0f) [stable]"; the
      playbook's own auth smoke, `grok -p "say PONG" --max-turns 1`, printed exactly
      "PONG"; the launch-leg pre-flight itself (commands/the-loop.md step 4) is prose a
      session follows, text-verified against the criterion rather than independently
      executed as code; the drive-time environment halt path is proven by
      test/inner-loop-drive.test.js's scripted blocked/kind:environment case (see
      above). All fixture repos, worktrees, and temp probe dirs removed after use.
    unobserved: >-
      Live reproduction of agents/drive.md §7's four typed failure branches
      (truncation-then-retry, mechanical-defect-then-retry, judgment-defect-immediate-
      park, second-failure-parks-with-both-runs'-evidence-and-kind-stamped-menu) —
      reliably eliciting a chosen defect shape from grok's own live, non-deterministic
      output is not controllable from this environment absent an executor-stub
      mechanism the probe binding doesn't provide; this is the expectation sheet's own
      named ambiguity/contract-probe gap, unchanged since the prior round. Verified
      instead by direct reading of the failure-typing section against the criterion
      text, which matches verbatim (see conformance leg). The launch-leg pre-flight's
      live "stops the launch with nothing run" enforcement end to end through an actual
      `/the-loop` invocation — procedural prose followed by a session, not
      independently exercisable as code from here. grok's `--worktree`/`--worktree-ref`
      native mode — t9's own probe record's subject, out of this leg's scope to
      re-observe. docs/probes/ledger-title-preservation.md's live-repo-root
      render/diff step and docs/probes/surfacing.md's merge-base delta-proof and live
      `/the-loop` narration step, deliberately not re-run (see evidence above for why).
result: perfect
exercise:
  - action: "spine executors / spine models against fresh out-of-repo fixtures — hard-fail A (unregistered via), hard-fail B (model outside playbook), warn A/B/C, malformed playbook, absent dir"
    observed: "hard-fail A/B: exit 1, error naming the offending role and via/model, no table; warn A/B/C: exit 0, one pinned stderr line each, table still printed; malformed playbook: exit 1 naming file+field ('\"models\" must be a non-empty string array'); absent dir: prints {}"
  - action: "real grok CLI availability + auth smoke: grok --version, grok -p \"say PONG\" --max-turns 1"
    observed: "\"grok 0.2.82 (6d0b07d2de0f) [stable]\"; auth smoke printed exactly \"PONG\""
  - action: "live, unscripted end-to-end drive: claude -p --agent drive (agents/drive.md's own body, copied into a fresh fixture's .claude/agents/) against a throwaway fixture with a rote task bound to executor grok/grok-build"
    observed: "exactly one driver-authored commit gadget/t1: add() — sum two numbers on loop/gadget (2 files, 11 insertions, 0 deletions); node --test 1/1 green on that commit's tree; .claude/worktrees/ gone afterward; booking commit gadget: book task t1 on main with a completion report summary opening 'Driven via grok/grok-build — ' verbatim, deviations: []; feature flipped planned→building; ledger re-rendered; ps showed the exact pinned grok invocation running inside a detached driver-made worktree while in flight"
  - action: "delta proof — git show worktree-executor-delegation:agents/drive.md / :executors/grok.md / :protocols/branch-and-booking.md; grep for spawnDrive/isViaBound in worktree-executor-delegation's workflows/inner-loop.js"
    observed: "all three files 'exist on disk, but not in worktree-executor-delegation'; zero matches for spawnDrive/isViaBound — the driven-execution capability is entirely absent at this round's pre-diff target tip"
  - action: "full-tree acceptance: npm test, npm run lint, node bin/spine.js check, node bin/spine.js plan check executor-delegation — twice each"
    observed: "npm test 187/187 both times; npm run lint clean; spine check 'OK 25 features, 12 contracts — 0 error(s), 0 warning(s)'; plan check 0 errors, 2 warnings (stale-plan administrative, size-at-ceiling pre-justified)"
  - action: "pack replay — docs/probes/model-selection.md, all five steps, against fresh fixtures"
    observed: "resolve-the-shipped-table and layer-precedence match exactly; workflow-spawn-plumbing and tier-routing+grandfather match via test/inner-loop-happy.test.js; tier-validation matches via test/plan.test.js plus a fresh CLI bad-tier/absent-tier fixture"
  - action: "pack replay — docs/probes/ledger-title-preservation.md's sentinel byte-identity and no-pre-heading seed steps"
    observed: "pre-heading bytes byte-identical before/after render; the seed case opens with the standard title line"
  - action: "pack replay — docs/probes/inner-loop-workflow.md's live/deterministic steps plus its pinned test-file delta proof"
    observed: "'Unknown command: /the-loop' reproduced; npm run check and npm test both green; the four pinned inner-loop test files re-run 22/22 green"
  - action: "pack replay — docs/probes/surfacing.md's nine deterministic steps against a fresh parked-feature fixture"
    observed: "orient/ledger-menu-render/all-four-escalation-resolve-kinds/retry-dedup-flip/append-run-repeat/full-choreography-commit all reproduce their pinned shapes exactly"
spec_ambiguities: []
waivers: []
```
