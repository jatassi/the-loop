// The happy-path leg of the Workflow's own acceptance: the shim executes the real
// workflows/inner-loop.js, scripted with replies live Plan/Build/Validate spawns would
// return, and we assert the kernels pushed into prompts, the branch DAG, the ready-set
// scheduling, and the resulting BoundaryResult.
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
    target: 'main',
    scope: features.map((f) => f.id),
    probe: 'bring-up: node app · exercise: curl /health · teardown: kill',
    models: {},
    cli: 'node /plugin/bin/the-loop.js',
    features: Object.fromEntries(features.map((f) => [f.id, f])),
    ...overrides,
  };
}

const BUDGET = { spent: 1, remaining: 9 };
const validated = (id) => ({ returns: { result: 'validated', feature: id } });
const built = (task) => ({ returns: { result: 'built', task } });

// ── standard + small lanes, dependency scheduling, branch DAG, kernels ──
test('a dependency-linked pair runs Plan→Build→Validate per feature — standard lane on a task DAG, small lane whole — to a completed BoundaryResult', async () => {
  const alphaTasks = [ // deliberately out of dependency order — the DAG orders builds, not the array
    { id: 't2', title: 'wire it', covers: [1], acceptance: ['t2 passes'], footprint: ['src/b.js'], size: 's', depends_on: ['t1'], wiring: 't2 sits atop t1' },
    { id: 't1', title: 'core', covers: [1], acceptance: ['t1 passes'], footprint: ['src/a.js'], size: 's', depends_on: [] },
  ];
  const args = snapshotOf([feature('alpha'), feature('beta', { depends_on: ['alpha'] })]);
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'planned', lane: 'standard', tasks: alphaTasks } },
    'build:alpha/t1': built('alpha/t1'),
    'build:alpha/t2': built('alpha/t2'),
    'validate:alpha': validated('alpha'),
    'plan:beta': { returns: { result: 'planned', lane: 'small' } },
    'build:beta/feature': built('beta/feature'),
    'validate:beta': validated('beta'),
  });

  const { result, spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  const labels = spawns.map((s) => s.opts.label.replace(/^\[[^\]]*\] /, ''));
  assert.deepEqual(labels, [
    'plan:alpha', 'build:alpha/t1', 'build:alpha/t2', 'validate:alpha',
    'plan:beta', 'build:beta/feature', 'validate:beta',
  ]);
  assert.deepEqual(spawns.map((s) => s.opts.phase), ['Plan', 'Build', 'Build', 'Validate', 'Plan', 'Build', 'Validate']);

  const prompt = (label) => spawns[labels.indexOf(label)].prompt;
  // plan kernel: criteria numbered, design doc pushed, CLI path carried
  assert.ok(prompt('plan:alpha').includes('1. alpha works'));
  assert.ok(prompt('plan:alpha').includes('design doc for alpha'));
  assert.ok(prompt('plan:alpha').includes('node /plugin/bin/the-loop.js'));
  // build kernels: the branch DAG — t1 branches from the feature branch, t2 from t1's
  assert.ok(prompt('build:alpha/t1').includes('worktree create loop/alpha--t1 --from loop/alpha'));
  assert.ok(prompt('build:alpha/t2').includes('worktree create loop/alpha--t2 --from loop/alpha--t1'));
  assert.ok(prompt('build:alpha/t2').includes('commit subject: "alpha/t2:'));
  assert.ok(prompt('build:alpha/t2').includes('footprint (the lease — stay inside it): src/b.js'));
  assert.ok(prompt('build:alpha/t2').includes('wiring: t2 sits atop t1'));
  assert.ok(prompt('build:alpha/t2').includes('covers feature criteria: alpha works'));
  assert.ok(!prompt('build:alpha/t2').includes('design doc for alpha'), 'build kernels menu-reference the design doc, never inline it');
  // small lane: one whole-feature build straight off the target, design doc pushed
  assert.ok(prompt('build:beta/feature').includes('small lane'));
  assert.ok(prompt('build:beta/feature').includes('worktree create loop/beta --from main'));
  assert.ok(prompt('build:beta/feature').includes('design doc for beta'));
  // validate kernels: merge order over the branch DAG, probe pushed
  assert.ok(prompt('validate:alpha').includes('merge, in order: loop/alpha, loop/alpha--t1, loop/alpha--t2'));
  assert.ok(prompt('validate:alpha').includes('bring-up: node app'));
  assert.ok(prompt('validate:beta').includes('merge, in order: loop/beta'));

  assert.deepEqual(result, { completed: ['alpha', 'beta'], blocked: [], stalled: [], budget: BUDGET });
  assert.equal(logs.at(-1), JSON.stringify(result)); // the completion channel's belt-and-braces echo
});

// ── resume: a snapshot plan skips Plan; git-derived builtTasks skip their builds ──
test('a feature with a snapshot plan skips Plan and resumes Build at the first task git has not landed', async () => {
  const plan = { designVersion: 8, tasks: [
    { id: 'g1', title: 'done already', covers: [1], acceptance: ['g1'], footprint: ['a.js'], size: 'xs', depends_on: [] },
    { id: 'g2', title: 'remaining', covers: [1], acceptance: ['g2'], footprint: ['b.js'], size: 'xs', depends_on: ['g1'] },
  ] };
  const args = snapshotOf([feature('gamma', { plan, builtTasks: ['g1'] })]);
  const replies = byLabel({
    'build:gamma/g2': built('gamma/g2'),
    'validate:gamma': validated('gamma'),
  });

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['build', 'validate']); // no plan spawn, no g1 spawn
  assert.ok(spawns[0].prompt.includes('worktree create loop/gamma--g2 --from loop/gamma--g1'));
  assert.ok(spawns[1].prompt.includes('merge, in order: loop/gamma, loop/gamma--g1, loop/gamma--g2'));
  assert.deepEqual(result.completed, ['gamma']);
});

test('a small-lane feature whose branch head already carries its landing commit skips Build and goes straight to Validate', async () => {
  const args = snapshotOf([feature('delta', { branchHead: 'delta/feature: landed last run' })]);
  const replies = byLabel({
    'plan:delta': { returns: { result: 'planned', lane: 'small' } },
    'validate:delta': validated('delta'),
  });

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['plan', 'validate']);
  assert.deepEqual(result.completed, ['delta']);
});

// ── feature-level concurrency: independent features start together ──
test('independent in-scope features start concurrently — both Plan spawns land before any Build', async () => {
  const args = snapshotOf([feature('alpha'), feature('beta')]);
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'planned', lane: 'small' } },
    'plan:beta': { returns: { result: 'planned', lane: 'small' } },
    'build:alpha/feature': built('alpha/feature'),
    'build:beta/feature': built('beta/feature'),
    'validate:alpha': validated('alpha'),
    'validate:beta': validated('beta'),
  });

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(spawns.slice(0, 2).map((s) => s.opts.agentType), ['plan', 'plan'], 'both features planned before either built');
  assert.deepEqual(result.completed.toSorted((a, b) => a.localeCompare(b)), ['alpha', 'beta']);
});

// ── model routing: build.<tier> bindings, [model] label prefixes, session fallback ──
test('build spawns route through build.<tier> bindings and every label carries its resolved-model prefix', async () => {
  const tasks = [
    { id: 't1', title: 'hard', covers: [1], acceptance: ['t1'], footprint: ['a.js'], size: 's', tier: 'complex', depends_on: [] },
    { id: 't2', title: 'untiered', covers: [1], acceptance: ['t2'], footprint: ['b.js'], size: 's', depends_on: ['t1'] },
  ];
  const args = snapshotOf([feature('alpha')], {
    models: { 'build.complex': { model: 'opus' }, 'build.standard': { model: 'sonnet' }, validate: { model: 'sonnet', effort: 'high' } }, // plan deliberately unbound
  });
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'planned', lane: 'standard', tasks } },
    'build:alpha/t1': built('alpha/t1'),
    'build:alpha/t2': built('alpha/t2'),
    'validate:alpha': validated('alpha'),
  });

  const { result, spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  const optsByLabel = Object.fromEntries(spawns.map((s) => [s.opts.label, s.opts]));
  assert.equal('model' in optsByLabel['plan:alpha'], false, 'an unbound role passes no model opt');
  assert.equal(optsByLabel['build:alpha/t1'].model, 'opus');
  assert.equal('model' in optsByLabel['build:alpha/t2'], true, 'a tierless task routes build.standard');
  assert.equal(optsByLabel['validate:alpha'].effort, 'high', 'a bound effort rides the spawn');
  assert.ok(logs.includes('model-selection — role plan unbound, session-model fallback'));
  assert.ok(logs.includes('model-selection — task alpha/t2 has no tier, routing build.standard'));
  assert.deepEqual(result.completed, ['alpha']);
});
