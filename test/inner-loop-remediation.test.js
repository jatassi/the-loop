// The remediation-round leg of the Workflow's own acceptance (ADR-0029): the shim
// executes the real workflows/inner-loop.js, scripted with a remediation-pending verdict
// and the bounded round-2 build+re-validate it triggers — asserting the spawn sequence
// (the deriver never respawns; the pass-1 expectation sheet is reused verbatim), both
// round-2 outcomes reaching the BoundaryResult, and the protocol-violation stall that
// stops a second remediation-pending from ever looping.
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

function baseArgs(ids) {
  return {
    target: 'main',
    scope: ids,
    index: { designVersion: 1, features: ids.map((id) => featureNode(id)) },
    slices: Object.fromEntries(ids.map((id) => [id, slice(id)])),
    plans: {},
    probe: {},
  };
}

// pass-1 through Plan/Build/Derive, then a remediation-pending verdict naming the round
// task; the caller supplies what round 2's validate reply should be.
function remediationRun(id, round2Reply) {
  return [
    { returns: { result: 'planned', feature: id, tasks: [{ id: `${id}1`, status: 'pending', depends_on: [], size: 'xs' }] } },
    { returns: { result: 'built', task: `${id}/${id}1` } },
    { returns: { result: 'derived', feature: id, expectations: [`${id} does the thing`], ambiguities: [] } },
    { returns: { result: 'remediation-pending', feature: id, remediation_task: 'remediation', design_version: 1, patch_id: 'p1' } },
    { returns: { result: 'built', task: `${id}/remediation` } },
    round2Reply,
  ];
}

// ── criterion 1: a remediation-pending verdict spawns a build for the named
// remediation_task, then re-validates — the deriver is never respawned, and the pass-1
// expectation sheet rides both validate calls verbatim ──
test('a remediation-pending verdict spawns the remediation build then re-validates, without respawning the deriver', async () => {
  const args = baseArgs(['alpha']);
  const budget = { spent: 0, remaining: 10 };
  const agentReplies = remediationRun('alpha', { returns: { result: 'perfect', feature: 'alpha', design_version: 1, patch_id: 'p2' } });

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget });

  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['plan', 'build', 'derive', 'validate', 'build', 'validate']);
  assert.equal(spawns[4].opts.label, 'build:alpha/remediation');
  const validatePrompts = spawns.filter((s) => s.opts.agentType === 'validate').map((s) => s.prompt);
  assert.equal(validatePrompts[0], validatePrompts[1]);
  assert.deepEqual(result.completed, ['alpha']);
});

// ── criterion 2: a round-2 perfect completes the feature and a round-2 deviation parks
// it, each reflected in the BoundaryResult ──
test('a round-2 perfect completes the feature and a round-2 deviation parks it', async () => {
  const args = baseArgs(['alpha', 'beta']);
  const budget = { spent: 0, remaining: 10 };
  const agentReplies = [
    ...remediationRun('alpha', { returns: { result: 'perfect', feature: 'alpha' } }),
    ...remediationRun('beta', { returns: { result: 'deviation', feature: 'beta', design_version: 1, patch_id: 'q1', merged: false } }),
  ];

  const { result } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget });

  assert.deepEqual(result.completed, ['alpha']);
  assert.equal(result.parked.length, 1);
  assert.equal(result.parked[0].feature, 'beta');
});

// ── criterion 3: a second remediation-pending on the same feature is a protocol
// violation — stalled, never looped into a third build/validate round ──
test('a second remediation-pending on the same feature stalls with a protocol-violation note, never loops', async () => {
  const args = baseArgs(['alpha']);
  const budget = { spent: 0, remaining: 10 };
  const secondRemediation = { result: 'remediation-pending', feature: 'alpha', remediation_task: 'remediation' };
  const agentReplies = remediationRun('alpha', { returns: secondRemediation });

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies, args, budget });

  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['plan', 'build', 'derive', 'validate', 'build', 'validate']);
  assert.deepEqual(result.stalled, [
    { feature: 'alpha', phase: 'validate', note: 'a second remediation-pending on the same feature — protocol violation' },
  ]);
  assert.deepEqual(result.completed, []);
  assert.equal(result.halted, undefined);
});
