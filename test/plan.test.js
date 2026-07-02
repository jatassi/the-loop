import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse } from '../src/parse.js';
import { foldReport, parsePlan, planPath, REPORT_RESULTS, resolveTask, TASK_SIZES, validatePlan } from '../src/plan.js';
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
  assert.ok(!('report' in m.tasks[0])); // absent report stays absent
});

test('parsePlan is lenient when the block is absent', () => {
  const m = parsePlan('# narrative only\n');
  assert.deepEqual(m.tasks, []);
  assert.equal(m._blocks.tasks, null);
});

test('a well-formed plan validates clean and round-trips byte-for-byte', () => {
  const r = validatePlan(model(), DESIGN);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
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
  m.tasks[1].size = 'xl'; // not representable: split or bounce
  const got = codes(validatePlan(m, DESIGN));
  for (const c of ['bad-task-status', 'missing-task-acceptance', 'missing-footprint', 'bad-size']) {
    assert.ok(got.includes(c), c);
  }
});

test('size m passes but warns — the comfort ceiling needs narrative justification', () => {
  const m = model();
  m.tasks[0].size = 'm';
  const r = validatePlan(m, DESIGN);
  assert.ok(r.ok);
  assert.ok(r.warnings.some((w) => w.code === 'size-at-ceiling'));
  assert.deepEqual(TASK_SIZES, ['xs', 's', 'm']);
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

test('resolveTask hands a builder its slice: contract, covered criteria texts, inject bodies', () => {
  const s = resolveTask(model(), DESIGN, 't2');
  assert.equal(s.feature, 'widget');
  assert.equal(s.design_version, 2);
  assert.equal(s.task.id, 't2');
  assert.deepEqual(s.covers_criteria, ['persists a widget']);
  assert.equal(s.injects.length, 1);
  assert.match(s.injects[0].body, /render\(\), save\(\)/);
  assert.deepEqual(s.unbuilt_dependencies, ['t1']); // t1 is still pending — builder must refuse
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
