// Oracle for batp-title-prefix — asserts the OBSERVABLE build/drive spawn-label behavior
// the acceptance criteria demand, by executing the real workflows/execution-pipeline.js
// under stub harness globals (the technique test/execution-pipeline-harness.js uses,
// inlined here so the oracle never leans on the candidate's own test files). Assertions
// read the recorded spawn labels directly, so a wrong implementation (bare labels, or an
// ordinal keyed off DAG build order instead of the declared task array) is still observed
// even when its replies fail to match. Copied to <fixture>/eval-oracle/, so the SCRIPT
// path is relative to the fixture root (cwd of `node --test`).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const SCRIPT = 'workflows/execution-pipeline.js';
const META_LINE = /^(\s*)export const meta\b/m;

// Run the workflow script with a reply table keyed by `agentType:label`; return every
// recorded spawn ({prompt, opts}).
async function runScript({ args, budget = { spent: 0, remaining: 10 }, replies = {} }) {
  const spawns = [];
  const agent = async (prompt, opts) => {
    spawns.push({ prompt, opts });
    const scripted = replies[`${opts.agentType}:${opts.label}`];
    return scripted ? scripted.returns : null;
  };
  const log = () => {};
  const parallel = () => { throw new Error('parallel() unused'); };
  const pipeline = () => { throw new Error('pipeline() unused'); };
  const body = readFileSync(SCRIPT, 'utf8').replace(META_LINE, '$1const meta');
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const run = new AsyncFunction('agent', 'parallel', 'pipeline', 'log', 'args', 'budget', body);
  await run(agent, parallel, pipeline, log, args, budget);
  return spawns;
}

const feature = (id, o = {}) => ({
  id, title: `${id} title`, acceptance: [`${id} works`], depends_on: [],
  designDoc: `design doc for ${id}`, branch: `loop/${id}`, branchHead: null, plan: null, builtTasks: [], ...o,
});
const contextOf = (features, o = {}) => ({
  target: 'main', scope: features.map((f) => f.id), probe: null, models: {}, agentNamespace: '',
  cli: 'node bin/the-loop.js', features: Object.fromEntries(features.map((f) => [f.id, f])), ...o,
});
const builds = (spawns) => spawns.filter((s) => s.opts.agentType === 'build' || s.opts.agentType === 'drive');
const buildFor = (spawns, taskId) => builds(spawns).find((s) => s.opts.label.includes(`alpha/${taskId}`));

// ── criterion 1 (2+-task feature → `(<pos>/<N>) <feature>/<task>`, pos = declared
// task-array slot) and criterion 4 (the ordinal lives only in the display label) ──
test('a 2-task feature prefixes each build label with its 1-based position in the declared task array — never the DAG build order — and the ordinal never enters the task brief', async () => {
  // Declared out of dependency order: t2 first (position 1), t1 second (position 2). The
  // DAG builds t1 before t2 — so a position keyed off build order would invert these.
  const tasks = [
    { id: 't2', title: 'wire', covers: [1], acceptance: ['t2 passes'], footprint: ['src/b.js'], size: 's', depends_on: ['t1'], wiring: 't2 sits atop t1' },
    { id: 't1', title: 'core', covers: [1], acceptance: ['t1 passes'], footprint: ['src/a.js'], size: 's', depends_on: [] },
  ];
  const args = contextOf([feature('alpha')]);
  const replies = {
    'plan:alpha': { returns: { result: 'planned', workflow_path: 'standard', tasks } },
    'build:(1/2) alpha/t2': { returns: { result: 'built', task: 'alpha/t2' } },
    'build:(2/2) alpha/t1': { returns: { result: 'built', task: 'alpha/t1' } },
    'validate:alpha': { returns: { result: 'validated', feature: 'alpha' } },
  };
  const spawns = await runScript({ args, replies });
  const t1 = buildFor(spawns, 't1');
  const t2 = buildFor(spawns, 't2');
  assert.ok(t1 && t2, 'both tasks spawned a build');
  assert.equal(t2.opts.label, '(1/2) alpha/t2'); // declared first → position 1
  assert.equal(t1.opts.label, '(2/2) alpha/t1'); // declared second → position 2
  // criterion 4: the task brief (branch DAG, commit subject) is unaffected by the prefix.
  assert.ok(t1.prompt.includes('worktree-create loop/alpha--t1 --base-branch loop/alpha'));
  assert.ok(t2.prompt.includes('worktree-create loop/alpha--t2 --base-branch loop/alpha--t1'));
  assert.ok(t2.prompt.includes('commit subject: "alpha/t2:'));
  assert.ok(!t2.prompt.includes('(1/2)'), 'the ordinal never bleeds into the task brief');
  assert.ok(!t1.prompt.includes('(2/2)'));
});

// ── criterion 3: an undivided build carries no ordinal — a small workflow path, and a
// standard plan that returned exactly one task, both stay the bare label (no `(1/1)`) ──
test('a single-task standard plan and a small-workflow build both carry the bare build label, never a redundant (1/1)', async () => {
  const singleTask = [{ id: 'only', title: 'sole', covers: [1], acceptance: ['only passes'], footprint: ['src/only.js'], size: 's', depends_on: [] }];
  const args = contextOf([feature('alpha'), feature('beta')]);
  const replies = {
    'plan:alpha': { returns: { result: 'planned', workflow_path: 'standard', tasks: singleTask } },
    'build:alpha/only': { returns: { result: 'built', task: 'alpha/only' } },
    'validate:alpha': { returns: { result: 'validated', feature: 'alpha' } },
    'plan:beta': { returns: { result: 'planned', workflow_path: 'small' } },
    'build:beta/feature': { returns: { result: 'built', task: 'beta/feature' } },
    'validate:beta': { returns: { result: 'validated', feature: 'beta' } },
  };
  const spawns = await runScript({ args, replies });
  const labels = builds(spawns).map((s) => s.opts.label).toSorted((a, b) => a.localeCompare(b));
  assert.deepEqual(labels, ['alpha/only', 'beta/feature']);
  assert.ok(labels.every((l) => !l.startsWith('(')), 'an undivided build carries no ordinal prefix');
});

// ── criterion 2: in a 2+-task feature, a task routing to a registered executor rides the
// same ordinal on its drive label — `(<pos>/<N>) <feature>/<task> via <executor>` ──
test('a rote task in a 2-task feature routes to drive with the ordinal on its drive label', async () => {
  const plan = { designVersion: 1, tasks: [
    { id: 't1', title: 'rote', covers: [1], acceptance: ['t1'], footprint: ['a.js'], size: 'xs', judgment_level: 'rote', depends_on: [] },
    { id: 't2', title: 'std', covers: [1], acceptance: ['t2'], footprint: ['b.js'], size: 'xs', judgment_level: 'standard', depends_on: ['t1'] },
  ] };
  const args = contextOf([feature('alpha', { plan })], {
    models: { 'build.rote': { model: 'grok-build', executor: 'grok' }, 'build.standard': { model: 'sonnet' }, 'drive.grok': { model: 'haiku' } },
  });
  const replies = {
    'drive:(1/2) alpha/t1 via grok': { returns: { result: 'built', task: 'alpha/t1' } },
    'build:(2/2) alpha/t2': { returns: { result: 'built', task: 'alpha/t2' } },
    'validate:alpha': { returns: { result: 'validated', feature: 'alpha' } },
  };
  const spawns = await runScript({ args, replies });
  const drive = spawns.find((s) => s.opts.agentType === 'drive');
  assert.ok(drive, 'the rote task routed to the drive agent');
  assert.equal(drive.opts.label, '(1/2) alpha/t1 via grok');
});
