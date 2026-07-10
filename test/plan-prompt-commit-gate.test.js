// fix-plan-commit-gate-blind-spot criterion 2: planPrompt surfaces the resolved
// precommit posture from executionContext.hooks only when the hooks table is present.
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

function executionContextOf(features, overrides = {}) {
  return {
    target: 'main',
    scope: features.map((f) => f.id),
    probe: null,
    models: { record: { model: 'haiku' } },
    agentNamespace: '',
    preparedAt: '2026-07-08T14:02:11Z',
    features: Object.fromEntries(features.map((f) => [f.id, f])),
    ...overrides,
  };
}

const BUDGET = { spent: 5, remaining: 5 };
const planPromptOf = (run) => run.spawns.find((s) => s.opts.phase === 'Plan').prompt;
const planReplies = byLabel({
  'plan:alpha': { returns: { result: 'needs_refinement', detail: 'x' } },
});

test('the plan prompt names the resolved commit gate when executionContext.hooks is present', async () => {
  const hooks = {
    precommit: { system: 'husky', provenance: 'project' },
  };
  const run = await runWorkflowScript(SCRIPT, {
    agentReplies: planReplies,
    args: executionContextOf([feature('alpha')], { hooks }),
    budget: BUDGET,
  });

  const prompt = planPromptOf(run);
  assert.match(prompt, /^commit gate: husky$/m, 'plan prompt must include a commit-gate line naming the bound system');
});

test('the plan prompt omits the commit-gate line when executionContext.hooks is absent', async () => {
  const withoutHooks = executionContextOf([feature('alpha')]);
  assert.equal(withoutHooks.hooks, undefined, 'fixture has no hooks table');

  const run = await runWorkflowScript(SCRIPT, {
    agentReplies: planReplies,
    args: withoutHooks,
    budget: BUDGET,
  });

  const prompt = planPromptOf(run);
  assert.ok(!/commit gate:/i.test(prompt), 'hooks-absent context must omit the commit-gate line entirely');
  // No stray hooks/precommit leakage when the table is missing
  assert.ok(!/\bprecommit\b/i.test(prompt), 'hooks-absent prompt must not mention precommit');
});
