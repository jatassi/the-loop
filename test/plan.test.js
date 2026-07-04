import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse } from '../src/parse.js';
import { appendFix, appendRemediation, foldReport, parsePlan, planPath, REPORT_RESULTS, resolveTask, TASK_SIZES, TASK_TIERS, validatePlan } from '../src/plan.js';
import { render } from '../src/render.js';

const DESIGN = parse(`## Feature graph

\`\`\`yaml
design_version: 2
features:
  - id: widget
    title: Widget
    status: designed
    interfaces: [widget-api]
    acceptance: [renders a widget, persists a widget]
\`\`\`

## Key interface contracts

\`\`\`yaml
contracts:
  - id: widget-api
    body: |
      { render(), save() }
\`\`\`
`);

const PLAN = `# Plan — widget

Two tasks; t2 shares src/render.js with t1, so it is chained behind it.

## Tasks

\`\`\`yaml
feature: widget
design_version: 2
tasks:
  - id: t1
    title: Render pipeline
    status: pending
    covers: [1]
    acceptance: given a widget model, rendering returns markup
    injects: [widget-api]
    standards: [docs/standards/render.md]
    footprint: [src/render.js, test/render.test.js]
    size: s
    depends_on: []
  - id: t2
    title: Persistence + wiring
    status: pending
    covers: [2]
    acceptance: a saved widget round-trips through render
    injects: [widget-api]
    footprint: [src/save.js, src/render.js]
    size: xs
    depends_on: [t1]
\`\`\`
`;

// Parse the fixture once per test and mutate the model — validatePlan is pure over it.
const model = () => parsePlan(PLAN);
const codes = (r) => r.errors.map((e) => e.code);

test('parsePlan extracts feature, drift stamp, and normalized tasks', () => {
  const m = model();
  assert.equal(m.feature, 'widget');
  assert.equal(m.designVersion, 2);
  assert.deepEqual(m.tasks.map((t) => t.id), ['t1', 't2']);
  assert.deepEqual(m.tasks[0].covers, [1]);
  assert.deepEqual(m.tasks[1].depends_on, ['t1']);
  assert.deepEqual(m.tasks[0].footprint, ['src/render.js', 'test/render.test.js']);
  assert.deepEqual(m.tasks[0].standards, ['docs/standards/render.md']);
  assert.deepEqual(m.tasks[1].standards, []); // absent field normalizes to none
  assert.ok(!('report' in m.tasks[0])); // absent report stays absent
  assert.ok(!('tier' in m.tasks[0])); // absent tier stays absent, like report
});

test('normalizeTask carries tier through when present, straight off a real parse', () => {
  const withTier = parsePlan(PLAN.replace('    status: pending\n    covers: [1]', '    status: pending\n    tier: rote\n    covers: [1]'));
  assert.equal(withTier.tasks[0].tier, 'rote'); // carried through when present
  assert.ok(!('tier' in withTier.tasks[1])); // sibling task untouched — still absent
});

test('parsePlan is lenient when the block is absent', () => {
  const m = parsePlan('# narrative only\n');
  assert.deepEqual(m.tasks, []);
  assert.equal(m._blocks.tasks, null);
});

test('a well-formed plan validates clean and round-trips byte-for-byte', () => {
  const r = validatePlan(model(), DESIGN);
  assert.deepEqual(r.errors, []); // the base fixture predates tier — grandfathered to warnings only
  assert.ok(r.ok);
  assert.equal(render(PLAN, model()), PLAN);
});

test('a task may carry multiple acceptance criteria (string | string[])', () => {
  const m = model();
  m.tasks[0].acceptance = ['markup contains the widget title', 'an empty model renders an empty state'];
  const r = validatePlan(m, DESIGN);
  assert.ok(r.ok);
  assert.deepEqual(r.errors, []);
});

test('overlapping footprints without an ordering path are an error', () => {
  const m = model();
  m.tasks[1].depends_on = []; // both touch src/render.js, now unordered
  assert.ok(codes(validatePlan(m, DESIGN)).includes('unordered-overlap'));
});

test('an ordering path through intermediate tasks satisfies overlap serialization', () => {
  const m = model();
  m.tasks[1].depends_on = ['t3'];
  m.tasks.push({ id: 't3', title: 'Mid', status: 'pending', covers: [1], acceptance: 'x',
    injects: [], footprint: ['src/mid.js'], size: 'xs', depends_on: ['t1'] });
  assert.ok(!codes(validatePlan(m, DESIGN)).includes('unordered-overlap')); // t2 → t3 → t1
});

test('task edge integrity: duplicates, dangling, self, cycles', () => {
  const dup = model(); dup.tasks[1].id = 't1';
  assert.ok(codes(validatePlan(dup, DESIGN)).includes('duplicate-task-id'));

  const dangling = model(); dangling.tasks[1].depends_on = ['ghost'];
  assert.ok(codes(validatePlan(dangling, DESIGN)).includes('dangling-task-dependency'));

  const self = model(); self.tasks[0].depends_on = ['t1'];
  assert.ok(codes(validatePlan(self, DESIGN)).includes('self-dependency'));

  const cyc = model(); cyc.tasks[0].depends_on = ['t2'];
  assert.ok(codes(validatePlan(cyc, DESIGN)).includes('task-dependency-cycle'));
});

test('per-task contract fields are enforced', () => {
  const m = model();
  m.tasks[0].status = 'doing';
  m.tasks[0].acceptance = '';
  m.tasks[0].footprint = [];
  m.tasks[0].tier = 'urgent'; // out-of-enum tier
  m.tasks[1].size = 'xl'; // not representable: split or bounce
  const got = codes(validatePlan(m, DESIGN));
  for (const c of ['bad-task-status', 'missing-task-acceptance', 'missing-footprint', 'bad-size', 'bad-tier']) {
    assert.ok(got.includes(c), c);
  }
});

test('an absent tier warns without blocking — a plan cut before this feature still checks', () => {
  const r = validatePlan(model(), DESIGN); // base fixture carries no tier anywhere
  assert.ok(r.ok);
  assert.ok(r.warnings.some((w) => w.code === 'missing-tier' && w.where === 't1'));
  assert.ok(r.warnings.some((w) => w.code === 'missing-tier' && w.where === 't2'));
});

test('a fully tiered plan checks clean — no missing-tier warning once every task is stamped', () => {
  const m = model();
  m.tasks[0].tier = 'standard';
  m.tasks[1].tier = 'complex';
  const r = validatePlan(m, DESIGN);
  assert.ok(r.ok);
  assert.deepEqual(r.warnings, []);
});

test('size m passes but warns — the comfort ceiling needs narrative justification', () => {
  const m = model();
  m.tasks[0].size = 'm';
  const r = validatePlan(m, DESIGN);
  assert.ok(r.ok);
  assert.ok(r.warnings.some((w) => w.code === 'size-at-ceiling'));
  assert.deepEqual(TASK_SIZES, ['xs', 's', 'm']);
  assert.deepEqual(TASK_TIERS, ['rote', 'standard', 'complex']);
});

test('coverage: both directions between tasks and feature criteria', () => {
  const orphanTask = model(); orphanTask.tasks[0].covers = [];
  assert.ok(codes(validatePlan(orphanTask, DESIGN)).includes('task-covers-nothing'));

  const badRef = model(); badRef.tasks[0].covers = [3];
  assert.ok(codes(validatePlan(badRef, DESIGN)).includes('bad-covers-ref'));

  const uncovered = model(); uncovered.tasks[1].covers = [1]; // nobody claims criterion #2
  assert.ok(codes(validatePlan(uncovered, DESIGN)).includes('uncovered-criterion'));
});

test('injects must name contracts the design defines', () => {
  const m = model();
  m.tasks[0].injects = ['ghost-api'];
  assert.ok(codes(validatePlan(m, DESIGN)).includes('dangling-inject'));
});

test('the plan must target a known feature', () => {
  const m = model();
  m.feature = 'gizmo';
  assert.ok(codes(validatePlan(m, DESIGN)).includes('unknown-feature'));
});

test('a drift-stamp mismatch warns but does not block', () => {
  const m = model();
  m.designVersion = 1;
  const r = validatePlan(m, DESIGN);
  assert.ok(r.ok);
  assert.ok(r.warnings.some((w) => w.code === 'stale-plan'));
});

test('planPath is the conventional artifact location', () => {
  assert.equal(planPath('widget'), 'docs/plans/widget.md');
});

test('task standards: docs/standards/ paths only, existence via the injected probe', () => {
  const clean = validatePlan(model(), DESIGN, { standardExists: (p) => p === 'docs/standards/render.md' });
  assert.deepEqual(clean.errors, []); // t1's standard exists per the probe

  const missing = validatePlan(model(), DESIGN, { standardExists: () => false });
  assert.ok(codes(missing).includes('unknown-standard'));

  const stray = model();
  stray.tasks[0].standards = ['src/render.js']; // not a docs/standards/ path
  assert.ok(codes(validatePlan(stray, DESIGN)).includes('bad-standards-path'));

  // no probe injected → shape-checked only, never an existence error
  assert.deepEqual(validatePlan(model(), DESIGN).errors, []);
});

test('resolveTask hands a builder its slice: contract, covered criteria texts, inject bodies', () => {
  const m = model();
  m.tasks[1].tier = 'complex';
  const s = resolveTask(m, DESIGN, 't2');
  assert.equal(s.feature, 'widget');
  assert.equal(s.design_version, 2);
  assert.equal(s.task.id, 't2');
  assert.deepEqual(s.covers_criteria, ['persists a widget']);
  assert.equal(s.injects.length, 1);
  assert.match(s.injects[0].body, /render\(\), save\(\)/);
  assert.deepEqual(s.unbuilt_dependencies, ['t1']); // t1 is still pending — builder must refuse
  assert.equal(s.task.tier, 'complex'); // stamped tier rides the slice
  assert.deepEqual(resolveTask(model(), DESIGN, 't1').task.standards, ['docs/standards/render.md']); // standards ride the slice
});

test('resolveTask: built dependencies are not blockers; an unknown task throws', () => {
  const m = model();
  m.tasks[0].status = 'built';
  assert.deepEqual(resolveTask(m, DESIGN, 't2').unbuilt_dependencies, []);
  assert.throws(() => resolveTask(model(), DESIGN, 'ghost'), /unknown task id: widget\/ghost/);
});

test('foldReport flips status, embeds the report, and render() persists both', () => {
  const m = model();
  foldReport(m, 't1', {
    task: 'widget/t1', result: 'built',
    footprint_actual: ['src/render.js', 'test/render.test.js'],
    diff_actual: { files: 2, insertions: 40, deletions: 0 },
    deviations: [], summary: 'render pipeline exists',
  });
  assert.equal(m.tasks[0].status, 'built');
  assert.ok(!('task' in m.tasks[0].report)); // the node's own id already names the task

  const text = render(PLAN, m);
  const re = parsePlan(text);
  assert.equal(re.tasks[0].status, 'built');
  assert.equal(re.tasks[0].report.summary, 'render pipeline exists');
  assert.deepEqual(re.tasks[0].report.footprint_actual, ['src/render.js', 'test/render.test.js']);
  assert.equal(re.tasks[1].status, 'pending'); // the sibling task is untouched
  assert.ok(text.startsWith('# Plan — widget\n\nTwo tasks;')); // narrative survives byte-for-byte
  assert.equal(render(text, re), text); // the folded artifact still round-trips
});

test('foldReport refuses a malformed result and a double fold', () => {
  assert.throws(() => foldReport(model(), 't1', { result: 'perfect' }), /result must be one of built\|blocked/);
  assert.throws(() => foldReport(model(), 'ghost', { result: 'built' }), /unknown task id/);

  const m = model();
  foldReport(m, 't1', { result: 'blocked', deviations: ['footprint impossible as contracted'], summary: 'blocked' });
  assert.equal(m.tasks[0].status, 'blocked');
  assert.throws(() => foldReport(m, 't1', { result: 'built', summary: 'retry' }), /already carries a report/);
  assert.deepEqual(REPORT_RESULTS, ['built', 'blocked']);
});

const FINDINGS = [
  { severity: 'advisory', location: 'src/render.js:12', observation: 'render() exceeds the complexity budget' },
  { severity: 'advisory', location: 'src/render.js:40', observation: 'duplicate branch logic' }, // same file as above
  { severity: 'advisory', location: 'src/save.js:5', observation: 'magic number' },
];

test('appendRemediation appends the round-marker to the model and the retained doc, and it survives render() round-trip', () => {
  const m = model();
  appendRemediation(m, FINDINGS);

  const task = m.tasks[2];
  assert.equal(task.id, 'remediation');
  assert.equal(task.remediation, true);
  assert.equal(task.status, 'pending');
  assert.deepEqual(task.covers, []);
  assert.deepEqual(task.footprint, ['src/render.js', 'src/save.js']); // deduplicated
  assert.equal(task.acceptance.length, FINDINGS.length);
  assert.equal(task.size, 's');
  assert.equal(task.tier, 'standard'); // stamped at append, so it never triggers missing-tier
  assert.deepEqual(task.depends_on, ['t1', 't2']);

  const text = render(PLAN, m);
  const re = parsePlan(text);
  assert.deepEqual(re.tasks[2].footprint, ['src/render.js', 'src/save.js']);
  assert.equal(re.tasks[2].remediation, true);
  assert.equal(re.tasks[2].tier, 'standard');
  assert.equal(render(text, re), text); // the appended artifact still round-trips
});

test('appendRemediation refuses a second marker and a findings set with no file:line locations, leaving the plan untouched', () => {
  const m = model();
  appendRemediation(m, FINDINGS);
  assert.throws(() => appendRemediation(m, FINDINGS), /already carries a remediation round-marker/);

  const fresh = model();
  const noFilePaths = [{ severity: 'advisory', location: 'npm test exit code 1', observation: 'suite failed' }];
  assert.throws(() => appendRemediation(fresh, noFilePaths), /no file:line location/);
  assert.equal(fresh.tasks.length, 2); // untouched
});

test('validatePlan allows empty covers on a remediation task, and parsePlan preserves the remediation flag', () => {
  const m = model();
  appendRemediation(m, FINDINGS);
  const r = validatePlan(m, DESIGN);
  assert.ok(r.ok);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.every((w) => w.where !== 'remediation' || w.code !== 'missing-tier')); // stamped at append

  const re = parsePlan(render(PLAN, m));
  assert.equal(re.tasks[2].remediation, true);
  assert.ok(!('remediation' in re.tasks[0])); // non-remediation tasks stay unflagged
});

test('appendFix appends fix-N with the given acceptance/footprint, defaults title from the directive, and depends on every prior task when nothing is blocked', () => {
  const m = model();
  const task = appendFix(m, {
    directive: 'Fix the render edge case\nmore detail the human typed',
    acceptance: ['an empty widget renders without throwing'],
    footprint: ['src/render.js'],
  });

  assert.equal(task.id, 'fix-1');
  assert.equal(task.fix, true);
  assert.equal(task.status, 'pending');
  assert.deepEqual(task.covers, []);
  assert.deepEqual(task.acceptance, ['an empty widget renders without throwing']);
  assert.deepEqual(task.injects, []);
  assert.deepEqual(task.standards, []);
  assert.deepEqual(task.footprint, ['src/render.js']);
  assert.equal(task.size, 's');
  assert.equal(task.tier, 'standard');
  assert.equal(task.title, 'Fix the render edge case'); // defaulted to the directive's first line
  assert.deepEqual(task.depends_on, ['t1', 't2']); // every prior task — none blocked, so plain

  const text = render(PLAN, m);
  const re = parsePlan(text);
  assert.equal(re.tasks[2].id, 'fix-1');
  assert.equal(re.tasks[2].fix, true);
  assert.equal(render(text, re), text); // the appended artifact still round-trips
});

test("appendFix resets a blocked task to pending, drops its report, chains fix-N behind it, and excludes that task from fix-N's own depends_on — no cycle", () => {
  const m = model();
  m.tasks[1].status = 'blocked';
  m.tasks[1].report = { result: 'blocked', deviations: ['dirty tree'], summary: 'blocked' };

  const task = appendFix(m, { title: 'Retry t2', acceptance: ['t2 runs clean'], footprint: ['src/save.js'] });

  assert.deepEqual(task.depends_on, ['t1']); // t2 is being reset — excluded from fix-1's own edges
  assert.equal(m.tasks[1].status, 'pending');
  assert.ok(!('report' in m.tasks[1]));
  assert.deepEqual(m.tasks[1].depends_on, ['t1', 'fix-1']); // chained behind the fix

  const r = validatePlan(m, DESIGN);
  assert.ok(!codes(r).includes('task-dependency-cycle'));

  const text = render(PLAN, m);
  const re = parsePlan(text);
  assert.equal(re.tasks[1].status, 'pending');
  assert.ok(!('report' in re.tasks[1]));
  assert.deepEqual(re.tasks[1].depends_on, ['t1', 'fix-1']);
  assert.equal(render(text, re), text); // the reset + chain survives round-trip too
});

test('a fix task itself raises no task-covers-nothing and its empty covers satisfies no feature criterion; a second fix appends as fix-2', () => {
  const m = model();
  appendFix(m, { title: 'First fix', acceptance: ['a'], footprint: ['src/a.js'] });

  // Isolate the fix task against the two-criterion feature: exempt from task-covers-nothing,
  // and its empty covers must not silently satisfy either criterion either.
  const fixOnly = { ...m, tasks: [m.tasks[2]] };
  const r = validatePlan(fixOnly, DESIGN);
  assert.ok(!codes(r).includes('task-covers-nothing'));
  assert.equal(codes(r).filter((c) => c === 'uncovered-criterion').length, 2);

  const second = appendFix(m, { title: 'Second fix', acceptance: ['b'], footprint: ['src/b.js'] });
  assert.equal(second.id, 'fix-2'); // fixes are not one-shot, unlike the remediation marker
});

test('appendFix refuses empty acceptance, empty footprint, and a title-less directive-less input, leaving the plan untouched', () => {
  const m = model();
  assert.throws(() => appendFix(m, { title: 't', acceptance: [], footprint: ['src/a.js'] }), /non-empty acceptance/);
  assert.throws(() => appendFix(m, { title: 't', acceptance: ['a'], footprint: [] }), /non-empty footprint/);
  assert.throws(() => appendFix(m, { acceptance: ['a'], footprint: ['src/a.js'] }), /title.*directive/);
  assert.equal(m.tasks.length, 2); // nothing appended by any refusal
});
