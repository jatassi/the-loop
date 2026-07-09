// role-agent-binding (ADR-0050): a binding's optional `agent` field selects the
// spawn's agentType; unbound roles keep agentTypeFor(role); agent+executor on one
// role is a named configuration gap — the role is blocked (human must fix config),
// never silently resolved to one or the other.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { byLabel, runWorkflowScript } from './execution-pipeline-harness.js';

const SCRIPT = 'plugin/workflows/execution-pipeline.js';

function executionContextOf(models, { agentNamespace = '' } = {}) {
  return {
    target: 'main', scope: ['alpha'], probe: null, models, agentNamespace,
    features: {
      alpha: {
        id: 'alpha', title: 'alpha title', acceptance: ['alpha works'], depends_on: [],
        designDoc: 'design doc for alpha', branch: 'loop/alpha', branchHead: null,
        plan: null, builtTasks: [],
      },
    },
  };
}

const BUDGET = { spent: 0, remaining: 10 };

test('a role binding carrying an agent name makes the pipeline spawn that agent type; unbound roles keep the bundled agentTypeFor(role)', async () => {
  const args = executionContextOf({
    validate: { model: 'opus', agent: 'my-validator' },
    // plan and build.standard unbound → bundled agent types
  });
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'planned', workflow_path: 'small' } },
    'build:alpha/feature': { returns: { result: 'built', task: 'alpha/feature' } },
    'my-validator:alpha': { returns: { result: 'validated', feature: 'alpha' } },
  });

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['plan', 'build', 'my-validator']);
  assert.deepEqual(result.completed, ['alpha']);
  assert.deepEqual(result.stalled, []);
  assert.deepEqual(result.blocked, []);
});

test('with a non-empty agentNamespace, unbound roles still spawn the namespaced bundled type while a bound agent is passed through byte-for-byte', async () => {
  const args = executionContextOf({
    validate: { model: 'opus', agent: 'my-validator' },
  }, { agentNamespace: 'the-loop' });
  const replies = byLabel({
    'the-loop:plan:alpha': { returns: { result: 'planned', workflow_path: 'small' } },
    'the-loop:build:alpha/feature': { returns: { result: 'built', task: 'alpha/feature' } },
    'my-validator:alpha': { returns: { result: 'validated', feature: 'alpha' } },
  });

  const { spawns } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['the-loop:plan', 'the-loop:build', 'my-validator']);
});

test('agent+executor on one role is a named configuration gap: the role is blocked and nothing is spawned for it', async () => {
  const args = executionContextOf({
    validate: { model: 'opus', agent: 'my-validator', executor: 'grok', gap: 'agent-and-executor' },
    'build.standard': { model: 'sonnet' },
  });
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'planned', workflow_path: 'small' } },
    'build:alpha/feature': { returns: { result: 'built', task: 'alpha/feature' } },
    // validate must never spawn — neither my-validator nor drive nor validate
  });

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  const validateLike = spawns.filter((s) => s.opts.phase === 'Validate'
    || s.opts.agentType === 'my-validator'
    || s.opts.agentType === 'drive'
    || s.opts.agentType === 'validate');
  assert.equal(validateLike.length, 0, 'never silently picks agent or executor');
  assert.equal(result.completed.length, 0);
  assert.deepEqual(result.blocked, [{ feature: 'alpha', reason: 'agent-and-executor', options: undefined }]);
  assert.deepEqual(result.stalled, []);
});
