# Plan — workflow-phase-grouping

The /workflows progress tree currently groups spawns per feature — `opts.phase`
carries the feature id — leaving the SDLC phases invisible as structure. This
feature flips the grouping: every spawn's `phase` opt becomes its coarse SDLC phase
(`Plan` | `Build` | `Validate`; build and drive under Build, derive and validate
under Validate), `meta` declares the three phases as title-only entries on its
pinned single line, and the feature id rides the label as the sole disambiguator.
Alongside it, the BoundaryResult `stalled` entry's `phase` field — the one place
`phase` mis-named an agentType — renames to `agent`, and the two human-facing
surfaces that describe stalled entries rename the field with it.

## Decomposition — two renames, one proof-strengthening, one pin, one doc pass

The touch set was enumerated at design time and verified against the repo during
planning; every site is named in the task contracts below. The design-time bookings
already landed and no task re-edits them: the `boundary-result` contract in
`docs/design/design.md` already reads `{ feature-id, agent, note }` (design_version
7→8), the Dictionary's stall entry already says `agent`, and ADR-0029 carries the
amendment. `src/ledger.js` never sees the stalled field — the relay reduces stalled
entries to feature ids before `ledger append-run` — so it stays untouched.
`test/workflow-shim.test.js`'s own fixture scripts keep their arbitrary phase
strings (generic shim mechanics, out of scope per the slice).

The two renames both live in `workflows/inner-loop.js` plus overlapping test files,
so they are chained, each leaving the suite green:

- **t1 — stalled `phase` → `agent`.** The four stall literals in the script (the
  two `spawn()` stall sites and the two synthetic stalls) plus the five test
  expectations that assert them. Orthogonal to the grouping flip and unlocks the
  doc pass (t5).
- **t2 — coarse phase opts + `meta.phases` + assertion flips.** The five spawn
  sites' `phase` values, the meta line's new `phases` key (staying one physical
  line — the eslint preprocessor rewrites that line to end-of-line and appends
  `void meta`, so a multi-line meta breaks its parse), and the seven `opts.phase`
  assertions flipped to the coarse sequences. Chained after t1 (shared
  `workflows/inner-loop.js` and `test/inner-loop-halt.test.js`).
- **t3 — label-map assertions.** The per-feature phase maps t2 flips used to carry
  feature attribution (the park/halt paths' "beta/delta never spawns"). Those
  proofs now ride labels: each flipped phase-map deepEqual gets a paired,
  added-never-substituted label-map deepEqual pinning the full expected label
  list. Chained after t2 (same test files).
- **t4 — source-shape meta test.** A new, disjoint test file extracts and evaluates
  the meta line, pinning `phases` as the three title-only objects in order and the
  single-line declaration shape. Depends on t2 (the key must exist to pin).
- **t5 — surfaces.** The relay triple in `commands/the-loop.md` and the docket
  triple in `skills/adjust/SKILL.md` rename `phase` → `agent` for stalled entries.
  The escalation-record `phase` field elsewhere in adjust's skill is untouched —
  it names an SDLC phase (where a park happened), which is exactly what `phase`
  now consistently means. Depends on t1 so the docs never describe a field the
  script doesn't yet emit.

No task needed the `m` ceiling. Coverage: criterion 1 → t2 (phase-opt naming) and
t3 (feature id + resolved model riding the label, made observable); criterion 2 →
t2 (meta + coarse shim assertions) and t4 (the source-shape pin); criterion 3 → t1
(script + BoundaryResult assertions) and t5 (relay and adjust surfaces).

**Label calibration for t3.** Label shape is
`[<resolved-model>] <agentType>:<feature>[/<task>]` (drive labels append
` via <via>/<executor-model>`); fixtures with no `models` table resolve every role
to the `[session] ` prefix, and the happy-path fixture binds derive to opus (so its
derive labels read `[opus] derive:<feature>`). Worked example — the halt suite's
env-block drain test spawns plan:alpha, build:alpha/alpha1, derive:alpha,
validate:alpha, plan:beta, plan:gamma, build:gamma/g1 (its `perfectRun` helper
names tasks `<id>1`), so the expected label map is those seven strings prefixed
`[session] `, and `delta` appears in none of them.

**Fresh-context audit: skipped.** One interface contract, no dependents on this
feature in the graph, and the slice enumerated the touch set line-by-line; every
footprint below was verified against the working tree by grep during planning.

## Tasks

```yaml
feature: workflow-phase-grouping
design_version: 8
tasks:
  - id: t1
    title: Rename the BoundaryResult stalled field phase → agent in the workflow script and its stall assertions
    status: built
    covers: [3]
    acceptance:
      - "workflows/inner-loop.js's four stalled literals carry `agent` in place of `phase`, values unchanged: spawn()'s thrown-non-budget-error site and its null-return site each carry `agent: opts.agentType`; runBuild's missing-task-list stall carries `agent: 'plan'`; runRemediation's second-remediation-pending stall carries `agent: 'validate'`; no stalled record anywhere in the file carries a `phase` key"
      - "the five stalled expectations flip to the same field with their prior values kept: test/inner-loop-halt.test.js's impostor-budget stall, its null-return + ordinary-throw pair, and its missing-task-summaries stall (including the `result.stalled[0].phase` property read, which becomes `.agent`), plus test/inner-loop-remediation.test.js's protocol-violation stall, each assert `agent: 'plan'` or `agent: 'validate'` exactly where they asserted `phase` before"
      - "the spawn opts' own `phase` field (currently the feature id) is untouched by this task"
      - "npm test and npx eslint . both pass"
    injects: [boundary-result]
    standards: []
    footprint: [workflows/inner-loop.js, test/inner-loop-halt.test.js, test/inner-loop-remediation.test.js]
    size: s
    tier: standard
    depends_on: []
    report:
      result: built
      footprint_actual:
        - workflows/inner-loop.js
        - test/inner-loop-halt.test.js
        - test/inner-loop-remediation.test.js
      diff_actual:
        files: 3
        insertions: 9
        deletions: 9
      deviations:
        - pre-existing, unrelated failure in test/design-md.test.js (design_version 8 vs pinned 7) reproduces identically with this task's changes stashed out — not touched by this footprint, left red per protocol
      summary: "workflows/inner-loop.js's four stalled literals now carry `agent` in place of `phase` with values unchanged: spawn()'s thrown-non-budget-error site and its null-return site each carry `agent: opts.agentType`, runBuild's missing-task-list stall carries `agent: 'plan'`, and runRemediation's second-remediation-pending stall carries `agent: 'validate'` — grep confirms no stalled record in the file still carries a `phase` key. The five matching test expectations flipped alongside: test/inner-loop-halt.test.js's impostor-budget stall, its null-return + ordinary-throw pair, and its missing-task-summaries stall (including the `result.stalled[0].phase` read, now `.agent`), plus test/inner-loop-remediation.test.js's protocol-violation stall, each now assert `agent: 'plan'` or `agent: 'validate'` where they asserted `phase` before. The spawn opts' own `phase` field (the feature id) was left untouched, verified by grep and by the still-passing opts.phase assertions. Each rename was proven test-driven: the test file was flipped first (watched red against the still-phase-keyed source), then the corresponding script literal was renamed (watched green). npm test passes except one pre-existing, out-of-footprint failure (test/design-md.test.js's design_version pin), and npx eslint . is clean."
  - id: t2
    title: Spawn phase opts carry coarse SDLC names, meta declares phases, phase assertions flip to the coarse sequences
    status: built
    covers: [1, 2]
    acceptance:
      - "every spawn site's `phase` opt names its SDLC phase and nothing else: the plan spawn carries 'Plan'; the ordinary build spawn and the drive spawn carry 'Build'; the derive spawn and the validate spawn carry 'Validate'; no spawn's `phase` opt carries a feature id, and every spawn's label, prompt, schema, agentType, and model/effort opts are unchanged from before this task"
      - "the meta object gains `phases: [{ title: 'Plan' }, { title: 'Build' }, { title: 'Validate' }]` — title-only objects, exactly that order, no other keys per entry — and the `export const meta = { … };` declaration remains a single physical line ending in `;`"
      - "the seven opts.phase assertions flip to coarse strings by the mapping plan→'Plan', build→'Build', drive→'Build', derive→'Validate', validate→'Validate' applied to each fixture's spawn order: the one map deepEqual in test/inner-loop-happy.test.js, the two in test/inner-loop-halt.test.js, the three in test/inner-loop-park.test.js, and test/inner-loop-drive.test.js's single phase equality now expecting 'Build'"
      - "npm test and npx eslint . both pass"
    injects: []
    standards: []
    footprint: [workflows/inner-loop.js, test/inner-loop-happy.test.js, test/inner-loop-halt.test.js, test/inner-loop-park.test.js, test/inner-loop-drive.test.js]
    size: s
    tier: standard
    depends_on: [t1]
    report:
      result: built
      footprint_actual:
        - workflows/inner-loop.js
        - test/inner-loop-happy.test.js
        - test/inner-loop-halt.test.js
        - test/inner-loop-park.test.js
        - test/inner-loop-drive.test.js
      diff_actual:
        files: 5
        insertions: 13
        deletions: 13
      deviations:
        - pre-existing, unrelated failure in test/design-md.test.js (design_version 8 vs pinned 7) reproduces identically with this task's changes stashed out — not touched by this footprint, left red per protocol
      summary: "workflows/inner-loop.js's five spawn sites now carry coarse SDLC phase names in place of the feature id: runPlan's plan spawn carries 'Plan'; runBuild's ordinary build spawn and spawnDrive's drive spawn each carry 'Build'; runValidationCycle's derive spawn and runValidate's validate spawn each carry 'Validate' — grep confirms no spawn site still reads phase: featureId, and every spawn's label, prompt, schema, agentType, and model/effort opts are byte-identical to before this task. The meta object gained phases: [{ title: 'Plan' }, { title: 'Build' }, { title: 'Validate' }] appended to its existing keys, with the export const meta = { ... }; declaration still one physical line ending in ;, verified by grep. The seven opts.phase assertions across the four test files flipped from per-feature strings to the coarse mapping (plan→'Plan', build→'Build', drive→'Build', derive→'Validate', validate→'Validate') applied to each fixture's own spawn order: the one map deepEqual in test/inner-loop-happy.test.js, the two in test/inner-loop-halt.test.js, the three in test/inner-loop-park.test.js, and test/inner-loop-drive.test.js's single phase equality (now 'Build'). Each flip was watched red first (the test files were edited before the source, confirmed failing against the still-per-feature-id script), then the five source literals were changed and the suite watched green. npm test passes 231/232 (the one failure is the pre-existing, out-of-footprint design_version pin noted in t1's own report, reproducing identically), and npx eslint . is clean."
  - id: t3
    title: Label-map assertions carry the feature-attribution proofs the per-feature phase maps used to hold
    status: built
    covers: [1]
    acceptance:
      - "each of the six coarse phase-map deepEquals (one in test/inner-loop-happy.test.js, two in test/inner-loop-halt.test.js, three in test/inner-loop-park.test.js) is paired with an added deepEqual over `spawns.map((s) => s.opts.label)` pinning that fixture's full expected label list — so each label carries the feature id (and task id where one rides) plus the `[<resolved-model>]` prefix, and the drain/halt proofs (the excluded feature never appears in any label) are observable"
      - "no existing assertion is removed or substituted — the label maps are additions alongside the flipped phase maps, and every previously present label assertion stays byte-identical"
      - "npm test and npx eslint . both pass"
    injects: []
    standards: []
    footprint: [test/inner-loop-happy.test.js, test/inner-loop-halt.test.js, test/inner-loop-park.test.js]
    size: xs
    tier: standard
    depends_on: [t2]
    report:
      result: built
      footprint_actual:
        - test/inner-loop-halt.test.js
        - test/inner-loop-happy.test.js
        - test/inner-loop-park.test.js
      diff_actual:
        files: 3
        insertions: 47
        deletions: 0
      deviations:
        - pre-existing, unrelated failure in test/design-md.test.js (design_version 8 vs pinned 7) reproduces identically with this task's changes stashed out — not touched by this footprint, left red per protocol
      summary: "Each of the six coarse phase-map deepEquals across the three fixture files (one in test/inner-loop-happy.test.js, two in test/inner-loop-halt.test.js, three in test/inner-loop-park.test.js) now sits paired with an added assert.deepEqual over spawns.map((s) => s.opts.label), pinning that fixture's full expected label list — the feature id (and task id where one rides) plus the [<resolved-model>] prefix. Each expected label list was derived by running the real fixture through the shim before writing the assertion, then confirmed meaningful by temporarily corrupting one entry per assertion, watching it go red, and reverting to green — proving the assertions actually exercise the label values rather than restating them vacuously. The excluded-feature drain/halt proofs are now observable on labels too: delta never appears in the halt suite's env-block-drain or park suite's kind-environment-halt label lists, and beta never appears in the park suite's dependent-of-a-parked-feature drain label list. No existing assertion was removed or edited — the label maps are pure additions alongside the already-flipped phase maps, confirmed by a diff showing only insertions (47 insertions, 0 deletions across 3 files). npm test passes 231/232 (the sole failure is the pre-existing, out-of-footprint test/design-md.test.js design_version pin noted in t1 and t2's own reports, reproducing identically), and npx eslint . is clean."
  - id: t4
    title: Source-shape test pins the meta phases declaration on its single line
    status: pending
    covers: [2]
    acceptance:
      - "a new test/inner-loop-meta.test.js reads the workflows/inner-loop.js source text, extracts the `export const meta` declaration from its single physical line, evaluates that declaration as JavaScript without executing the rest of the script, and asserts the resulting object's `phases` deep-equals [{ title: 'Plan' }, { title: 'Build' }, { title: 'Validate' }] — order and title-only shape both pinned by the deepEqual"
      - "the test fails when the meta declaration no longer sits on one physical line ending in `;` — the extraction requires the complete declaration on the matched line, so a future multi-line meta breaks this test rather than the eslint preprocessor alone"
      - "npm test runs the new file green and npx eslint . passes"
    injects: []
    standards: []
    footprint: [test/inner-loop-meta.test.js]
    size: xs
    tier: standard
    depends_on: [t2]
  - id: t5
    title: The relay and adjust surfaces name the stalled field agent
    status: pending
    covers: [3]
    acceptance:
      - "commands/the-loop.md's relay bullet for stalled entries names the fields `feature`/`agent`/`note` and no longer names `phase` as a stalled-entry field; the surrounding relay prose (including the append-run reduction of stalled entries to feature ids) and every other bullet are otherwise unchanged"
      - "skills/adjust/SKILL.md's run-boundary bullet names stalled items `feature` / `agent` / `note`; every escalation-record `phase` reference elsewhere in that file (plan | build | validate — where a park happened) is untouched"
      - "grep -rn stalled commands/ skills/ shows no stalled-entry field list naming `phase`"
    injects: [boundary-result]
    standards: [docs/standards/loop-surfaces.md]
    footprint: [commands/the-loop.md, skills/adjust/SKILL.md]
    size: xs
    tier: standard
    depends_on: [t1]
```
