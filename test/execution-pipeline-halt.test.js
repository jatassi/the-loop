// The run-level halt and feature-level stall legs: a budget-named throw halts the whole
// run; an environment-shaped block stalls only its own feature (retry lane); an ordinary
// agent error stalls only its own feature — everything else keeps running.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertEveryFeatureAccounted, byLabel, runWorkflowScript } from './execution-pipeline-harness.js';

const SCRIPT = 'plugin/workflows/execution-pipeline.js';

function feature(id, overrides = {}) {
  return {
    id, title: `${id} title`, acceptance: [`${id} works`], depends_on: [],
    designDoc: `design doc for ${id}`, branch: `loop/${id}`, branchHead: null,
    plan: null, builtTasks: [], ...overrides,
  };
}

function executionContextOf(features, overrides = {}) {
  return {
    target: 'main', scope: features.map((f) => f.id), probe: null, models: {}, agentNamespace: '',
    features: Object.fromEntries(features.map((f) => [f.id, f])), ...overrides,
  };
}

const BUDGET = { spent: 0, remaining: 10 };
const validated = (id) => ({ returns: { result: 'validated', feature: id } });
const built = (task) => ({ returns: { result: 'built', task } });

class BudgetExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

test('a budget-named throw halts the run; the un-started remainder is explained by halted, not reported stalled', async () => {
  // Budget-halt remainder is legitimately explained by `halted`, not any bucket —
  // do not call assertEveryFeatureAccounted here (allowHaltedRemainder exception).
  const args = executionContextOf([feature('alpha'), feature('beta', { depends_on: ['alpha'] })]);
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'planned', workflow_path: 'small' } },
    'build:alpha/feature': { throws: new BudgetExceededError('spend cap reached') },
  });

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['plan', 'build']);
  assert.deepEqual(result.halted, { reason: 'budget-exhausted', detail: 'spend cap reached' });
  assert.deepEqual(result.stalled, [], 'beta is explained by halted, never mislabeled unreachable');
  assert.deepEqual(result.completed, []);
});

test('an environment-shaped block stalls the feature with the block detail; the run is not halted', async () => {
  const args = executionContextOf([feature('alpha')]);
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'planned', workflow_path: 'small' } },
    'build:alpha/feature': { returns: { result: 'blocked', task: 'alpha/feature', kind: 'environment', detail: 'git worktree add failed: disk full' } },
  });

  const { result } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(result.stalled, [{ feature: 'alpha', agent: 'build', note: 'git worktree add failed: disk full' }]);
  assert.equal(result.halted, undefined);
  assert.deepEqual(result.blocked, []);
  assertEveryFeatureAccounted(result, args.scope);
});

test('an environment block on one feature stalls it while a mid-flight sibling still completes', async () => {
  const args = executionContextOf([feature('pfeat'), feature('mfeat')]);
  const replies = byLabel({
    'plan:pfeat': { returns: { result: 'planned', workflow_path: 'small' } },
    'plan:mfeat': { returns: { result: 'planned', workflow_path: 'small' } },
    'build:pfeat/feature': {
      returns: { result: 'blocked', task: 'pfeat/feature', kind: 'environment', detail: 'executor cut off mid-work' },
    },
    // Delayed resolve so mfeat's build is mid-flight when pfeat's env block lands.
    'build:mfeat/feature': {
      returns: new Promise((resolve) => setTimeout(() => resolve({ result: 'built', task: 'mfeat/feature' }), 50)),
    },
    'validate:mfeat': validated('mfeat'),
  });

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(result.stalled, [{ feature: 'pfeat', agent: 'build', note: 'executor cut off mid-work' }]);
  assert.deepEqual(result.completed, ['mfeat']);
  assert.equal(result.halted, undefined);
  assert.ok(
    spawns.some((s) => s.opts.agentType === 'validate' && s.opts.label === 'mfeat'),
    'mfeat validate still spawns after sibling environment block',
  );
  assertEveryFeatureAccounted(result, args.scope);
});

test('an ordinary agent error stalls only its own feature; an independent feature still completes', async () => {
  const args = executionContextOf([feature('alpha'), feature('beta')]);
  const replies = byLabel({
    'plan:alpha': { throws: new Error('api hiccup') },
    'plan:beta': { returns: { result: 'planned', workflow_path: 'small' } },
    'build:beta/feature': built('beta/feature'),
    'validate:beta': validated('beta'),
  });

  const { result } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(result.completed, ['beta']);
  assert.deepEqual(result.stalled, [{ feature: 'alpha', agent: 'plan', note: 'api hiccup' }]);
  assert.equal(result.halted, undefined);
  assertEveryFeatureAccounted(result, args.scope);
});

test('a null agent return stalls the feature with the pinned note', async () => {
  const args = executionContextOf([feature('alpha')]);
  const replies = byLabel({}); // no reply scripted → the stub returns null

  const { result } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(result.stalled, [{ feature: 'alpha', agent: 'plan', note: 'agent returned null' }]);
  assertEveryFeatureAccounted(result, args.scope);
});
