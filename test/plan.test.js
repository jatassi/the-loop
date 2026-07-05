import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse } from '../src/parse.js';
import * as planModule from '../src/plan.js';
import { render } from '../src/render.js';

const { parsePlan, planPath, resolveTask, TASK_SIZES, TASK_TIERS, validatePlan } = planModule;

const DESIGN = parse(`## Feature graph

\`\`\`yaml
design_version: 2
features:
  - id: widget
    title: Widget
    status: designed
    acceptance: [renders a widget, persists a widget]
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
    covers: [1]
    acceptance: given a widget model, rendering returns markup
    footprint: [src/render.js, test/render.test.js]
    size: s
    depends_on: []
  - id: t2
    title: Persistence + wiring
    covers: [2]
    acceptance: a saved widget round-trips through render
    footprint: [src/save.js, src/render.js]
    size: xs
    depends_on: [t1]
    wiring: save() feeds render() through the widget model
\`\`\`
`;

// Parse the fixture once per test and mutate the model — validatePlan is pure over it.
const model = () => parsePlan(PLAN);
const codes = (r) => r.errors.map((e) => e.code);

test('parsePlan extracts feature, drift stamp, and normalized contract-only tasks', () => {
  const m = model();
  assert.equal(m.feature, 'widget');
  assert.equal(m.designVersion, 2);
  assert.deepEqual(m.tasks.map((t) => t.id), ['t1', 't2']);
  assert.deepEqual(m.tasks[0].covers, [1]);
  assert.deepEqual(m.tasks[1].depends_on, ['t1']);
  assert.deepEqual(m.tasks[0].footprint, ['src/render.js', 'test/render.test.js']);
  assert.equal(m.tasks[1].wiring, 'save() feeds render() through the widget model');
  assert.ok(!('wiring' in m.tasks[0])); // absent wiring stays absent
  assert.ok(!('tier' in m.tasks[0])); // absent tier stays absent
  assert.ok(!('status' in m.tasks[0])); // contracts only — no task status field
  assert.ok(!('report' in m.tasks[0])); // and no folded reports
});

test('normalizeTask carries tier through when present, straight off a real parse', () => {
  const withTier = parsePlan(PLAN.replace('    covers: [1]', '    tier: rote\n    covers: [1]'));
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
  assert.deepEqual(r.errors, []); // the base fixture carries no tier — grandfathered to warnings only
  assert.ok(r.ok);
  assert.equal(render(PLAN, model()), PLAN);
});

test('a missing tasks block and a non-integer design_version are errors', () => {
  const r = validatePlan(parsePlan('# narrative only\n'), DESIGN);
  assert.ok(codes(r).includes('missing-tasks-block'));
  assert.ok(codes(r).includes('bad-plan-design-version'));
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
  m.tasks.push({ id: 't3', title: 'Mid', covers: [1], acceptance: 'x',
    footprint: ['src/mid.js'], size: 'xs', depends_on: ['t1'] });
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
  m.tasks[0].title = '';
  m.tasks[0].acceptance = '';
  m.tasks[0].footprint = [];
  m.tasks[0].tier = 'urgent'; // out-of-enum tier
  m.tasks[1].size = 'xl'; // not representable: split or bounce
  const got = codes(validatePlan(m, DESIGN));
  for (const c of ['missing-task-title', 'missing-task-acceptance', 'missing-footprint', 'bad-size', 'bad-tier']) {
    assert.ok(got.includes(c), c);
  }
});

test('an absent tier warns without blocking — a plan cut before tiers still checks', () => {
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

test('resolveTask hands a builder its kernel: feature, drift stamp, contract, covered criteria texts', () => {
  const m = model();
  m.tasks[1].tier = 'complex';
  const s = resolveTask(m, DESIGN, 't2');
  assert.deepEqual(Object.keys(s).toSorted((a, b) => a.localeCompare(b)),
    ['covers_criteria', 'design_version', 'feature', 'task']);
  assert.equal(s.feature, 'widget');
  assert.equal(s.design_version, 2);
  assert.equal(s.task.id, 't2');
  assert.deepEqual(s.covers_criteria, ['persists a widget']);
  assert.equal(s.task.tier, 'complex'); // stamped tier rides the kernel
  assert.equal(s.task.wiring, 'save() feeds render() through the widget model'); // wiring too
});

test('resolveTask throws on an unknown task id', () => {
  assert.throws(() => resolveTask(model(), DESIGN, 'ghost'), /unknown task id: widget\/ghost/);
});

test('the v1 status/report machinery is gone from the plan module surface', () => {
  for (const removed of ['foldReport', 'appendRemediation', 'appendFix', 'REPORT_RESULTS']) {
    assert.ok(!Object.hasOwn(planModule, removed), `${removed} must not be exported`);
  }
});
