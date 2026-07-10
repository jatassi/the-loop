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

  const { result, spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  // Transient-retry gate must not respawn a budget-exhausted throw — one build spawn only.
  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['plan', 'build']);
  assert.equal(spawns.filter((s) => s.opts.agentType === 'build').length, 1);
  assert.ok(logs.every((l) => !/retry/i.test(l)), 'budget-exhausted must not log a retry');
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

test('a null agent return retries once then stalls with a label-bearing ambiguity note', async () => {
  const args = executionContextOf([feature('alpha')]);
  const replies = byLabel({}); // no reply scripted → the stub returns null every call

  const { result, spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  // Exactly one respawn of the same prompt/opts before booking the stall.
  assert.equal(spawns.length, 2);
  assert.equal(spawns[0].opts.label, 'alpha');
  assert.equal(spawns[1].opts.agentType, spawns[0].opts.agentType);
  assert.equal(spawns[1].opts.label, spawns[0].opts.label);
  assert.equal(spawns[1].prompt, spawns[0].prompt);
  assert.ok(logs.some((l) => /retry 1\/1/.test(l) && l.includes('alpha')), 'retry is log-announced');

  assert.equal(result.stalled.length, 1);
  assert.equal(result.stalled[0].feature, 'alpha');
  assert.equal(result.stalled[0].agent, 'plan');
  const note = result.stalled[0].note;
  assert.ok(note.includes('alpha'), `note must carry opts.label; got: ${note}`);
  assert.ok(
    /user-skip|user skip/i.test(note) && /API|terminal/i.test(note),
    `note must name the user-skip vs terminal-API-failure ambiguity; got: ${note}`,
  );
  assert.notEqual(note, 'agent returned null', 'opaque literal must not be the stall note');
  assertEveryFeatureAccounted(result, args.scope);
});

test('a classified-transient throw retries once; success on retry lands the feature', async () => {
  const args = executionContextOf([feature('alpha')]);
  let planCalls = 0;
  const replies = (_prompt, opts) => {
    if (opts.agentType === 'plan' && opts.label === 'alpha') {
      planCalls += 1;
      if (planCalls === 1) {
        return { throws: new Error('API Error: Server error mid-response. The response above may be incomplete.') };
      }
      return { returns: { result: 'planned', workflow_path: 'small' } };
    }
    if (opts.agentType === 'build' && opts.label === 'alpha/feature') { return built('alpha/feature'); }
    if (opts.agentType === 'validate' && opts.label === 'alpha') { return validated('alpha'); }
  };

  const { result, spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  const planSpawns = spawns.filter((s) => s.opts.agentType === 'plan' && s.opts.label === 'alpha');
  assert.equal(planSpawns.length, 2, 'exactly one respawn of the plan spawn');
  assert.equal(planSpawns[1].prompt, planSpawns[0].prompt);
  assert.deepEqual(planSpawns[1].opts, planSpawns[0].opts);
  assert.ok(logs.some((l) => /retry 1\/1/.test(l)), 'retry is log-announced');
  assert.deepEqual(result.completed, ['alpha']);
  assert.deepEqual(result.stalled, []);
  assert.equal(result.halted, undefined);
  assertEveryFeatureAccounted(result, args.scope);
});

test('a classified-transient throw that fails again stalls with label and final error.message', async () => {
  const args = executionContextOf([feature('alpha')]);
  const transient = new Error('API Error: Server error mid-response. The response above may be incomplete.');
  const replies = byLabel({
    'plan:alpha': { throws: transient },
  });

  const { result, spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.equal(spawns.length, 2);
  assert.equal(spawns[1].opts.label, spawns[0].opts.label);
  assert.ok(logs.some((l) => /retry 1\/1/.test(l)));
  assert.equal(result.stalled.length, 1);
  assert.equal(result.stalled[0].feature, 'alpha');
  assert.equal(result.stalled[0].agent, 'plan');
  const note = result.stalled[0].note;
  assert.ok(note.includes('alpha'), `note must carry opts.label; got: ${note}`);
  assert.ok(note.includes(transient.message), `note must carry final error.message; got: ${note}`);
  assert.equal(result.halted, undefined);
  assertEveryFeatureAccounted(result, args.scope);
});

test('an ordinary non-transient throw is not retried and keeps a bare note', async () => {
  // Sibling of the multi-feature ordinary-error test: pins single-spawn + bare note
  // for a message the transient classifier must not match ('api hiccup').
  const args = executionContextOf([feature('alpha')]);
  const replies = byLabel({
    'plan:alpha': { throws: new Error('api hiccup') },
  });

  const { result, spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.equal(spawns.length, 1);
  assert.ok(logs.every((l) => !/retry/i.test(l)));
  assert.deepEqual(result.stalled, [{ feature: 'alpha', agent: 'plan', note: 'api hiccup' }]);
  assertEveryFeatureAccounted(result, args.scope);
});
