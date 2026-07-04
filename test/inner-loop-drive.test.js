// The drive-routing leg of the Workflow's own acceptance (executor-delegation): the shim
// executes the real workflows/inner-loop.js, scripted with a via-bound build.<tier>
// binding, and we assert the resulting spawn is routed to the drive agent — carrying
// BUILD_SCHEMA/phase unchanged from build's own spawn, the pinned four-line prompt, the
// pinned dual-model label, and the pinned routing log line — while a via: agent (or
// unbound) task keeps today's ordinary build spawn untouched.
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

function baseArgs(id, tasks, models) {
  return {
    target: 'main',
    scope: [id],
    index: { designVersion: 1, features: [featureNode(id)] },
    slices: { [id]: slice(id) },
    plans: {},
    probe: {},
    models,
  };
}

function perfectTail(id) {
  return [
    { returns: { result: 'derived', feature: id, expectations: [], ambiguities: [] } },
    { returns: { result: 'perfect', feature: id } },
  ];
}

// ── criterion 1: a via-bound build.<tier> binding spawns agentType drive, carrying
// BUILD_SCHEMA/phase unchanged from build's own spawn, the pinned four-line prompt, and
// the pinned dual-model label ──
test('a via-bound build.<tier> binding spawns agentType drive with the pinned prompt and label, schema/phase unchanged from build', async () => {
  const tasks = [{ id: 't1', status: 'pending', depends_on: [], size: 's' }];
  const args = baseArgs('alpha', tasks, {
    'build.standard': { model: 'grok-build', via: 'grok' },
    drive: { model: 'sonnet' },
  });
  const agentReplies = [
    { returns: { result: 'planned', feature: 'alpha', tasks } },
    { returns: { result: 'built', task: 'alpha/t1' } },
    ...perfectTail('alpha'),
  ];

  const { spawns } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget: { spent: 0, remaining: 10 } });

  const driveSpawn = spawns[1];
  assert.equal(driveSpawn.opts.agentType, 'drive');
  assert.equal(driveSpawn.opts.phase, 'alpha');
  assert.deepEqual(driveSpawn.opts.schema.properties.result.enum, ['built', 'blocked']); // BUILD_SCHEMA, unchanged
  assert.equal(driveSpawn.prompt, 'feature: alpha\ntask: t1\nexecutor: grok\nexecutor-model: grok-build');
  assert.equal(driveSpawn.opts.label, '[sonnet] drive:alpha/t1 via grok/grok-build');
});

// ── criterion 2: a drive.<via> table binding resolves the driver silently — no fallback
// or routing log ever names it as fallen back — and the executor model never rides the
// spawn's model opt (only the driver binding's model does) ──
test('a bound drive.<via> sub-role resolves the driver silently, and the executor model never rides the spawn model opt', async () => {
  const tasks = [{ id: 't1', status: 'pending', depends_on: [], size: 's' }];
  const args = baseArgs('alpha', tasks, {
    'build.standard': { model: 'grok-build', via: 'grok' },
    'drive.grok': { model: 'opus' },
  });
  const agentReplies = [
    { returns: { result: 'planned', feature: 'alpha', tasks } },
    { returns: { result: 'built', task: 'alpha/t1' } },
    ...perfectTail('alpha'),
  ];

  const { spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget: { spent: 0, remaining: 10 } });

  const driveSpawn = spawns[1];
  assert.equal(driveSpawn.opts.model, 'opus'); // the driver's own model, never the executor's
  assert.equal(driveSpawn.opts.label, '[opus] drive:alpha/t1 via grok/grok-build');
  assert.ok(logs.every((l) => !l.includes('role drive unbound')), 'a found drive.<via> binding never logs a fallback');
});

// ── criterion 2 (other way): absent a drive.<via> binding, the driver resolves through
// the ordinary roleBinding('drive'), including its logged session fallback when unbound ──
test('absent a drive.<via> binding, the driver falls back to the ordinary roleBinding(\'drive\'), logged when unbound', async () => {
  const tasks = [{ id: 't1', status: 'pending', depends_on: [], size: 's' }];
  const args = baseArgs('alpha', tasks, {
    'build.standard': { model: 'grok-build', via: 'grok' },
  });
  const agentReplies = [
    { returns: { result: 'planned', feature: 'alpha', tasks } },
    { returns: { result: 'built', task: 'alpha/t1' } },
    ...perfectTail('alpha'),
  ];

  const { spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget: { spent: 0, remaining: 10 } });

  const driveSpawn = spawns[1];
  assert.equal('model' in driveSpawn.opts, false, 'the session fallback passes no model opt');
  assert.equal(driveSpawn.opts.label, '[session] drive:alpha/t1 via grok/grok-build');
  assert.ok(logs.includes('model-selection — role drive unbound, session-model fallback'));
});

// ── criterion 3: exactly one pinned log line per routed task, and a via: agent binding
// spawns the ordinary build agentType, unaffected by routing ──
test('exactly one pinned routing log line appears per routed task, and via: agent keeps the ordinary build spawn', async () => {
  const tasks = [
    { id: 't1', status: 'pending', depends_on: [], size: 's', tier: 'rote' },
    { id: 't2', status: 'pending', depends_on: ['t1'], size: 's', tier: 'standard' },
  ];
  const args = baseArgs('alpha', tasks, {
    'build.rote': { model: 'grok-build', via: 'grok' },
    'build.standard': { model: 'sonnet', via: 'agent' },
  });
  const agentReplies = [
    { returns: { result: 'planned', feature: 'alpha', tasks } },
    { returns: { result: 'built', task: 'alpha/t1' } },
    { returns: { result: 'built', task: 'alpha/t2' } },
    ...perfectTail('alpha'),
  ];

  const { spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget: { spent: 0, remaining: 10 } });

  const routedLines = logs.filter((l) => l.startsWith('model-selection — task alpha/t1 routed via'));
  assert.deepEqual(routedLines, ['model-selection — task alpha/t1 routed via grok/grok-build, driver session']);
  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['plan', 'drive', 'build', 'derive', 'validate']);
  assert.equal(spawns[2].opts.label, '[sonnet] build:alpha/t2'); // via: agent — ordinary build spawn, unaffected
  assert.equal(spawns[2].prompt, 'feature: alpha\ntask: t2');
});

// ── criterion 4: a scripted drive return of blocked kind environment ends the run
// halted with reason environment-blocked — the existing spawn choke point, unmodified ──
test('a drive return of blocked kind environment halts the run with reason environment-blocked', async () => {
  const tasks = [{ id: 't1', status: 'pending', depends_on: [], size: 's' }];
  const args = baseArgs('alpha', tasks, { 'build.standard': { model: 'grok-build', via: 'grok' } });
  const driveBlocked = { task: 'alpha/t1', result: 'blocked', kind: 'environment', deviations: ['grok CLI unauthenticated'] };
  const agentReplies = [
    { returns: { result: 'planned', feature: 'alpha', tasks } },
    { returns: driveBlocked },
  ];

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget: { spent: 0, remaining: 10 } });

  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['plan', 'drive']);
  assert.deepEqual(result.halted, { reason: 'environment-blocked', detail: driveBlocked.deviations.join('; ') });
});
