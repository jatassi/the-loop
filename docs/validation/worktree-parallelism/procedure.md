# validation runbook — worktree-parallelism

Binding used: the fixture-repo runbook (`bin/create-sample-repo.js`) for criterion 1;
a hand-driven two-branch git fixture (the same shape
`test/test-gated-merge-policy.test.js` automates) for criterion 3, exercised twice
independently — once as shown by the suite, once again by hand outside any test
runner, to rule out a gamed test.

## Criterion 1 — unordered footprint sharing passes plan check clean

**Bring up**

```
node bin/create-sample-repo.js
# -> /var/folders/.../loop-probe-ycjhzj  (feature-graph.md: greet-core validated, greet-cli designed)
```

**Exercise**

Wrote `docs/plans/greet-cli/plan.md` into the fixture with two unordered tasks
(`t1`, `t2`, `depends_on: []` on both) that both list `bin/greet.js` in `footprint`.

```
cd <fixture>
node <old-taming-worktree>/bin/the-loop.js plan check greet-cli
# ERROR unordered-overlap: tasks share files (bin/greet.js) ... ; FAIL; exit 1

node <integration-worktree>/bin/the-loop.js plan check greet-cli
# OK   plan greet-cli: 2 task(s) — 0 error(s), 2 warning(s); exit 0
```

**Expected observation**

The same plan file that a pre-merge `the-loop` refuses (`unordered-overlap`, exit 1)
lints clean on the merged tree (exit 0, only the unrelated `missing-judgment-level`
warnings). Observed exactly this — confirms the rule was actually deleted, not just
untested.

**Teardown**

```
rm -rf /var/folders/.../loop-probe-ycjhzj
```

## Criterion 3 — two-branch fixture: composable lands both edits green, non-composable is blocked naming the path

**Bring up**

Two from-scratch git repos in scratch space, each seeded with a `main` carrying
`lib/registry.js` + a base test, then two branches (`task-a`, `task-b`) each
rewriting the same line of `lib/registry.js` and adding their own test:

- fixture A: `alpha: 1,` vs `beta: 2,` (composable — additive, non-contradictory)
- fixture B: `value: 'x',` vs `value: 'y',` (non-composable — same field,
  contradictory values)

**Exercise**

Fixture A: `git checkout task-a && git merge --no-commit --no-ff task-b` ->
real `CONFLICT (content): Merge conflict in lib/registry.js` (exit 1). Wrote the
composed resolution `{ alpha: 1, beta: 2 }`, staged it, ran
`node --test test/base.test.js test/a.test.js test/b.test.js` from the outside —
all 3 pass (alpha lands, beta lands, base sanity), exit 0.

Fixture B: same merge shape, real conflict on `lib/registry.js`. Wrote the single
best candidate resolution (`task-a`'s own value, `'x'`), staged it, ran the same
three-file suite: `b.test.js` fails for real
(`AssertionError: 'x' !== 'y'`, actual/expected shown). Per the test-gated merge
policy this is a semantic conflict — ran `git merge --abort`; `git status
--porcelain` came back empty (no partial state) and `lib/registry.js` reverted to
`task-a`'s own content.

**Expected observation**

Composable case: both sides' tests ride the merged tree and go green together —
matches `test/test-gated-merge-policy.test.js`'s "composed" outcome. Non-composable
case: suite genuinely stays red on the best available single-file resolution, so
the recipe correctly refuses to compose and would return
`{ result: 'blocked', kind: 'feature', detail: '... lib/registry.js' }` — matches
the shipped test's "blocked" outcome. Both observed exactly as expected, by hand,
independent of the shipped `test/test-gated-merge-policy.test.js` (which was also
run as part of the full suite and passed).

**Teardown**

```
rm -rf <scratch>/manual-fixture <scratch>/manual-fixture2
```

## Criterion 2 — no loop surface promises conflict-free merges

Not a validation-runbook criterion (text/behavior-of-instructions, not
CLI-observable). Verified by reading `agents/build.md`, `agents/validate.md`,
`workflows/execution-pipeline.js` end to end and by grepping the whole tree for
"conflict" outside `docs/` — only those three files mention it, and each now
states the test-gated merge policy (resolve only when both intents are served,
prove via the merged suite, else blocked naming the paths) rather than a
conflict-free promise. `test/merge-posture.test.js` pins the retired phrases are
gone and the new phrases
are present; ran as part of the suite and passed.

## Environment-block accounting (fix-environment-halt-accounting regression)

Documents the fix's two-feature environment-block regression — not a numbered
acceptance criterion of worktree-parallelism itself. Confirms that an
environment-shaped block stalls only its feature while a mid-flight sibling
completes, and that every in-scope feature lands in a summary bucket.

**Bring up**

A checkout of the-loop with the fix on the branch (or merged tree). No fixture
repo required — the harness repro runs against the shipped script.

**Exercise**

```
node --test test/execution-pipeline-halt.test.js
```

In particular the case "an environment block on one feature stalls it while a
mid-flight sibling still completes": scripts `pfeat` and `mfeat` (small-path);
`build:pfeat/feature` returns `blocked/kind=environment` with a detail string;
`build:mfeat/feature` returns `built` via a ~50 ms delayed Promise (mfeat mid-flight
when the block lands); `validate:mfeat` returns `validated`.

**Expected observation**

Summary accounts for both features: `pfeat` in `stalled` carrying the block detail
as `note`, `mfeat` in `completed` (spawn log includes `validate:mfeat`), `halted`
absent. The single-feature inverse also holds: environment block → feature in
`stalled`, run not halted.

**Teardown**

None — harness leaves no fixture or worktree.
