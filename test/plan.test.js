import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlan, validatePlan, planPath, TASK_SIZES } from '../src/plan.js';
import { parse } from '../src/parse.js';
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
