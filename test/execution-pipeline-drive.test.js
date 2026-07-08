// The drive-routing leg (executor-delegation, ADR-0040): an executor-bound
// build.<judgment_level> binding routes the task's spawn to the drive agent — same
// BUILD_SCHEMA and phase, the executor named in the prompt's leading lines, model
// opts riding the drive binding — while an unbound or executor:agent task keeps the
// ordinary build spawn.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { byLabel, runWorkflowScript } from './execution-pipeline-harness.js';

const SCRIPT = 'workflows/execution-pipeline.js';

function executionContextOf(models) {
  const plan = { designVersion: 1, tasks: [
    { id: 't1', title: 'rote move', covers: [1], acceptance: ['t1'], footprint: ['a.js'], size: 'xs', judgment_level: 'rote', depends_on: [] },
    { id: 't2', title: 'ordinary', covers: [1], acceptance: ['t2'], footprint: ['b.js'], size: 'xs', judgment_level: 'standard', depends_on: ['t1'] },
  ] };
  return {
    target: 'main', scope: ['alpha'], probe: null, models, agentNamespace: '',
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

test('an executor-bound judgment_level routes to the drive agent with the executor in the prompt and the drive.<executor> sub-role binding riding the spawn', async () => {
  const args = executionContextOf({
    'build.rote': { model: 'grok-build', executor: 'grok' },
    'build.standard': { model: 'sonnet' },
    'drive.grok': { model: 'haiku' },
  });

  const { result, spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  const drive = spawns.find((s) => s.opts.agentType === 'drive');
  assert.ok(drive, 'the rote task spawned the drive agent');
  assert.equal(drive.opts.label, 'alpha/t1 via grok'); // bare — no agentType prefix (run-presentation)
  assert.equal(drive.opts.model, 'haiku'); // the drive binding, never the executor model
  assert.equal(drive.opts.phase, 'Build');
  assert.ok(drive.prompt.startsWith('executor: grok · executor-model: grok-build\n'));
  assert.ok(drive.prompt.includes('worktree-create loop/alpha--t1'), 'the drive prompt carries the full build task brief');
  assert.ok(logs.includes('model-selection — task alpha/t1 routed via grok/grok-build, drive haiku'));

  const ordinary = spawns.find((s) => s.opts.agentType === 'build');
  assert.equal(ordinary.opts.model, 'sonnet'); // an agent-bound judgment_level is untouched
  assert.deepEqual(result.completed, ['alpha']);
});

test('without a drive.<executor> sub-role the drive falls back to the drive role binding', async () => {
  const args = executionContextOf({
    'build.rote': { model: 'grok-build', executor: 'grok' },
    'build.standard': { model: 'sonnet' },
    drive: { model: 'sonnet' },
  });

  const { spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  const drive = spawns.find((s) => s.opts.agentType === 'drive');
  assert.equal(drive.opts.model, 'sonnet'); // the drive-role fallback binding, not the executor model
  assert.ok(logs.every((l) => !l.includes('role drive.grok unbound')), 'the sub-role lookup is silent');
});
