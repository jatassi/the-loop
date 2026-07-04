# Escalation — model-selection (parked at validate)

The independent validator judged the built feature `deviation` (validations entry
`116191601b26d859314ce554be0722c89358faa2`, 2026-07-03): readiness clean, forensics
and conformance both PASS on a fresh, independent re-exercise of every task (not
taken on the completion reports' word) — the resolver, CLI, tier validation,
workflow plumbing, and all three session-side surface instructions match the plan's
pinned conventions exactly, and the prior deviation on this feature (t4/t5's
`test/spine-cli.test.js` regression) is confirmed fixed by t9.

**The full test suite is not green, for a reason unrelated to this diff.**
`test/design-md.test.js`'s "the real design.md parses to the full feature graph"
test asserts `docs/design/design.md`'s parsed `designVersion` equals 5, but `main`'s
tip (`01c6a10`, "surfacing: design finalized by grilling — ADR-0032 typed
resolution kinds + mechanical fold-back (design_version 5→6)") already bumped
`design_version` to 6 before this feature's branch was rebased onto it — a change
untouched by, and unrelated to, any of model-selection's nine tasks (confirmed:
`git diff main...loop/model-selection --stat` touches neither
`docs/design/design.md` nor `test/design-md.test.js`). Delta-proof pins the cause
precisely: checking out `main`'s tip (`01c6a10`) in isolation, with none of
model-selection's commits applied, reproduces the identical failure; the commit
immediately preceding the "surfacing" design-finalize commit (`149de72`) passes
clean. Reproduced 3 times, consistently red, not flaky. `npm test` is 119/120
pass, 1 fail; `npm run check` is clean ("OK 25 features, 11 contracts — 0
error(s), 0 warning(s)") — `design.md` itself is structurally valid, only the
hardcoded test-file constant is stale. The same underlying failure also breaks the
"full suite green" pinned observation replayed from two existing probe-pack
entries (`docs/probes/inner-loop-workflow.md` and
`docs/probes/ledger-title-preservation.md`), recorded as its own runtime-leg
finding since no clause of model-selection's own contract supersedes it (the
design_version bump is not a behavior this feature's contract names).

Every one of model-selection's own four acceptance criteria was independently
exercised against a fresh fixture, and delta-proved against the merge-base
(`01c6a10`): the resolver merges default/project/local layers with per-role
provenance and whole-entry replacement; workflow spawns carry the resolved
model/effort into opts and labels, with a distinct unbound-fallback log line versus
an explicit `session` binding; `spine plan check` enforces the `tier` enum while
grandfathering untiered legacy tasks with a warning; build spawns route through
`build.<tier>` exactly as bound. All four criteria failed to discriminate on the
merge-base and passed on the merged tree.

## Escalation

```yaml
feature: model-selection
phase: validate
kind: feature
deviation: >-
  One contract-breaking acceptance-leg finding, and its identical propagation into
  the runtime leg's pack replay: test/design-md.test.js's "the real design.md
  parses to the full feature graph" test asserts docs/design/design.md's parsed
  designVersion equals 5, but main's tip (01c6a10, "surfacing: design finalized by
  grilling — ADR-0032... design_version 5→6") already bumped it to 6 before
  model-selection's branch was rebased onto it — a change entirely unrelated to
  and untouched by any of this diff's nine tasks. Delta-proof confirms causation
  lies elsewhere: main's tip in isolation (01c6a10, without model-selection's
  changes) reproduces the identical failure; the commit immediately preceding the
  "surfacing" design-finalize commit (149de72) passes clean. Reproduced 3 times,
  consistently red, not flaky. The same underlying failure also breaks the "full
  suite green" pinned observation replayed from two existing probe-pack entries
  (docs/probes/inner-loop-workflow.md and docs/probes/ledger-title-preservation.md),
  recorded as its own runtime-leg finding since no clause of model-selection's own
  contract supersedes it. All other legs are clean: forensics found zero confirmed
  hits (five dismissed, each matching a declared task footprint); conformance found
  zero findings on either axis, with every criterion independently re-exercised
  live.
menu:
  - fix-in-place — append a task (to model-selection's plan, or a small standalone
    maintenance commit) updating test/design-md.test.js's hardcoded
    designVersion/feature-count assertions to match the current graph (owned by
    the already-landed "surfacing" feature's drift, not model-selection's own
    diff), then re-validate
  - waive — merge on human authority, recording the pre-existing, unrelated
    test/design-md.test.js regression (caused by the already-landed "surfacing"
    design-finalize bump, confirmed via delta-proof to be independent of this
    diff) as an accepted transitional gap until a separate commit updates the
    hardcoded assertion
  - re-plan — route the test/design-md.test.js fix into whichever feature/
    maintenance track owns docs/design/design.md's version-drift bookkeeping (not
    model-selection), and re-validate model-selection once main's test suite is
    green again
branch: loop/model-selection
```
