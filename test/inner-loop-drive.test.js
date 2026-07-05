// The drive-routing leg (executor-delegation, ADR-0040): a via-bound build.<tier>
// binding routes the task's spawn to the drive agent — same BUILD_SCHEMA and phase,
// the executor named in the prompt's leading lines, model opts riding the driver's
// binding — while an unbound or via:agent task keeps the ordinary build spawn.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { byLabel, runWorkflowScript } from './workflow-shim.js';

const SCRIPT = 'workflows/inner-loop.js';

function snapshotOf(models) {
  const plan = { designVersion: 1, tasks: [
    { id: 't1', title: 'rote move', covers: [1], acceptance: ['t1'], footprint: ['a.js'], size: 'xs', tier: 'rote', depends_on: [] },
    { id: 't2', title: 'ordinary', covers: [1], acceptance: ['t2'], footprint: ['b.js'], size: 'xs', tier: 'standard', depends_on: ['t1'] },
  ] };
  return {
    target: 'main', scope: ['alpha'], probe: null, models,
    features: { alpha: {
      id: 'alpha', title: 'alpha title', acceptance: ['alpha works'], depends_on: [],
      designDoc: 'design doc for alpha', branch: 'loop/alpha', branchHead: null, plan, builtTasks: [],
    } },
  };
}

const BUDGET = { spent: 0, remaining: 10 };
const replies = byLabel({
  'drive:alpha/t1 via grok': { returns: { result: 'built', task: 'alpha/t1' } },
  'build:alpha/t2': { returns: { result: 'built', task: 'alpha/t2' } },
  'validate:alpha': { returns: { result: 'validated', feature: 'alpha' } },
});

test('a via-bound tier routes to the drive agent with the executor in the prompt and the drive.<via> sub-role binding riding the spawn', async () => {
  const args = snapshotOf({
    'build.rote': { model: 'grok-build', via: 'grok' },
    'build.standard': { model: 'sonnet' },
    'drive.grok': { model: 'haiku' },
  });

  const { result, spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  const drive = spawns.find((s) => s.opts.agentType === 'drive');
  assert.ok(drive, 'the rote task spawned the drive agent');
  assert.equal(drive.opts.label, '[haiku] drive:alpha/t1 via grok');
  assert.equal(drive.opts.model, 'haiku'); // the driver's binding, never the executor model
  assert.equal(drive.opts.phase, 'Build');
  assert.ok(drive.prompt.startsWith('executor: grok · executor-model: grok-build\n'));
  assert.ok(drive.prompt.includes('worktree create loop/alpha--t1'), 'the drive prompt carries the full build kernel');
  assert.ok(logs.includes('model-selection — task alpha/t1 routed via grok/grok-build, driver haiku'));

  const ordinary = spawns.find((s) => s.opts.agentType === 'build');
  assert.equal(ordinary.opts.label, '[sonnet] build:alpha/t2'); // an agent-bound tier is untouched
  assert.deepEqual(result.completed, ['alpha']);
});

test('without a drive.<via> sub-role the driver falls back to the drive role binding', async () => {
  const args = snapshotOf({
    'build.rote': { model: 'grok-build', via: 'grok' },
    'build.standard': { model: 'sonnet' },
    drive: { model: 'sonnet' },
  });

  const { spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  const drive = spawns.find((s) => s.opts.agentType === 'drive');
  assert.equal(drive.opts.label, '[sonnet] drive:alpha/t1 via grok');
  assert.ok(logs.every((l) => !l.includes('role drive.grok unbound')), 'the sub-role lookup is silent');
});
