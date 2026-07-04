# Validations — model-selection

Append-only verdict record; one entry per validation, keyed by `patch_id`, never
rewritten.

## Validation — patch_id `25a66a57d899b0b9f2d353e8666748e79d6aee20`

```yaml
feature: model-selection
design_version: 5
patch_id: 25a66a57d899b0b9f2d353e8666748e79d6aee20
readiness:
  rebase: clean
  resolutions: []
  preconditions: { test_harness: ok, probe: ok }
legs:
  forensics:
    verdict: PASS
    findings: []
    evidence: >-
      Four scanner hits, all existing-test-mutation, all dismissed. test/plan.test.js:5
      — the only rewrite drops one strict assert (`assert.deepEqual(r.warnings, [])` on
      the base fixture) and adds an import plus two new dedicated tests
      ("an absent tier warns without blocking" and "a fully tiered plan checks clean")
      that between them cover the exact same ground more precisely; this is t4's own
      declared footprint (docs/plans/model-selection.md task t4) exercising its own new
      `tier` field, no coverage lost. test/inner-loop-happy.test.js:55,
      test/inner-loop-park.test.js:76, test/inner-loop-remediation.test.js:57 — each
      rewrite updates a pre-existing spawn-label assertion to the new
      `[<resolved-model>] ` prefix this feature's own criterion 2 mandates (e.g.
      `build:alpha/t1` → `[session] build:alpha/t1`); all three files are t5's declared
      footprint, and inner-loop-happy.test.js additionally gains new assertions (model
      opts, fallback/untiered log lines, build.<tier> routing, a new dedicated test) —
      strengthened, not weakened.
    unobserved: ""
  conformance:
    verdict: PASS
    findings: []
    evidence: >-
      Spec axis: read every task's diff against the plan's pinned cross-task
      conventions and the expectation sheet. src/models.js matches the pinned resolver
      surface (EFFORTS, resolveModels, bindingFor) verbatim, is fs/process/clock-free,
      and is barrel-exported from src/index.js. config/model-bindings.json ships
      exactly the ten pinned default rows, byte-checked. bin/spine.js's `models`
      command resolves PLUGIN_ROOT from its own file location (confirmed by reading
      the PLUGIN_ROOT constant and by delta-proof: an empty cwd still resolves the
      real shipped `plan` role), reads project/local layers from cwd under
      "the-loop".modelBindings, treats a missing file/key as an empty layer, and
      names the offending file/role on a parse/resolve failure — all confirmed live
      against fixtures (project override → provenance project; local override beats
      project, whole-entry replacement, effort dropped). src/plan.js exports
      TASK_TIERS, checkTaskTier raises error bad-tier / warning missing-tier exactly
      as pinned (confirmed live: invalid tier → ERROR bad-tier, exit 1; absent tier →
      warn missing-tier, exit 0), and appendRemediation stamps tier: standard.
      workflows/inner-loop.js's roleBinding/modelOpts/modelLabel match the pinned
      spawn-opts rule and pinned log-line text exactly (confirmed live via the shim:
      a session-bound role passes no model opt and logs nothing; an unbound role logs
      the pinned fallback line; an untiered task logs the pinned tier-fallback line and
      routes build.standard; a bound build.complex/derive spawn carries the resolved
      model+effort in both opts and label). commands/the-loop.md, agents/plan.md,
      skills/design/SKILL.md all carry the pinned instructions and grep clean for
      "ADR" (verified). No criterion's claimed surface is missing; nothing unclaimed
      was built. Standards axis: docs/standards/pure-core-thin-cli.md (t2/t3/t4) —
      src/models.js and src/plan.js stay pure, all fs/process access sits in
      bin/spine.js; docs/standards/loop-surfaces.md (t6/t7/t8) — all three surfaces
      self-contained, no ADR refs, instructions written for a zero-context agent. No
      baseline-catalog smells found in the diff (workflows/inner-loop.js's three new
      helpers are each one job, no duplication across the four spawn call sites,
      371 → 333 lines observed via `wc -l`, inside its 350-line lint budget). `npm run
      lint` and `npm run check` both zero-finding clean. Note: a full-tree test
      regression exists (test/spine-cli.test.js) but is captured under the acceptance
      leg below, not double-counted here — it falsifies no acceptance criterion,
      interface clause, or task-selected standard of this diff's own tasks.
    unobserved: >-
      Live execution of the plan agent's audit-spawn model resolution
      (agents/plan.md) and the design skill's reader/alternative spawn resolution
      (skills/design/SKILL.md) — both are session-side surfaces with no test
      coverage (confirmed by grep across test/ for agents/ and skills/ references,
      zero hits, matching each task's own completion report) and the live `claude -p`
      channel is unrunnable in this installation (see runtime leg). Text-level
      instruction correctness was confirmed by direct reading instead.
  acceptance:
    verdict: FAIL
    findings:
      - severity: contract-breaking
        cites: >-
          feature acceptance #4 — "Plan stamps tier on every task, spine plan check
          validates it... a plan cut before this feature (no tier field) validates as
          standard with fallback provenance" (the grandfather posture is warn-only,
          plan check must still pass for a legacy plan)
        location: test/spine-cli.test.js:171-178
        observation: >-
          `npm test` fails: the pre-existing test "spine plan remediate appends the
          round-marker so plan check passes..." asserts `spine plan check widget`
          output matches /^OK/, but t4's new missing-tier warning now prints a warn
          line before OK for that fixture's untiered round-marker task, breaking the
          regex match. `npm test` reports 119 pass / 1 fail. Both t4's and t5's own
          completion reports already declare this exact regression as an out-of-
          footprint deviation (test/spine-cli.test.js is t3's footprint, not t4's or
          t5's) and leave it red rather than touch a file outside their lease — a
          declaration that informs this finding, it does not green the leg.
          Reproduced three times, consistently red (not flaky).
        reobserve: "node --test test/spine-cli.test.js"
    evidence: >-
      `npm test`: 119/119 pass except the one finding above (120 total, 1 fail),
      reproduced identically on three separate runs. `npm run check` and `npm run
      lint`: clean, 0 errors/warnings.
    unobserved: ""
  runtime:
    verdict: PASS
    findings: []
    evidence: >-
      Fixture-repo probe brought up clean (bin/probe-fixture.js populated). Pack
      replay — docs/probes/inner-loop-workflow.md: bring-up matches; `claude -p
      "/the-loop"` unrunnable in this installation ("Unknown command: /the-loop",
      matching the pinned prior observation); `npm run check` matches ("OK   24
      features, 11 contracts — 0 error(s), 0 warning(s)", counts drift as pinned);
      `npm test` full-suite-green pinned observation fails — reproduced identically
      three times (consistently red) — but this feature's own contract explicitly
      names the changed behavior (acceptance #4's missing-tier warning; see the
      acceptance-leg finding above), so this replays as a **supersession** (feature
      model-selection, entry docs/probes/inner-loop-workflow.md "deterministic
      channel — npm test", citing acceptance #4), not a regression; the four
      inner-loop shim test files now pass 18/18 (was 16/16 pre-feature, +1 new test
      from t5's own footprint); the pinned "docs/probes/ carried no prior entries"
      note is a historical fact about that feature's own original validation, not
      independently reproducible today (two prior pack entries now exist and were
      both replayed here). Pack replay — docs/probes/ledger-title-preservation.md:
      every step reproduced exactly as pinned (sentinel prefix survives byte-
      identical; empty-priorText seed case produces the standard title line; the
      live case against this repo's own docs/ledger/ledger.md preserves its title
      line before and after with zero diff; npm test/npm run check corroborate,
      test/ledger.test.js 5/5 green). New exercise (this feature's own sheet,
      executed directly): criterion 1 — `spine models` on a bare fixture resolves
      all ten registered roles, each with model/effort-where-applicable/provenance
      default; a project-layer whole-entry override flips provenance to project with
      the overridden values; a differing local-layer override then wins, provenance
      local, non-carried fields dropped (whole-entry replacement) — all captured
      verbatim. Criterion 2/3 — a fresh shim-driven run of the real
      workflows/inner-loop.js with args.models binding build.complex/derive
      explicitly and leaving plan/validate/build.standard unbound: the complex-tier
      task spawns with model haiku/effort high in both opts and the `[haiku] `
      label; derive spawns with model opus/effort medium in both opts and label; the
      three unbound roles each log the pinned
      "model-selection — role <role> unbound, session-model fallback" line and get
      the `[session] ` label with no model/effort opts; the untiered task logs the
      pinned "model-selection — task <feature>/<task-id> has no tier, routing
      build.standard" line. A separate run binding `plan` explicitly to the literal
      "session" model shows the same `[session] ` label but logs no fallback line —
      confirming the distinct-provenance note. Criterion 4 — `spine plan check` on a
      fixture plan: a valid `tier: standard` task checks clean (0/0); an invalid
      `tier: urgent` produces `ERROR bad-tier` naming the task and exit 1; an absent
      tier produces `warn missing-tier` naming the task and exit 0 (still passing).
      Delta proof, all four criteria, executed against a worktree at the merge-base
      (1813e85, main's pre-merge tip) and compared to the merged tree: `spine models`
      itself doesn't exist pre-merge (usage error, exit 1) vs. the full resolved
      table on the merged tree; the identical shim exercise pre-merge shows plain
      `build:zeta/t1`/`derive:zeta` labels, no `[model]` prefix, no model/effort opts
      beyond derive's old hardcoded `effort: low`, and zero model-selection log lines
      — vs. the fully resolved behavior on the merged tree; `tier: urgent` on the
      pre-merge plan checker passes silently (0 errors, 0 warnings, exit 0 — the
      field is unknown to that validator) vs. `ERROR bad-tier`/exit 1 on the merged
      tree. Every exercise failed to discriminate on the merge-base and passed on the
      merged tree — the diff caused the claimed behavior.
    unobserved: >-
      The live `claude -p "/the-loop"` channel end-to-end (the-loop is not an
      installed plugin in this environment, matching the prior probe pack's own
      recorded limitation) — covers live confirmation of the launch leg's boundary
      relay of `model-selection —` lines (commands/the-loop.md step 6, text-verified
      instead) and of the plan-agent audit spawn / design-skill reader+alternative
      spawn model resolution in actual session-side execution (text-verified
      instead, per the conformance leg's unobserved note).
result: deviation
deviation: >-
  One contract-breaking acceptance-leg finding: test/spine-cli.test.js's pre-existing
  "spine plan remediate ... plan check passes" test asserts `spine plan check`
  output matches /^OK/, but t4's new missing-tier warning (acceptance criterion 4's
  grandfather posture) now prints a warn line before OK for that fixture's untiered
  round-marker task, breaking the match. `npm test` is 119/119 pass, 1 fail,
  reproduced consistently across three runs. Both t4's and t5's completion reports
  already declare this exact regression as an out-of-footprint deviation (the file
  sits in t3's lease, not theirs) and left it red by design rather than touch a file
  outside their declared footprint — a legitimate footprint-discipline call that
  nonetheless leaves the full suite red. All other legs (forensics, conformance,
  runtime) are clean; the runtime leg's replay of the same underlying test failure
  qualifies as a supersession of that pack entry's pinned observation, citing this
  same acceptance criterion, not an independent regression.
menu:
  - fix-in-place — append one task updating test/spine-cli.test.js's stale /^OK/
    assertion (accept the new leading warn line, or stamp the fixture's REMEDIATE_PLAN
    task with a tier so no warning fires), build it on the branch, re-validate
  - waive — merge on human authority, recording the one red pre-existing assertion as
    an accepted transitional gap until a future diff touches test/spine-cli.test.js
  - re-plan — fold test/spine-cli.test.js into a task's footprint at the next Plan
    pass for this feature (or a follow-up feature) rather than a standalone fix task
branch: loop/model-selection
merged: false
exercise:
  - action: "spine models on a bare fixture, then with project then local overrides on build.standard"
    observed: "all ten roles resolve with provenance default; project override → {model: haiku, effort: medium, provenance: project}; local override → {model: opus, provenance: local} (effort dropped, whole-entry replacement)"
  - action: "shim-driven workflows/inner-loop.js run, args.models binding build.complex/derive explicitly, plan/validate/build.standard left unbound, one untiered task"
    observed: "build.complex spawn: model haiku, effort high, label '[haiku] build:zeta/t1'; derive spawn: model opus, effort medium, label '[opus] derive:zeta'; unbound plan/build.standard/validate: label '[session] ...', no model/effort opts, each logs 'model-selection — role <role> unbound, session-model fallback'; untiered t2 logs 'model-selection — task zeta/t2 has no tier, routing build.standard'"
  - action: "shim-driven run with plan bound explicitly to the literal 'session' model"
    observed: "label '[session] plan:eta', no model opt, zero fallback log lines mentioning plan — distinct from the unbound case above"
  - action: "spine plan check against a fixture plan with tier standard, then tier urgent, then no tier"
    observed: "'OK   plan greet-cli: 1 task(s) — 0 error(s), 0 warning(s)' exit 0; 'ERROR bad-tier: tier must be one of rote|standard|complex (got \"urgent\") (t1)' / FAIL, exit 1; 'warn  missing-tier: task has no tier — routes to build.standard downstream (t1)' / OK with 1 warning, exit 0"
  - action: "delta proof — all four exercises above repeated against a worktree at the merge-base (1813e85)"
    observed: "spine models: usage error, exit 1 (command doesn't exist); shim run: plain labels, no model/effort opts beyond derive's old hardcoded effort:low, zero model-selection log lines; tier: urgent plan check: 'OK ... 0 error(s), 0 warning(s)', exit 0 (field unvalidated) — every exercise fails to discriminate pre-merge, passes on the merged tree"
spec_ambiguities: []
waivers: []
```

## Validation — patch_id `116191601b26d859314ce554be0722c89358faa2`

```yaml
feature: model-selection
design_version: 5
patch_id: 116191601b26d859314ce554be0722c89358faa2
readiness:
  rebase: clean
  resolutions: []
  preconditions: { test_harness: ok, probe: ok }
legs:
  forensics:
    verdict: PASS
    findings: []
    evidence: >-
      Five scanner hits, all existing-test-mutation, all dismissed. test/inner-loop-happy.test.js:55,
      test/inner-loop-park.test.js:76, test/inner-loop-remediation.test.js:57 — each rewrite updates a
      pre-existing spawn-label assertion to the new `[<resolved-model>] ` prefix this feature's own
      criterion 2 mandates (e.g. `build:alpha/t1` → `[session] build:alpha/t1`); all three files are
      t5's declared footprint, and inner-loop-happy.test.js additionally gains new assertions (model
      opts, fallback/untiered log lines, build.<tier> routing, a new dedicated test) — strengthened,
      not weakened; confirmed by reading the actual diff. test/plan.test.js:5 — drops one strict
      assert (`assert.deepEqual(r.warnings, [])`) and adds an import plus two new dedicated tests
      ("an absent tier warns without blocking" and "a fully tiered plan checks clean") covering the
      same ground more precisely — t4's own declared footprint exercising its own new `tier` field, no
      coverage lost. test/spine-cli.test.js:178 — replaces a stale `/^OK/` match with a regex
      tolerating leading warn lines while still requiring the OK summary line, pinning criterion 4's
      grandfather posture as observed CLI behavior — t9's declared footprint, its sole stated purpose,
      watched red before green per its own completion report. All five hits map 1:1 to a task's
      declared footprint and its completion report's own stated rationale; none drops assertion
      coverage without a replacement of equal or greater precision.
    unobserved: ""
  conformance:
    verdict: PASS
    findings: []
    evidence: >-
      Spec axis: read every task's diff against the plan's pinned cross-task conventions and the
      expectation sheet, fresh (not relying on prior validation or completion reports as truth).
      src/models.js exports EFFORTS/resolveModels/bindingFor verbatim per the pinned resolver surface,
      touches no fs/process/clock, barrel-exported from src/index.js. config/model-bindings.json ships
      exactly the ten pinned default rows, byte-checked. bin/spine.js's `models` command resolves
      PLUGIN_ROOT from its own file location (read directly), reads project/local layers from cwd
      under "the-loop".modelBindings, treats a missing file/key as an empty layer, names the offending
      file/role on a parse/resolve failure — confirmed live: a bare fixture resolves the real shipped
      table; a project override on build.complex flips it to provenance project; a differing local
      override then wins, provenance local, non-carried fields dropped (whole-entry replacement).
      src/plan.js exports TASK_TIERS, checkTaskTier raises error bad-tier / warning missing-tier
      exactly as pinned — confirmed live: `tier: urgent` → ERROR bad-tier naming the task, FAIL, exit
      1; absent tier → warn missing-tier naming the task, OK, exit 0 (grandfather posture holds).
      appendRemediation stamps tier: standard (read directly in src/plan.js:351). workflows/inner-
      loop.js's roleBinding/modelOpts/modelLabel match the pinned spawn-opts rule and pinned log-line
      text exactly — confirmed live via a fresh shim exercise (not the shipped test suite): a
      build.complex-tier task spawns model haiku/effort high (from a custom args.models fixture) with
      label `[haiku] build:zeta/t1`; an untiered task logs `model-selection — task zeta/t2 has no
      tier, routing build.standard` and falls back to build.standard, itself unbound, logging
      `model-selection — role build.standard unbound, session-model fallback`, label `[session]
      build:zeta/t2`, no model/effort opts; derive resolves its bound model+effort into both opts and
      label; a role explicitly bound to the literal `"session"` model (a second fixture, `plan`)
      shows label `[session] plan:eta` with no model opt and logs no fallback line at all — confirming
      the distinct-provenance behavior (bound-to-session vs. unbound) exactly as pinned.
      commands/the-loop.md, agents/plan.md, skills/design/SKILL.md all carry the pinned instructions
      (models/tier assembly, plan.audit/design.reader/design.alternative resolution) and grep clean
      for "ADR" (verified directly: zero hits in all three). No criterion's claimed surface is
      missing; nothing unclaimed was built (`git diff main...loop/model-selection --stat` lists
      exactly the nine tasks' declared footprints, no more). test/models.test.js (5 tests) and
      test/spine-cli.test.js's three new `models` tests were read directly and match the pinned
      coverage claims (default table shape, three-layer merge with provenance, malformed-entry
      rejection, via pass-through). docs/research/2026-07-03-workflow-spawn-opts-precedence.md (t1)
      states the question, seven attempted channels, the "no channel here can observe it" conclusion,
      and the standing-consequence section — matches its acceptance criteria verbatim. Standards axis:
      docs/standards/pure-core-thin-cli.md (t2/t3/t4) — src/models.js and src/plan.js stay pure, all
      fs/process access sits in bin/spine.js, confirmed by reading every import in both files.
      docs/standards/loop-surfaces.md (t6/t7/t8) — all three surfaces self-contained, no ADR
      references, written for a zero-context agent. No baseline-catalog smells found: workflows/
      inner-loop.js's three new helpers (roleBinding, modelOpts, modelLabel) are each one job, no
      duplicated lookup logic across the four spawn call sites, file sits at 333 lines (`wc -l`),
      inside its 350-line lint budget. `npm run lint` and `npm run check` both zero-finding clean.
    unobserved: >-
      Live execution of the plan agent's audit-spawn model resolution (agents/plan.md) and the
      design skill's reader/alternative spawn resolution (skills/design/SKILL.md) — both session-side
      surfaces with no test coverage (grep across test/ for agents/ and skills/ references: zero
      hits) and the live `claude -p "/the-loop"` channel is unrunnable in this installation ("Unknown
      command: /the-loop" — the-loop is not an installed plugin here, matching the runtime leg's own
      observation below). Text-level instruction correctness was confirmed by direct reading instead.
  acceptance:
    verdict: FAIL
    findings:
      - severity: contract-breaking
        cites: >-
          artifact-spine feature acceptance — "a feature node + its contracts resolve by id;
          design.md round-trips through parse/render" (test/design-md.test.js's own header: "the
          dogfood: the artifact spine parses, validates, round-trips, and resolves the very document
          that specifies it" — the structural-integrity canary for that criterion)
        location: test/design-md.test.js:16
        observation: >-
          `npm test` fails: "the real design.md parses to the full feature graph" asserts
          `m.designVersion === 5`, but docs/design/design.md's current designVersion is 6 — bumped by
          commit 01c6a10 ("surfacing: design finalized by grilling — ADR-0032 typed resolution kinds
          + mechanical fold-back (design_version 5→6)"), which landed on `main` after
          model-selection's branch was cut and is entirely unrelated to and untouched by any of this
          diff's nine tasks (confirmed: `git diff main...loop/model-selection --stat` touches neither
          docs/design/design.md nor test/design-md.test.js). Delta-proof: checking out `main`'s tip
          (01c6a10) in isolation, with none of model-selection's commits applied, reproduces the
          identical failure (`6 !== 5`, `AssertionError`); checking out the commit immediately
          preceding the "surfacing" design-finalize commit (149de72, the actual merge-base before
          this feature's rebase) passes clean (7/7). Reproduced 3 times total (once in the full
          suite, twice standalone), consistently red, not flaky. `npm test`: 119/120 pass (this is
          the sole failure). `npm run check`: "OK   25 features, 11 contracts — 0 error(s), 0
          warning(s)" — design.md itself is structurally valid; only this hardcoded test-file
          constant is stale.
        reobserve: "node --test test/design-md.test.js"
    evidence: >-
      `npm test`: 119 pass / 1 fail (the single finding above), reproduced identically across all
      checkouts tried. `npm run lint` and `npm run check`: both zero-finding clean. This is the only
      acceptance-leg finding; the deviation this feature's prior validation recorded (t4/t5's
      test/spine-cli.test.js regression) is confirmed fixed by t9 — the same test now passes (7/7 in
      test/spine-cli.test.js, verified directly), and the new regex tolerates the grandfather
      posture's warn line while still requiring the OK summary line.
    unobserved: ""
  runtime:
    verdict: FAIL
    findings:
      - severity: contract-breaking
        cites: >-
          docs/probes/inner-loop-workflow.md "deterministic channel — npm test" pinned expectation
          ("full suite green...") and docs/probes/ledger-title-preservation.md "deterministic
          corroboration" pinned expectation ("full suite green (0 fail)...")
        location: test/design-md.test.js:16
        observation: >-
          Identical root cause as the acceptance-leg finding above (not a second, independently
          introduced regression): replaying both existing probe-pack entries' "npm test" steps
          reproduces the same 119/120-pass, 1-fail result, breaking each entry's pinned "full suite
          green" observation. No clause of model-selection's own contract names or supersedes this
          change (nothing in this feature's four acceptance criteria concerns design.md's parsed
          version or feature count), so the supersession exception does not apply here the way it did
          for this feature's own prior-validation acceptance-criterion-4 regression. Consistently red
          across three reproductions, not flaky.
        reobserve: "node --test test/design-md.test.js"
    evidence: >-
      Fixture-repo probe brought up clean (`node bin/probe-fixture.js populated` → a temp git repo,
      clean tree, two-feature graph). Pack replay, oldest first — docs/probes/inner-loop-workflow.md:
      bring-up matches; `claude -p "/the-loop"` unrunnable in this installation ("Unknown command:
      /the-loop", matching the pinned prior observation); `npm run check` matches ("OK   25 features,
      11 contracts — 0 error(s), 0 warning(s)", counts drift as pinned); `npm test` full-suite-green
      pinned observation fails per the finding above; the four inner-loop shim test files pass 18/18
      directly (matching t5's own completion report, up from the pack's originally-pinned 16/16); the
      delta-proof step's literal historical claim ("'Could not find' the test files... pre-merge")
      is, like the prior validation's note on this same pack entry, a historical fact about that
      feature's own original merge event, not independently reproducible today (those files have
      existed on `main` since inner-loop-workflow's own squash-merge) — noted, not scored as a
      regression. Pack replay — docs/probes/ledger-title-preservation.md: every ledger-specific step
      reproduced exactly as pinned (sentinel prefix survives byte-identical through a fresh render;
      an empty-priorText seed produces the standard title line; the live case against this repo's
      own docs/ledger/ledger.md preserves its title line before and after with an empty `git diff`;
      test/ledger.test.js 5/5 green) — only the "full suite green (0 fail)" corroboration line is
      red, per the same finding above. New exercise (this feature's own sheet, executed directly,
      independent of the completion reports): criterion 1 — `spine models` on a bare fixture resolves
      all ten registered roles, each with model/effort-where-applicable/provenance default; writing a
      project-layer override for `build.complex` (haiku/medium) flips its provenance to project,
      other roles untouched; adding a differing local-layer override (`opus3`, no effort) then wins,
      provenance local, effort dropped (whole-entry replacement) — captured verbatim above. Criterion
      2/3 — a fresh shim-driven run of the real workflows/inner-loop.js (via test/workflow-shim.js,
      not the shipped test files) with a custom args.models binding build.complex/derive explicitly
      and leaving plan/build.standard/validate unbound: the complex-tier task spawns model
      haiku/effort high, label `[haiku] build:zeta/t1`; the untiered task logs the pinned
      untiered-task line and falls back to build.standard, itself unbound, logging the pinned
      unbound-role line, label `[session] build:zeta/t2`; derive spawns model opus/effort medium in
      both opts and label. A second fixture binds `plan` explicitly to the literal `"session"` model:
      label `[session] plan:eta`, no model opt, and — distinctly — no fallback log line at all
      (bound-to-session is not the same as unbound). Criterion 4 — `spine plan check` on a fixture
      plan: `tier: standard` checks clean (0/0, exit 0); `tier: urgent` produces `ERROR bad-tier`
      naming the task, FAIL, exit 1; absent tier produces `warn missing-tier` naming the task, OK
      with 1 warning, exit 0 (still passing — the grandfather posture holds). Delta proof, all four
      criteria, executed against a worktree at the merge-base (01c6a10, main's tip before this
      feature's rebase) and compared to the merged (rebased-branch) tree: `spine models` doesn't
      exist pre-merge (usage error, exit 1) vs. the full resolved table on the merged tree; the
      identical shim exercise pre-merge shows plain `build:zeta/t1`/`derive:zeta` labels, no
      `[model]` prefix, no model/effort opts beyond derive's old hardcoded `effort: 'low'`, and zero
      model-selection log lines — vs. the fully resolved behavior on the merged tree; `tier: urgent`
      on the pre-merge plan checker passes silently (0 errors, 0 warnings, exit 0 — the field is
      unknown to that validator) vs. `ERROR bad-tier`/exit 1 on the merged tree. Every new-exercise
      criterion failed to discriminate on the merge-base and passed on the merged tree — this diff
      caused the claimed behavior. Worktree removed after use.
    unobserved: >-
      The live `claude -p "/the-loop"` channel end-to-end (the-loop is not an installed plugin in
      this environment, matching both prior probes' own recorded limitation) — covers live
      confirmation of the launch leg's boundary relay of `model-selection —` lines
      (commands/the-loop.md step 6, text-verified instead) and of the plan-agent audit spawn /
      design-skill reader+alternative spawn model resolution in actual session-side execution
      (text-verified instead, per the conformance leg's unobserved note).
result: deviation
deviation: >-
  One contract-breaking acceptance-leg finding, and its identical propagation into the runtime leg's
  pack replay: test/design-md.test.js's "the real design.md parses to the full feature graph" test
  asserts docs/design/design.md's parsed designVersion equals 5, but main's tip (01c6a10, "surfacing:
  design finalized by grilling — ADR-0032... design_version 5→6") already bumped it to 6 before
  model-selection's branch was rebased onto it — a change entirely unrelated to and untouched by any
  of this diff's nine tasks. Delta-proof confirms causation lies elsewhere: main's tip in isolation
  (01c6a10, without model-selection's changes) reproduces the identical failure; the commit
  immediately preceding the "surfacing" design-finalize commit (149de72) passes clean. Reproduced 3
  times, consistently red, not flaky. The same underlying failure also breaks the "full suite green"
  pinned observation replayed from two existing probe-pack entries (docs/probes/inner-loop-
  workflow.md and docs/probes/ledger-title-preservation.md), recorded as its own runtime-leg finding
  since no clause of model-selection's own contract supersedes it. All other legs are clean:
  forensics found zero confirmed hits (five dismissed, each matching a declared task footprint);
  conformance found zero findings on either axis, with every criterion independently re-exercised
  live (not taken on the completion reports' word) — the resolver, CLI, tier validation, workflow
  plumbing, and all three session-side surface instructions match the plan's pinned conventions
  exactly, and the prior validation's own deviation (t4/t5's test/spine-cli.test.js regression) is
  confirmed fixed by t9. Every one of model-selection's own four acceptance criteria was
  independently exercised against a fresh fixture and delta-proved against the merge-base, all
  passing cleanly.
menu:
  - fix-in-place — append a task (to model-selection's plan, or a small standalone maintenance
    commit) updating test/design-md.test.js's hardcoded designVersion/feature-count assertions to
    match the current graph (owned by the already-landed "surfacing" feature's drift, not
    model-selection's own diff), then re-validate
  - waive — merge model-selection on human authority, recording the pre-existing, unrelated
    test/design-md.test.js regression (caused by the already-landed "surfacing" design-finalize
    bump, confirmed via delta-proof to be independent of this diff) as an accepted transitional gap
    until a separate commit updates the hardcoded assertion
  - re-plan — route the test/design-md.test.js fix into whichever feature/maintenance track owns
    docs/design/design.md's version-drift bookkeeping (not model-selection), and re-validate
    model-selection once `main`'s test suite is green again
branch: loop/model-selection
merged: false
exercise:
  - action: "spine models on a bare fixture, then with project then local overrides on build.complex"
    observed: "all ten roles resolve with provenance default; project override → {model: haiku, effort: medium, provenance: project}; local override → {model: opus3, provenance: local} (effort dropped, whole-entry replacement)"
  - action: "shim-driven workflows/inner-loop.js run (test/workflow-shim.js), args.models binding build.complex/derive explicitly, plan/build.standard/validate left unbound, one complex-tier task and one untiered task"
    observed: "build.complex spawn: model haiku, effort high, label '[haiku] build:zeta/t1'; derive spawn: model opus, effort medium, label '[opus] derive:zeta'; unbound build.standard/validate: label '[session] ...', no model/effort opts, each logs 'model-selection — role <role> unbound, session-model fallback'; untiered t2 logs 'model-selection — task zeta/t2 has no tier, routing build.standard'"
  - action: "shim-driven run with plan bound explicitly to the literal 'session' model"
    observed: "label '[session] plan:eta', no model opt, zero fallback log lines mentioning plan — distinct from the unbound case above"
  - action: "spine plan check against a fixture plan with tier standard, then tier urgent, then no tier"
    observed: "'OK   plan greet-cli: 1 task(s) — 0 error(s), 0 warning(s)' exit 0; 'ERROR bad-tier: tier must be one of rote|standard|complex (got \"urgent\") (t1)' / FAIL, exit 1; 'warn  missing-tier: task has no tier — routes to build.standard downstream (t1)' / OK with 1 warning, exit 0"
  - action: "delta proof — all four exercises above repeated against a worktree at the merge-base (01c6a10, main's tip before this feature's rebase)"
    observed: "spine models: usage error, exit 1 (command doesn't exist); shim run: plain labels, no model/effort opts beyond derive's old hardcoded effort:low, zero model-selection log lines; tier: urgent plan check: 'OK ... 0 error(s), 0 warning(s)', exit 0 (field unvalidated) — every exercise fails to discriminate pre-merge, passes on the merged tree"
  - action: "full-tree acceptance: npm test, npm run lint, npm run check on the rebased branch"
    observed: "npm test 119/120 pass (test/design-md.test.js fails 6 !== 5); npm run lint clean; npm run check 'OK   25 features, 11 contracts — 0 error(s), 0 warning(s)'"
  - action: "isolate the design-md.test.js failure's cause — checkout main's tip (01c6a10) alone, then the pre-surfacing-finalize commit (149de72) alone"
    observed: "01c6a10 alone: 6/7 pass, same failure (6 !== 5); 149de72 alone: 7/7 pass — the failure is introduced by the 'surfacing' feature's design-finalize commit, unrelated to and predating model-selection's own diff"
spec_ambiguities: []
waivers: []
```

## Resolution — patch_id `116191601b26d859314ce554be0722c89358faa2` (human authority)

Not a verdict and not a waiver — no obligation is excused. The deviation entry
above (this same patch_id) carried exactly one contract-breaking finding:
`test/design-md.test.js`'s stale `designVersion == 5` pin, delta-proved to
belong to the surfacing design-finalize commit (`01c6a10`), not to any of this
feature's nine tasks. That finding was fixed by a main-side maintenance commit,
after which re-validation could never re-judge this diff: the branch diff is
byte-identical to the already-judged entry, so `spine validate scan` returned
`dedup: true` and the run booked nothing (run `wf_9efd8be6`). The systemic fix
is surfacing's retry-despite-dedup resolution kind (ADR-0032); this record is
its bootstrap-era hand bridge.

The merge rests on run `wf_97851563` (pass 4): readiness clean (zero-conflict
rebase), forensics PASS (5 hits triaged, all declared footprints), conformance
PASS (every pinned convention verbatim, zero standards findings), acceptance
PASS (120/120 twice), runtime PASS (probe-pack replay + all four criteria
exercised live and delta-proved against the merge-base) — a would-be-perfect
verdict blocked only by a concurrent worktree holding `main`, then never
re-bookable through the dedup rule.

```yaml
resolution: human-merge
patch_id: 116191601b26d859314ce554be0722c89358faa2
approver: Jackson Atassi (session directive, 2026-07-03)
evidence: [run wf_97851563 four-leg would-be-perfect, run wf_afab57bd delta-proof isolating the finding to 01c6a10, run wf_9efd8be6 dedup + 120/120 preconditions]
design_version: 6
```
