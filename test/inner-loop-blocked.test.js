// The needs-a-decision legs: a bounce, a feature-shaped build block, and a validation
// deviation each land one `blocked` entry on the BoundaryResult — a question for the
// human at the boundary, nothing filed anywhere (ADR-0034) — and never stop a
// different feature's own run.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { byLabel, runWorkflowScript } from './workflow-shim.js';

const SCRIPT = 'workflows/inner-loop.js';

function feature(id, overrides = {}) {
  return {
    id, title: `${id} title`, acceptance: [`${id} works`], depends_on: [],
    designDoc: `design doc for ${id}`, branch: `loop/${id}`, branchHead: null,
    plan: null, builtTasks: [], ...overrides,
  };
}

function snapshotOf(features, overrides = {}) {
  return {
    target: 'main', scope: features.map((f) => f.id), probe: null, models: {},
    features: Object.fromEntries(features.map((f) => [f.id, f])), ...overrides,
  };
}

const BUDGET = { spent: 0, remaining: 10 };
const validated = (id) => ({ returns: { result: 'validated', feature: id } });
const built = (task) => ({ returns: { result: 'built', task } });

test('a plan bounce blocks the feature with the reason and options, and spawns nothing further for it', async () => {
  const args = snapshotOf([feature('alpha')]);
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'bounce', detail: 'two criteria contradict', options: ['split the feature', 'drop criterion 2'] } },
  });

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['plan']);
  assert.deepEqual(result.blocked, [{ feature: 'alpha', reason: 'two criteria contradict', options: ['split the feature', 'drop criterion 2'] }]);
  assert.deepEqual(result.completed, []);
});

test('a feature-shaped build block blocks the feature, skips its dependents and its validation, and drains in-scope dependents as stalled', async () => {
  const tasks = [
    { id: 't1', title: 'a', covers: [1], acceptance: ['t1'], footprint: ['a.js'], size: 's', depends_on: [] },
    { id: 't2', title: 'b', covers: [1], acceptance: ['t2'], footprint: ['b.js'], size: 's', depends_on: ['t1'] },
  ];
  const args = snapshotOf([feature('alpha'), feature('beta', { depends_on: ['alpha'] })]);
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'planned', lane: 'standard', tasks } },
    'build:alpha/t1': { returns: { result: 'blocked', task: 'alpha/t1', kind: 'feature', detail: 'criterion 1 is untestable as written', options: ['re-plan t1'] } },
  });

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  const kinds = spawns.map((s) => s.opts.agentType);
  assert.deepEqual(kinds, ['plan', 'build'], 't2 and validate never spawn; beta never starts');
  assert.deepEqual(result.blocked, [{ feature: 'alpha', reason: 'criterion 1 is untestable as written', options: ['re-plan t1'] }]);
  assert.equal(result.stalled.length, 1);
  assert.equal(result.stalled[0].feature, 'beta'); // its in-scope dependency did not land this run
  assert.deepEqual(result.completed, []);
});

test('a validation deviation blocks the feature with the findings while an independent feature still completes', async () => {
  const args = snapshotOf([feature('alpha'), feature('beta')]);
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'planned', lane: 'small' } },
    'build:alpha/feature': built('alpha/feature'),
    'validate:alpha': { returns: { result: 'deviation', feature: 'alpha', findings: ['criterion 1: greeting omits the name'], options: ['fix in place'] } },
    'plan:beta': { returns: { result: 'planned', lane: 'small' } },
    'build:beta/feature': built('beta/feature'),
    'validate:beta': validated('beta'),
  });

  const { result } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(result.completed, ['beta']);
  assert.deepEqual(result.blocked, [{ feature: 'alpha', reason: 'criterion 1: greeting omits the name', options: ['fix in place'] }]);
});

test("a validator's feature-shaped block (a real merge conflict) blocks the feature with its detail", async () => {
  const args = snapshotOf([feature('alpha')]);
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'planned', lane: 'small' } },
    'build:alpha/feature': built('alpha/feature'),
    'validate:alpha': { returns: { result: 'blocked', feature: 'alpha', kind: 'feature', detail: 'merge conflict in src/a.js', options: ['rebase the branch'] } },
  });

  const { result } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(result.blocked, [{ feature: 'alpha', reason: 'merge conflict in src/a.js', options: ['rebase the branch'] }]);
  assert.deepEqual(result.completed, []);
});
