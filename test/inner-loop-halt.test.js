// The halt-and-stall leg of the Workflow's own acceptance (ADR-0029): the shim executes
// the real workflows/inner-loop.js, scripted with the run-level conditions no live spawn
// can be reasoned around locally — an environment-kind block from any phase, a thrown
// budget-exhaustion error, agent death (a null return), and an ordinary throw — and we
// assert the BoundaryResult's halted/stalled fields plus the spawn sequence each stops at.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runWorkflowScript } from './workflow-shim.js';

const SCRIPT = 'workflows/inner-loop.js';

// A stand-in for whatever real error identity a budget-exhausted spawn eventually throws
// (ADR-0029: "confirmed at the first live run") — matches workflow-shim.test.js's own
// stand-in convention.
class BudgetExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

function featureNode(id, overrides = {}) {
  return { id, status: 'designed', depends_on: [], interfaces: [], acceptance: [`${id} works`], ...overrides };
}

function slice(id) {
  return { node: { id, title: id, status: 'designed', acceptance: [`${id} works`] }, contracts: [] };
}

function perfectRun(id) {
  return [
    { returns: { result: 'planned', feature: id, tasks: [{ id: `${id}1`, status: 'pending', depends_on: [], size: 'xs' }] } },
    { returns: { result: 'built', task: `${id}/${id}1` } },
    { returns: { result: 'derived', feature: id, expectations: [], ambiguities: [] } },
    { returns: { result: 'perfect', feature: id } },
  ];
}

// ── criterion 1: an environment-kind blocked build return halts the run mid-feature,
// preserving completed and parked work already booked, before an environment-kind block
// ever fires — and never reaches a feature later in scope ──
test('an environment-kind blocked build return halts the run, preserving completed and parked booked so far', async () => {
  const args = {
    target: 'main',
    scope: ['alpha', 'beta', 'gamma', 'delta'],
    index: {
      designVersion: 1,
      features: [featureNode('alpha'), featureNode('beta'), featureNode('gamma'), featureNode('delta')],
    },
    slices: { alpha: slice('alpha'), beta: slice('beta'), gamma: slice('gamma'), delta: slice('delta') },
    plans: {},
    probe: {},
  };
  const budget = { spent: 2, remaining: 8 };
  const bounce = { result: 'bounce', kind: 'feature', feature: 'beta', deviation: 'contradictory contract', menu: ['re-slice'] };
  const gammaTasks = [
    { id: 'g1', status: 'pending', depends_on: [], size: 'xs' },
    { id: 'g2', status: 'pending', depends_on: ['g1'], size: 'xs' },
  ];
  const envBlock = { task: 'gamma/g1', result: 'blocked', kind: 'environment', detail: 'test harness precondition failed' };
  const agentReplies = [
    ...perfectRun('alpha'),
    { returns: bounce },
    { returns: { result: 'planned', feature: 'gamma', tasks: gammaTasks } },
    { returns: envBlock }, // gamma's g2 never spawns; delta never starts
  ];

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget });

  assert.deepEqual(spawns.map((s) => s.opts.phase), ['alpha', 'alpha', 'alpha', 'alpha', 'beta', 'gamma', 'gamma']);
  assert.deepEqual(result.completed, ['alpha']);
  assert.deepEqual(result.parked, [{ feature: 'beta', deviation: bounce.deviation, menu: bounce.menu }]);
  assert.deepEqual(result.halted, { reason: 'environment-blocked', detail: envBlock.detail });
  assert.deepEqual(result.budget, budget);
});

// ── criterion 1: derive's blocked return carries no `kind` field at all — the pinned
// convention treats any blocked return from derive as environment-shaped regardless ──
test('a blocked return from derive halts the run even though it carries no kind field', async () => {
  const args = {
    target: 'main',
    scope: ['alpha'],
    index: { designVersion: 1, features: [featureNode('alpha')] },
    slices: { alpha: slice('alpha') },
    plans: {},
    probe: {},
  };
  const budget = { spent: 0, remaining: 10 };
  const deriveBlocked = { feature: 'alpha', result: 'blocked', detail: 'args construction missing the probe binding' };
  const agentReplies = [
    { returns: { result: 'planned', feature: 'alpha', tasks: [{ id: 't1', status: 'pending', depends_on: [], size: 'xs' }] } },
    { returns: { result: 'built', task: 'alpha/t1' } },
    { returns: deriveBlocked },
  ];

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget });

  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['plan', 'build', 'derive']); // validate never spawns
  assert.deepEqual(result.halted, { reason: 'environment-blocked', detail: deriveBlocked.detail });
  assert.deepEqual(result.completed, []);
});

// ── criterion 2: a thrown error named for budget exhaustion halts the run, retaining
// prior completions — but an error whose message merely mentions "budget", without a
// matching name or code, never halts (message text alone is never the signal) ──
test('a thrown error named for budget exhaustion halts the run; message text alone never does', async () => {
  const args = {
    target: 'main',
    scope: ['alpha', 'beta'],
    index: { designVersion: 1, features: [featureNode('alpha'), featureNode('beta')] },
    slices: { alpha: slice('alpha'), beta: slice('beta') },
    plans: {},
    probe: {},
  };
  const budget = { spent: 5, remaining: 0 };
  const budgetError = new BudgetExceededError('budget exhausted at spawn 6');
  const agentReplies = [
    ...perfectRun('alpha'),
    { throws: budgetError },
  ];

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget });

  assert.deepEqual(spawns.map((s) => s.opts.phase), ['alpha', 'alpha', 'alpha', 'alpha', 'beta']);
  assert.deepEqual(result.completed, ['alpha']);
  assert.deepEqual(result.halted, { reason: 'budget-exhausted', detail: budgetError.message });
  assert.deepEqual(result.budget, budget);
});

test('an error whose message merely mentions budget, but isn\'t named or coded for it, stalls rather than halts', async () => {
  const args = {
    target: 'main',
    scope: ['alpha', 'beta'],
    index: { designVersion: 1, features: [featureNode('alpha'), featureNode('beta')] },
    slices: { alpha: slice('alpha'), beta: slice('beta') },
    plans: {},
    probe: {},
  };
  const budget = { spent: 0, remaining: 10 };
  const impostor = new Error('ran out of budget');
  const agentReplies = [
    { throws: impostor },
    ...perfectRun('beta'),
  ];

  const { result } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget });

  assert.equal(result.halted, undefined);
  assert.deepEqual(result.stalled, [{ feature: 'alpha', phase: 'plan', note: impostor.message }]);
  assert.deepEqual(result.completed, ['beta']);
});

// ── criterion 2: agent death (a null return) and any other ordinary throw each stall
// just their own feature — the run drains onward to the next runnable feature ──
test('a null return or any other thrown error stalls just that feature, and the run continues', async () => {
  const args = {
    target: 'main',
    scope: ['alpha', 'beta', 'gamma'],
    index: { designVersion: 1, features: [featureNode('alpha'), featureNode('beta'), featureNode('gamma')] },
    slices: { alpha: slice('alpha'), beta: slice('beta'), gamma: slice('gamma') },
    plans: {},
    probe: {},
  };
  const budget = { spent: 0, remaining: 10 };
  const crash = new Error('subprocess exited unexpectedly');
  const agentReplies = [
    { returns: null }, // alpha's plan agent died
    { throws: crash }, // beta's plan agent crashed with an ordinary error
    ...perfectRun('gamma'),
  ];

  const { result } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget });

  assert.deepEqual(result.stalled, [
    { feature: 'alpha', phase: 'plan', note: 'agent returned null' },
    { feature: 'beta', phase: 'plan', note: crash.message },
  ]);
  assert.deepEqual(result.completed, ['gamma']);
  assert.equal(result.halted, undefined);
});
