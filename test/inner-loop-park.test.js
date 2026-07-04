// The park-and-drain leg of the Workflow's own acceptance (ADR-0029): the shim executes
// the real workflows/inner-loop.js, scripted with the typed feature-shaped blocks a live
// Plan/Build/Validate spawn can return, and we assert both the parked entries and the
// spawn sequence — proving a park stops that feature's own phases without halting the run.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runWorkflowScript } from './workflow-shim.js';

const SCRIPT = 'workflows/inner-loop.js';

function featureNode(id, overrides = {}) {
  return { id, status: 'designed', depends_on: [], interfaces: [], acceptance: [`${id} works`], ...overrides };
}

function slice(id) {
  return { node: { id, title: id, status: 'designed', acceptance: [`${id} works`] }, contracts: [] };
}

// ── criterion 1: a plan bounce parks the feature carrying the agent's menu verbatim,
// and the run continues on to an independent, in-scope feature ──
test('a plan bounce parks the feature with its deviation and menu carried verbatim, and the run continues', async () => {
  const args = {
    target: 'main',
    scope: ['alpha', 'beta'],
    index: { designVersion: 1, features: [featureNode('alpha'), featureNode('beta')] },
    slices: { alpha: slice('alpha'), beta: slice('beta') },
    plans: {},
    probe: {},
  };
  const budget = { spent: 0, remaining: 10 };
  const bounce = { result: 'bounce', kind: 'feature', feature: 'alpha', deviation: 'the contract contradicts itself', menu: ['re-slice the feature', 'revisit the design'] };
  const agentReplies = [
    { returns: bounce },
    { returns: { result: 'planned', feature: 'beta', tasks: [{ id: 'b1', status: 'pending', depends_on: [], size: 'xs' }] } },
    { returns: { result: 'built', task: 'beta/b1' } },
    { returns: { result: 'derived', feature: 'beta', expectations: [], ambiguities: [] } },
    { returns: { result: 'perfect', feature: 'beta' } },
  ];

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget });

  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['plan', 'plan', 'build', 'derive', 'validate']);
  assert.deepEqual(spawns.map((s) => s.opts.phase), ['Plan', 'Plan', 'Build', 'Validate', 'Validate']);
  assert.deepEqual(spawns.map((s) => s.opts.label), [
    '[session] plan:alpha',
    '[session] plan:beta',
    '[session] build:beta/b1',
    '[session] derive:beta',
    '[session] validate:beta',
  ]);
  assert.deepEqual(result.parked, [{ feature: 'alpha', deviation: bounce.deviation, menu: bounce.menu }]);
  assert.deepEqual(result.completed, ['beta']);
  assert.deepEqual(result.stalled, []);
});

// ── criterion 2a: a feature-kind blocked build return parks the feature — the first
// block stops further task spawns for it, and no derive/validate phase follows ──
test('a feature-kind blocked build return parks the feature and spawns no further tasks for it', async () => {
  const args = {
    target: 'main',
    scope: ['alpha'],
    index: { designVersion: 1, features: [featureNode('alpha')] },
    slices: { alpha: slice('alpha') },
    plans: {},
    probe: {},
  };
  const budget = { spent: 0, remaining: 10 };
  // deliberately out of dependency order, matching the happy-path fixture's convention
  const tasks = [
    { id: 't2', status: 'pending', depends_on: ['t1'], size: 's' },
    { id: 't1', status: 'pending', depends_on: [], size: 's' },
  ];
  const blocked = { task: 'alpha/t1', result: 'blocked', kind: 'feature', deviations: ['the contract contradicts itself'], menu: ['fix the contract', 're-plan the task'] };
  const agentReplies = [
    { returns: { result: 'planned', feature: 'alpha', tasks } },
    { returns: blocked },
  ];

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget });

  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['plan', 'build']); // t2 never spawns, nor derive/validate
  assert.equal(spawns[1].opts.label, '[session] build:alpha/t1'); // untiered, unbound — session fallback
  assert.deepEqual(result.parked, [{ feature: 'alpha', deviation: 'the contract contradicts itself', menu: blocked.menu }]);
  assert.deepEqual(result.completed, []);
});

// ── criterion 2b (t11) / t15 fold-back: a validate deviation return parks the feature,
// sourcing the pinned { feature, deviation, menu } shape from the deviation/menu fields
// the validate-park seam fix (t15) guarantees on that verdict — never a bare {feature} ──
test('a validate deviation return parks the feature with its deviation and menu carried verbatim', async () => {
  const args = {
    target: 'main',
    scope: ['alpha'],
    index: { designVersion: 1, features: [featureNode('alpha')] },
    slices: { alpha: slice('alpha') },
    plans: {},
    probe: {},
  };
  const budget = { spent: 0, remaining: 10 };
  const deviation = {
    result: 'deviation', feature: 'alpha', design_version: 1, patch_id: 'abc', merged: false,
    deviation: 'the runtime leg found a contract-breaking regression', menu: ['fix and resubmit for validation', 'waive the obligation with a human approver'],
  };
  const agentReplies = [
    { returns: { result: 'planned', feature: 'alpha', tasks: [{ id: 't1', status: 'pending', depends_on: [], size: 'xs' }] } },
    { returns: { result: 'built', task: 'alpha/t1' } },
    { returns: { result: 'derived', feature: 'alpha', expectations: [], ambiguities: [] } },
    { returns: deviation },
  ];

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget });

  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['plan', 'build', 'derive', 'validate']);
  assert.deepEqual(result.completed, []);
  assert.deepEqual(result.parked, [{ feature: 'alpha', deviation: deviation.deviation, menu: deviation.menu }]);
});

// ── t15 fold-back finding 2: a feature-shaped validate readiness block (a semantic
// rebase conflict) reaches the script as an ordinary `blocked`/`kind: feature` return —
// it must join `parked` (carrying the return's own detail/menu) and let the run drain to
// an independent feature, while a `kind: environment` block from validate still halts,
// exactly as any other phase's environment block does ──
test('a validate blocked return with kind feature parks and drains; kind environment still halts', async () => {
  const budget = { spent: 0, remaining: 10 };

  // feature-kind: alpha parks, beta still completes in the same run
  const featureBlock = {
    result: 'blocked', feature: 'alpha', kind: 'feature',
    detail: 'the rebase hit a semantic conflict outside the union rule', menu: ['re-plan the conflicting task', 'waive with a human approver'],
  };
  const featureArgs = {
    target: 'main',
    scope: ['alpha', 'beta'],
    index: { designVersion: 1, features: [featureNode('alpha'), featureNode('beta')] },
    slices: { alpha: slice('alpha'), beta: slice('beta') },
    plans: {},
    probe: {},
  };
  const featureReplies = [
    { returns: { result: 'planned', feature: 'alpha', tasks: [{ id: 't1', status: 'pending', depends_on: [], size: 'xs' }] } },
    { returns: { result: 'built', task: 'alpha/t1' } },
    { returns: { result: 'derived', feature: 'alpha', expectations: [], ambiguities: [] } },
    { returns: featureBlock },
    { returns: { result: 'planned', feature: 'beta', tasks: [{ id: 'b1', status: 'pending', depends_on: [], size: 'xs' }] } },
    { returns: { result: 'built', task: 'beta/b1' } },
    { returns: { result: 'derived', feature: 'beta', expectations: [], ambiguities: [] } },
    { returns: { result: 'perfect', feature: 'beta' } },
  ];
  const { result: featureResult } = await runWorkflowScript(SCRIPT, { agentReplies: featureReplies, args: featureArgs, budget });

  assert.deepEqual(featureResult.parked, [{ feature: 'alpha', deviation: featureBlock.detail, menu: featureBlock.menu }]);
  assert.deepEqual(featureResult.completed, ['beta']);
  assert.deepEqual(featureResult.stalled, []);

  // environment-kind: gamma halts the run; delta never spawns
  const envBlock = { result: 'blocked', feature: 'gamma', kind: 'environment', detail: 'the probe precondition failed to bring up' };
  const envArgs = {
    target: 'main',
    scope: ['gamma', 'delta'],
    index: { designVersion: 1, features: [featureNode('gamma'), featureNode('delta')] },
    slices: { gamma: slice('gamma'), delta: slice('delta') },
    plans: {},
    probe: {},
  };
  const envReplies = [
    { returns: { result: 'planned', feature: 'gamma', tasks: [{ id: 'g1', status: 'pending', depends_on: [], size: 'xs' }] } },
    { returns: { result: 'built', task: 'gamma/g1' } },
    { returns: { result: 'derived', feature: 'gamma', expectations: [], ambiguities: [] } },
    { returns: envBlock },
  ];
  const { result: envResult, spawns: envSpawns } = await runWorkflowScript(SCRIPT, { agentReplies: envReplies, args: envArgs, budget });

  assert.deepEqual(envResult.halted, { reason: 'environment-blocked', detail: envBlock.detail });
  assert.deepEqual(envSpawns.map((s) => s.opts.phase), ['Plan', 'Build', 'Validate', 'Validate']); // delta never spawns
  assert.deepEqual(envSpawns.map((s) => s.opts.label), [
    '[session] plan:gamma',
    '[session] build:gamma/g1',
    '[session] derive:gamma',
    '[session] validate:gamma',
  ]); // delta appears in none of them
  assert.deepEqual(envResult.completed, []);
});

// ── criterion 3: a parked feature's in-scope dependent never spawns (transitive
// exclusion via frontier semantics), while an independent in-scope feature still runs
// to completion in the same run — the drain, asserted on the spawn sequence ──
test('a dependent of a parked feature never spawns, while an independent feature still completes — the drain', async () => {
  const args = {
    target: 'main',
    scope: ['alpha', 'beta', 'gamma'],
    index: {
      designVersion: 1,
      features: [featureNode('alpha'), featureNode('beta', { depends_on: ['alpha'] }), featureNode('gamma')],
    },
    slices: { alpha: slice('alpha'), beta: slice('beta'), gamma: slice('gamma') },
    plans: {},
    probe: {},
  };
  const budget = { spent: 0, remaining: 10 };
  const bounce = { result: 'bounce', kind: 'feature', feature: 'alpha', deviation: 'irreducible as designed', menu: ['re-slice', 'revisit design'] };
  const agentReplies = [
    { returns: bounce },
    // beta is skipped by the frontier before any spawn — no reply scripted for it
    { returns: { result: 'planned', feature: 'gamma', tasks: [{ id: 'g1', status: 'pending', depends_on: [], size: 'xs' }] } },
    { returns: { result: 'built', task: 'gamma/g1' } },
    { returns: { result: 'derived', feature: 'gamma', expectations: [], ambiguities: [] } },
    { returns: { result: 'perfect', feature: 'gamma' } },
  ];

  const { result, spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget });

  assert.deepEqual(spawns.map((s) => s.opts.phase), ['Plan', 'Plan', 'Build', 'Validate', 'Validate']); // beta contributes none
  assert.deepEqual(spawns.map((s) => s.opts.label), [
    '[session] plan:alpha',
    '[session] plan:gamma',
    '[session] build:gamma/g1',
    '[session] derive:gamma',
    '[session] validate:gamma',
  ]); // beta never appears — the drain excludes the parked feature's dependent
  assert.ok(logs.some((l) => l.includes('beta')), 'beta was skipped via a log() line, never an error');
  assert.deepEqual(result.completed, ['gamma']);
  assert.deepEqual(result.parked, [{ feature: 'alpha', deviation: bounce.deviation, menu: bounce.menu }]);
  assert.deepEqual(result.stalled, []);
});

// ── t8: kind-stamped { resolution, option } menu items are declared in each phase's
// own schema and relayed to BoundaryResult.parked verbatim — no menu transformation
// is added to the script itself ──
function menuAcceptsKindStamped(schema) {
  const arms = schema.properties.menu.items.anyOf ?? [];
  return arms.some((arm) => arm.type === 'object' && arm.required?.includes('option')
    && arm.properties?.resolution?.type === 'string' && arm.properties?.option?.type === 'string');
}

test('a plan bounce with a kind-stamped menu parks the feature carrying it verbatim', async () => {
  const args = {
    target: 'main',
    scope: ['alpha'],
    index: { designVersion: 1, features: [featureNode('alpha')] },
    slices: { alpha: slice('alpha') },
    plans: {},
    probe: {},
  };
  const budget = { spent: 0, remaining: 10 };
  const menu = [{ resolution: 're-plan', option: 're-slice the feature' }, { resolution: 'defer', option: 'revisit the design' }];
  const bounce = { result: 'bounce', kind: 'feature', feature: 'alpha', deviation: 'the contract contradicts itself', menu };

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies: [{ returns: bounce }], args, budget });

  assert.ok(menuAcceptsKindStamped(spawns[0].opts.schema), 'the plan schema accepts a kind-stamped menu item');
  assert.deepEqual(result.parked, [{ feature: 'alpha', deviation: bounce.deviation, menu }]);
});

test('a feature-kind blocked build return with a kind-stamped menu parks the feature carrying it verbatim', async () => {
  const args = {
    target: 'main',
    scope: ['alpha'],
    index: { designVersion: 1, features: [featureNode('alpha')] },
    slices: { alpha: slice('alpha') },
    plans: {},
    probe: {},
  };
  const budget = { spent: 0, remaining: 10 };
  const menu = [{ resolution: 'fix-in-place', option: 'fix the contract' }, { resolution: 're-plan', option: 're-plan the task' }];
  const blocked = { task: 'alpha/t1', result: 'blocked', kind: 'feature', deviations: ['the contract contradicts itself'], menu };
  const agentReplies = [
    { returns: { result: 'planned', feature: 'alpha', tasks: [{ id: 't1', status: 'pending', depends_on: [], size: 's' }] } },
    { returns: blocked },
  ];

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget });

  assert.ok(menuAcceptsKindStamped(spawns[1].opts.schema), 'the build schema accepts a kind-stamped menu item');
  assert.deepEqual(result.parked, [{ feature: 'alpha', deviation: 'the contract contradicts itself', menu }]);
});

test('a validate deviation return with a kind-stamped menu parks the feature carrying it verbatim', async () => {
  const args = {
    target: 'main',
    scope: ['alpha'],
    index: { designVersion: 1, features: [featureNode('alpha')] },
    slices: { alpha: slice('alpha') },
    plans: {},
    probe: {},
  };
  const budget = { spent: 0, remaining: 10 };
  const menu = [{ resolution: 'fix-in-place', option: 'fix and resubmit for validation' }, { resolution: 'waive', option: 'waive the obligation with a human approver' }];
  const deviation = {
    result: 'deviation', feature: 'alpha', design_version: 1, patch_id: 'abc', merged: false,
    deviation: 'the runtime leg found a contract-breaking regression', menu,
  };
  const agentReplies = [
    { returns: { result: 'planned', feature: 'alpha', tasks: [{ id: 't1', status: 'pending', depends_on: [], size: 'xs' }] } },
    { returns: { result: 'built', task: 'alpha/t1' } },
    { returns: { result: 'derived', feature: 'alpha', expectations: [], ambiguities: [] } },
    { returns: deviation },
  ];

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget });

  assert.ok(menuAcceptsKindStamped(spawns[3].opts.schema), 'the validate schema accepts a kind-stamped menu item');
  assert.deepEqual(result.parked, [{ feature: 'alpha', deviation: deviation.deviation, menu }]);
});
