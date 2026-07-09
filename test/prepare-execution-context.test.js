// The execution-context assembler's pure core (src/prepare-execution-context.js):
// scope gating, git-derived task state, and execution-context shaping — all testable
// without a repo, exactly as promised.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assembleExecutionContext, builtTaskIds, checkScope, featureBranch, taskBranch, taskCommitPrefix } from '../plugin/src/prepare-execution-context.js';

const feature = (id, status, extra = {}) =>
  ({ id, title: id, status, depends_on: [], acceptance: `${id} works`, ...extra });

const MODEL = {
  designVersion: 1,
  features: [
    feature('landed', 'validated'),
    feature('shipped-dep', 'shipped'),
    feature('ready', 'designed', { depends_on: ['landed', 'shipped-dep'] }),
    feature('chained', 'designed', { depends_on: ['ready'] }),
    feature('orphan', 'designed', { depends_on: ['landed', 'chained'] }),
  ],
};

// ── the branch/prefix naming conventions everything else keys on ──
test('featureBranch, taskBranch, and taskCommitPrefix pin the git naming scheme', () => {
  assert.equal(featureBranch('widget'), 'loop/widget');
  assert.equal(taskBranch('widget', 't1'), 'loop/widget--t1');
  assert.equal(taskCommitPrefix('widget', 't1'), 'widget/t1: ');
});

// ── checkScope ──
test('a scope of designed features with landed deps passes', () => {
  assert.deepEqual(checkScope(MODEL, ['ready']), { ok: true, errors: [] });
});

test('an unknown id, a not-designed feature, and an unsatisfied dep each refuse with their code', () => {
  const { ok, errors } = checkScope(MODEL, ['ghost', 'landed', 'orphan']);
  assert.equal(ok, false);
  assert.deepEqual(errors.map((e) => [e.code, e.where]), [
    ['unknown-feature', 'ghost'],
    ['not-designed', 'landed'],           // validated — nothing to run
    ['unsatisfied-dependency', 'orphan'], // chained is neither landed nor in scope
  ]);
});

test('a dependency is satisfied by being in the same scope (the scheduler orders it)', () => {
  assert.equal(checkScope(MODEL, ['ready', 'chained']).ok, true);
  assert.equal(checkScope(MODEL, ['chained']).ok, false); // alone, ready is not landed
});

test('a dependency is satisfied by DONE status — validated and shipped alike', () => {
  assert.equal(checkScope(MODEL, ['ready']).ok, true); // deps: one validated, one shipped
});

test('a proposed feature in scope is refused with a message naming it must be designed first', () => {
  const model = { designVersion: 1, features: [feature('backlog-item', 'proposed')] };
  const { ok, errors } = checkScope(model, ['backlog-item']);
  assert.equal(ok, false);
  assert.deepEqual(errors, [{
    code: 'not-designed',
    message: 'feature is proposed, not designed — it must be designed first',
    where: 'backlog-item',
  }]);
});

// ── builtTaskIds ──
const PLAN = { tasks: [{ id: 't1' }, { id: 't2' }, { id: 't3' }] };

test('a task is built iff its branch head subject carries the task commit prefix', () => {
  const heads = {
    'loop/widget--t1': 'widget/t1: land the render pipeline',
    'loop/widget--t2': 'wip: crashed before committing the task', // crashed attempt → unbuilt
    // t3 has no branch at all
  };
  assert.deepEqual(builtTaskIds('widget', PLAN, heads), ['t1']);
});

test('no plan means no built tasks', () => {
  assert.deepEqual(builtTaskIds('widget', null, { 'loop/widget--t1': 'widget/t1: x' }), []);
});

// ── assembleExecutionContext ──
const EXECUTION_CONTEXT_INPUT = {
  model: {
    designVersion: 1,
    features: [
      feature('a', 'designed', { notes: ['a note'] }),
      feature('b', 'designed', { depends_on: ['a'], acceptance: ['b1', 'b2'] }),
    ],
  },
  scope: ['a', 'b'],
  target: 'main',
  probe: 'run the probe',
  models: { plan: { model: 'session', provenance: 'default' } },
  inputs: {
    a: {
      designDoc: '# a',
      plan: { designVersion: 1, tasks: [{ id: 't1' }] },
      branchHeads: { 'loop/a': 'a/t1: landed', 'loop/a--t1': 'a/t1: landed' },
    },
    // b has no gathered inputs at all — every per-feature field must default
  },
  cli: 'node /plugin/bin/the-loop.js',
};

test('assembleExecutionContext shapes the workflow args: target, scope, probe, models, per-feature entries, cli', () => {
  const ctx = assembleExecutionContext(EXECUTION_CONTEXT_INPUT);
  assert.deepEqual(Object.keys(ctx), ['target', 'scope', 'probe', 'models', 'features', 'cli']);
  assert.equal(ctx.target, 'main');
  assert.deepEqual(ctx.scope, ['a', 'b']);
  assert.equal(ctx.probe, 'run the probe');
  assert.equal(ctx.cli, 'node /plugin/bin/the-loop.js'); // passthrough

  assert.deepEqual(ctx.features.a, {
    id: 'a',
    title: 'a',
    acceptance: ['a works'], // string acceptance normalized to an array
    depends_on: [],
    notes: ['a note'],
    designDoc: '# a',
    branch: 'loop/a',
    branchHead: 'a/t1: landed',
    plan: { designVersion: 1, tasks: [{ id: 't1' }] },
    builtTasks: ['t1'],
  });

  const b = ctx.features.b;
  assert.deepEqual(b.acceptance, ['b1', 'b2']); // an array stays as-is
  assert.ok(!('notes' in b)); // absent notes stay absent
  assert.equal(b.designDoc, null);
  assert.equal(b.branchHead, null); // no branch → null, not undefined
  assert.equal(b.plan, null);
  assert.deepEqual(b.builtTasks, []);
});

test('assembleExecutionContext omits the cli key when none is given', () => {
  const { cli, ...rest } = EXECUTION_CONTEXT_INPUT;
  assert.ok(!('cli' in assembleExecutionContext(rest)));
});
