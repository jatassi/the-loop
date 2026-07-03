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
