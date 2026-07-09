// The calibration-capture leg (ADR-0046): after the run summary is assembled the script
// spawns the `record` agent to transcribe a byte-final YAML payload the script computed
// as a pure function of what it observed. These tests drive the real
// workflows/execution-pipeline.js through the harness and pin: the deterministic payload
// (same observations → byte-identical string), that a not-fully-green run still records,
// that a budget-exhausted halt skips the spawn with one log line, that a record-spawn
// failure leaves the run summary byte-identical, and that the plan prompt carries the
// calibration digest only when the execution context supplies one.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { byLabel, runWorkflowScript } from './execution-pipeline-harness.js';

const SCRIPT = 'plugin/workflows/execution-pipeline.js';

function feature(id, overrides = {}) {
  return {
    id, title: `${id} title`, acceptance: [`${id} works`], depends_on: [],
    designDoc: `design doc for ${id}`, branch: `loop/${id}`, branchHead: null,
    plan: null, builtTasks: [], ...overrides,
  };
}

// A calibration-era execution context: prepare-execution-context always stamps
// `preparedAt` (the script's only clock), so capture is live. `record` is bound so the
// record spawn resolves without a session-model fallback log muddying the assertions.
function executionContextOf(features, overrides = {}) {
  return {
    target: 'main',
    scope: features.map((f) => f.id),
    probe: null,
    models: { record: { model: 'haiku' } },
    agentNamespace: '', // bare agent types
    preparedAt: '2026-07-08T14:02:11Z',
    features: Object.fromEntries(features.map((f) => [f.id, f])),
    ...overrides,
  };
}

const BUDGET = { spent: 5, remaining: 5 };
const validated = (id) => ({ returns: { result: 'validated', feature: id } });
const built = (task) => ({ returns: { result: 'built', task } });
const recordSpawn = (spawns) => spawns.find((s) => s.opts.phase === 'Record');
const calibrationLogs = (logs) => logs.filter((l) => l.startsWith('calibration —'));
const planPromptOf = (run) => run.spawns.find((s) => s.opts.phase === 'Plan').prompt;

class BudgetExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

// A serial single feature, standard workflow path, two chained tasks, validated — the
// canonical happy shape whose observed payload we pin byte-for-byte.
const alphaTasks = [
  { id: 't1', title: 'core', covers: [1], acceptance: ['t1'], footprint: ['src/a.js', 'test/a.test.js'], size: 's', judgment_level: 'standard', depends_on: [] },
  { id: 't2', title: 'wire', covers: [1], acceptance: ['t2'], footprint: ['src/b.js'], size: 'm', judgment_level: 'complex', depends_on: ['t1'] },
];
const validatedAlphaReplies = byLabel({
  'plan:alpha': { returns: { result: 'planned', workflow_path: 'standard', tasks: alphaTasks } },
  'build:(1/2) alpha/t1': built('alpha/t1'),
  'build:(2/2) alpha/t2': built('alpha/t2'),
  'validate:alpha': validated('alpha'),
});

const EXPECTED_PAYLOAD = [
  'run:',
  '  prepared_at: 2026-07-08T14:02:11Z',
  '  target: main',
  '  scope: [alpha]',
  '  tokens:',
  '    spent: 5',
  '    by_role: { plan: 0, build: 0, drive: 0, validate: 0 }',
  '    attribution: serial',
  '  halted: ~',
  'features:',
  '  - id: alpha',
  '    workflow_path: standard',
  '    outcome: validated',
  '    reason: ~',
  '    reslice: ~',
  '    agents: { plan: 1, build: 2, drive: 0, validate: 1 }',
  '    tasks:',
  '      - { id: t1, size: s, judgment_level: standard, footprint: [src/a.js, test/a.test.js] }',
  '      - { id: t2, size: m, judgment_level: complex, footprint: [src/b.js] }',
  '    actual:',
  '      files_touched: null',
  '      insertions: null',
  '      deletions: null',
  '      commits: null',
  '      duration_minutes: null',
].join('\n');

// ── criterion 2: recordPayload is a pure deterministic function of the observations —
// two runs of the same script scripted identically produce a byte-identical payload,
// and it is the exact YAML the record agent receives verbatim ──
test('the record payload is byte-identical across identical runs and matches the pinned YAML', async () => {
  const args = executionContextOf([feature('alpha')]);
  const run1 = await runWorkflowScript(SCRIPT, { agentReplies: validatedAlphaReplies, args, budget: BUDGET });
  const run2 = await runWorkflowScript(SCRIPT, { agentReplies: validatedAlphaReplies, args, budget: BUDGET });

  const payload1 = recordSpawn(run1.spawns);
  const payload2 = recordSpawn(run2.spawns);
  assert.ok(payload1, 'a record agent was spawned in phase Record');
  assert.equal(payload1.opts.label, 'record');
  assert.equal(payload1.opts.agentType, 'record');
  assert.equal(payload1.prompt, EXPECTED_PAYLOAD);
  assert.equal(payload2.prompt, payload1.prompt); // deterministic: same observations → same bytes
});

// ── criterion 1: two independent features run concurrently, so the attribution flag on
// the payload is `overlapped` rather than `serial` ──
test('a run whose spawns overlap tags the token attribution overlapped', async () => {
  const args = executionContextOf([feature('alpha'), feature('beta')]); // no dependency: they overlap
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'planned', workflow_path: 'small' } },
    'build:alpha/feature': built('alpha/feature'),
    'validate:alpha': validated('alpha'),
    'plan:beta': { returns: { result: 'planned', workflow_path: 'small' } },
    'build:beta/feature': built('beta/feature'),
    'validate:beta': validated('beta'),
  });

  const { spawns } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.match(recordSpawn(spawns).prompt, /attribution: overlapped/);
});

// ── criterion 3 (capture on a not-fully-green run): a feature that blocks still lands its
// record; the payload carries the blocked outcome, the block reason, and the re-slice
// detail from the plan's needs_refinement ──
test('a blocked run still spawns the record, capturing the blocked outcome and re-slice detail', async () => {
  const args = executionContextOf([feature('alpha')]);
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'needs_refinement', detail: 'two criteria contradict', options: ['split it'] } },
  });

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(result.blocked, [{ feature: 'alpha', reason: 'two criteria contradict', options: ['split it'] }]);
  const payload = recordSpawn(spawns);
  assert.ok(payload, 'the record agent was spawned despite the block');
  assert.match(payload.prompt, /outcome: blocked/);
  assert.match(payload.prompt, /reason: "two criteria contradict"/);
  assert.match(payload.prompt, /reslice: "two criteria contradict"/);
});

// ── criterion 3 (budget-exhausted skip): a budget-named throw halts the run; a further
// spawn would just throw, so capture is skipped with exactly one log line and no record
// spawn, and the run summary is untouched ──
test('a budget-exhausted halt skips the record spawn with exactly one log line', async () => {
  const args = executionContextOf([feature('alpha')]);
  const replies = byLabel({ 'plan:alpha': { throws: new BudgetExceededError('spend cap reached') } });

  const { result, spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(result.halted, { reason: 'budget-exhausted', detail: 'spend cap reached' });
  assert.equal(recordSpawn(spawns), undefined, 'no record agent is spawned after a budget-exhausted halt');
  assert.deepEqual(calibrationLogs(logs), ['calibration — record skipped: budget-exhausted halt would throw on a further spawn']);
});

// ── criterion 3 (record failure never touches the completion channel): a record spawn
// that throws logs exactly one line and returns the run summary byte-identical ──
test('a record-spawn failure logs one line and leaves the run summary byte-identical', async () => {
  const args = executionContextOf([feature('alpha')]);
  const failing = byLabel({
    'plan:alpha': { returns: { result: 'planned', workflow_path: 'standard', tasks: alphaTasks } },
    'build:(1/2) alpha/t1': built('alpha/t1'),
    'build:(2/2) alpha/t2': built('alpha/t2'),
    'validate:alpha': validated('alpha'),
    'record:record': { throws: new Error('worktree add failed') },
  });

  const failed = await runWorkflowScript(SCRIPT, { agentReplies: failing, args, budget: BUDGET });
  const clean = await runWorkflowScript(SCRIPT, { agentReplies: validatedAlphaReplies, args, budget: BUDGET });

  // The summary is exactly what a run whose record succeeded would return.
  assert.equal(JSON.stringify(failed.result), JSON.stringify(clean.result));
  assert.deepEqual(failed.result, { completed: ['alpha'], blocked: [], stalled: [], budget: BUDGET });
  assert.deepEqual(calibrationLogs(failed.logs), ['calibration — record spawn failed, run summary unchanged: worktree add failed']);
  assert.equal(failed.logs.at(-1), JSON.stringify(failed.result)); // completion channel intact, last
});

// ── criterion 4 (plan-prompt recall): the plan prompt appends the calibration digest
// section only when executionContext.calibration is present, so a no-history run's prompt
// is byte-identical to a pre-calibration run's ──
test('the plan prompt carries the calibration digest only when the execution context supplies one', async () => {
  const digest = '## Digest\n- standard: 4 runs, 3 agents median\n- re-slice rate: 12%';
  const replies = byLabel({ 'plan:alpha': { returns: { result: 'needs_refinement', detail: 'x' } } });

  const without = await runWorkflowScript(SCRIPT, { agentReplies: replies, args: executionContextOf([feature('alpha')]), budget: BUDGET });
  const withDigest = await runWorkflowScript(SCRIPT, { agentReplies: replies, args: executionContextOf([feature('alpha')], { calibration: digest }), budget: BUDGET });

  assert.ok(!planPromptOf(without).includes('calibration digest'), 'a no-history run omits the digest section entirely');
  assert.equal(
    planPromptOf(withDigest),
    `${planPromptOf(without)}\n\ncalibration digest (this repository's run history):\n${digest}`,
  );
});
