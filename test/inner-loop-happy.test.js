// The happy-path leg of the Workflow's own acceptance (ADR-0029): the shim executes the
// real workflows/inner-loop.js, scripted with replies a live Plan/Build/Derive/Validate
// spawn would return, and we assert the spawn sequence and the resulting BoundaryResult.
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

// ── criteria 1–3: frontier + in-memory status updates, the full phase sequence with
// task ordering by depends_on, and the BoundaryResult echoed on both channels ──
test('a designed, dependency-linked pair runs Plan→Build→Derive→Validate per feature, in dependency order, to a completed BoundaryResult', async () => {
  const args = {
    target: 'main',
    scope: ['alpha', 'beta'],
    index: {
      designVersion: 1,
      features: [featureNode('alpha'), featureNode('beta', { depends_on: ['alpha'] })],
    },
    slices: { alpha: slice('alpha'), beta: slice('beta') },
    plans: {},
    probe: { bringUp: 'npm start' },
    models: { plan: { model: 'session' }, derive: { model: 'opus', effort: 'low' } }, // build/validate unbound — fallback
  };
  const budget = { spent: 1, remaining: 9 };

  const alphaTasks = [ // deliberately out of dependency order — proves depends_on ordering, not array order
    { id: 't2', status: 'pending', depends_on: ['t1'], size: 's' },
    { id: 't1', status: 'pending', depends_on: [], size: 's' },
  ];
  const agentReplies = [
    { returns: { result: 'planned', feature: 'alpha', tasks: alphaTasks } },
    { returns: { result: 'built', task: 'alpha/t1' } },
    { returns: { result: 'built', task: 'alpha/t2' } },
    { returns: { result: 'derived', feature: 'alpha', expectations: [{ criterion: 'alpha works', expect: 'alpha does the thing' }], ambiguities: [] } },
    { returns: { result: 'perfect', feature: 'alpha' } },
    { returns: { result: 'planned', feature: 'beta', tasks: [{ id: 'b1', status: 'pending', depends_on: [], size: 'xs' }] } },
    { returns: { result: 'built', task: 'beta/b1' } },
    { returns: { result: 'derived', feature: 'beta', expectations: [{ criterion: 'beta works', expect: 'beta does the thing' }], ambiguities: [] } },
    { returns: { result: 'perfect', feature: 'beta' } },
  ];

  const { result, spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget });

  const kinds = spawns.map((s) => s.opts.agentType);
  assert.deepEqual(kinds, ['plan', 'build', 'build', 'derive', 'validate', 'plan', 'build', 'derive', 'validate']);
  // plan is bound explicitly to the literal session model — no model opt rides, and no
  // fallback line logs (it's bound, not merely absent from the table).
  assert.equal(spawns[0].opts.label, '[session] plan:alpha');
  assert.equal('model' in spawns[0].opts, false, 'a session-bound role passes no model opt');
  assert.ok(logs.every((l) => !l.includes('role plan unbound')), 'a session-bound role never logs the unbound fallback line');
  // alpha's build tasks ran t1 then t2, despite the plan return listing t2 first —
  // untiered, so both fall back to build.standard, unbound (session) in this fixture.
  assert.equal(spawns[1].opts.label, '[session] build:alpha/t1');
  assert.equal(spawns[2].opts.label, '[session] build:alpha/t2');
  assert.deepEqual(spawns.map((s) => s.opts.phase), ['alpha', 'alpha', 'alpha', 'alpha', 'alpha', 'beta', 'beta', 'beta', 'beta']);
  assert.equal(spawns[3].opts.model, 'opus'); // derive resolves the bound model
  assert.equal(spawns[3].opts.effort, 'low'); // and its bound effort — no longer hardcoded
  assert.ok(spawns[3].prompt.includes(JSON.stringify(args.probe)), 'derive prompt carries the probe binding');
  assert.ok(spawns[3].prompt.includes(JSON.stringify(args.slices.alpha)), 'derive prompt carries the feature slice');
  assert.ok(spawns[4].prompt.includes('alpha does the thing'), 'validate prompt carries the expectation sheet');
  assert.ok(Array.isArray(spawns[4].opts.schema.properties.result.enum) && spawns[4].opts.schema.properties.result.enum.includes('perfect'), 'validate schema encodes its result enum as JSON Schema');

  assert.deepEqual(result, {
    completed: ['alpha', 'beta'],
    parked: [],
    stalled: [],
    budget: { spent: 1, remaining: 9 },
  });
  assert.equal(logs.at(-1), JSON.stringify(result)); // the completion channel's belt-and-braces echo
});

// ── criterion 4a: a feature already planned/building skips Plan, resumes Build from
// args.plans at the first non-built task, and still derives before validating. args.models
// is absent entirely here — every role falls back, proving the run still completes with
// fallback lines (model-selection criterion 2) rather than erroring ──
test('a building feature skips Plan, resumes Build from args.plans at the first non-built task, and still derives before validating', async () => {
  const args = {
    target: 'main',
    scope: ['gamma'],
    index: { designVersion: 1, features: [featureNode('gamma', { status: 'building' })] },
    slices: { gamma: slice('gamma') },
    plans: { gamma: [
      { id: 'g1', status: 'built', depends_on: [], size: 'xs' },
      { id: 'g2', status: 'pending', depends_on: ['g1'], size: 'xs' },
    ] },
    probe: {},
  };
  const budget = { spent: 0, remaining: 10 };
  const agentReplies = [
    { returns: { result: 'built', task: 'gamma/g2' } },
    { returns: { result: 'derived', feature: 'gamma', expectations: [], ambiguities: [] } },
    { returns: { result: 'perfect', feature: 'gamma' } },
  ];

  const { result, spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget });

  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['build', 'derive', 'validate']); // no plan spawn
  assert.equal(spawns[0].opts.label, '[session] build:gamma/g2'); // resumed at the first non-built task, unbound
  assert.ok(logs.includes('model-selection — task gamma/g2 has no tier, routing build.standard'), 'the untiered task logs its pinned line');
  assert.ok(logs.includes('model-selection — role build.standard unbound, session-model fallback'), 'the unbound role logs its pinned line');
  assert.deepEqual(result.completed, ['gamma']); // args.models absent entirely never errors the run
});

// ── criterion 4b: an in-scope feature that isn't runnable is skipped via log(), never
// an error — here, blocked by an unsatisfied dependency the run never advances ──
test('an in-scope feature whose dependency is unsatisfied is skipped with a log() line, never an error', async () => {
  const args = {
    target: 'main',
    scope: ['epsilon'],
    index: {
      designVersion: 1,
      features: [featureNode('epsilon', { depends_on: ['zeta'] }), featureNode('zeta')],
    },
    slices: { epsilon: slice('epsilon'), zeta: slice('zeta') },
    plans: {},
    probe: {},
  };
  const budget = { spent: 0, remaining: 10 };

  const { result, spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies: [], args, budget });

  assert.equal(spawns.length, 0);
  assert.ok(logs.some((l) => l.includes('epsilon')));
  assert.deepEqual(result, { completed: [], parked: [], stalled: [], budget: { spent: 0, remaining: 10 } });
});

// ── model-selection criteria 1/2/4: build spawns route through build.<tier> per the
// task summary's stamped tier (a complex task to build.complex's model, an untiered task
// to build.standard's), every label carries the [<model>] prefix — a bound build spawn
// and an unbound plan spawn — and TASK_SUMMARY's own schema describes tier so a plan
// return's stamped tier is never the field the harness silently drops ──
test('build spawns route through build.<tier> bindings from the task summary, and every label carries its resolved-model prefix', async () => {
  const args = {
    target: 'main',
    scope: ['alpha'],
    index: { designVersion: 1, features: [featureNode('alpha')] },
    slices: { alpha: slice('alpha') },
    plans: {},
    probe: {},
    models: { 'build.complex': { model: 'opus' }, 'build.standard': { model: 'sonnet' } }, // plan deliberately unbound
  };
  const budget = { spent: 0, remaining: 10 };
  const tasks = [
    { id: 't1', status: 'pending', depends_on: [], size: 's', tier: 'complex' },
    { id: 't2', status: 'pending', depends_on: ['t1'], size: 's' }, // untiered
  ];
  const agentReplies = [
    { returns: { result: 'planned', feature: 'alpha', tasks } },
    { returns: { result: 'built', task: 'alpha/t1' } },
    { returns: { result: 'built', task: 'alpha/t2' } },
    { returns: { result: 'derived', feature: 'alpha', expectations: [], ambiguities: [] } },
    { returns: { result: 'perfect', feature: 'alpha' } },
  ];

  const { result, spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget });

  assert.deepEqual(spawns[0].opts.schema.properties.tasks.items.properties.tier, { type: 'string' }, 'TASK_SUMMARY describes tier');
  assert.equal(spawns[0].opts.label, '[session] plan:alpha'); // plan is unbound in this fixture
  assert.equal(spawns[1].opts.label, '[opus] build:alpha/t1'); // complex tier routes build.complex
  assert.equal(spawns[1].opts.model, 'opus');
  assert.equal(spawns[2].opts.label, '[sonnet] build:alpha/t2'); // untiered routes build.standard
  assert.equal(spawns[2].opts.model, 'sonnet');
  assert.ok(logs.includes('model-selection — role plan unbound, session-model fallback'));
  assert.ok(logs.includes('model-selection — task alpha/t2 has no tier, routing build.standard'));
  assert.ok(!logs.includes('model-selection — task alpha/t1 has no tier, routing build.standard'), 't1 carries a tier — no untiered line for it');
  assert.deepEqual(result.completed, ['alpha']);
});
