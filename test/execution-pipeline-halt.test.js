// The run-level halt and feature-level stall legs: a budget-named throw halts the whole
// run, an environment-shaped block halts it with the blocker's detail, and an ordinary
// agent error stalls only its own feature — everything else keeps running.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { byLabel, runWorkflowScript } from './execution-pipeline-harness.js';

const SCRIPT = 'workflows/execution-pipeline.js';

function feature(id, overrides = {}) {
  return {
    id, title: `${id} title`, acceptance: [`${id} works`], depends_on: [],
    designDoc: `design doc for ${id}`, branch: `loop/${id}`, branchHead: null,
    plan: null, builtTasks: [], ...overrides,
  };
}

function executionContextOf(features, overrides = {}) {
  return {
    target: 'main', scope: features.map((f) => f.id), probe: null, models: {},
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

test('an environment-shaped block halts the run carrying the blocker detail', async () => {
  const args = executionContextOf([feature('alpha')]);
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'planned', workflow_path: 'small' } },
    'build:alpha/feature': { returns: { result: 'blocked', task: 'alpha/feature', kind: 'environment', detail: 'git worktree add failed: disk full' } },
  });

  const { result } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(result.halted, { reason: 'environment-blocked', detail: 'git worktree add failed: disk full' });
  assert.deepEqual(result.blocked, []);
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
});

test('a null agent return stalls the feature with the pinned note', async () => {
  const args = executionContextOf([feature('alpha')]);
  const replies = byLabel({}); // no reply scripted → the stub returns null

  const { result } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(result.stalled, [{ feature: 'alpha', agent: 'plan', note: 'agent returned null' }]);
});
