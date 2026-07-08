// Oracle for phase-grouping-t1, criterion 1 — executes the real workflows/inner-loop.js
// under stub harness globals (the serial technique test/workflow-shim.js uses, inlined so
// the oracle never leans on the candidate's own shim), driving one designed feature through
// Plan → Build → Validate and asserting each spawn's phase opt names its SDLC phase. At the
// parent state every phase opt carries the feature id ('alpha'), so this is red.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const SCRIPT = 'workflows/inner-loop.js';
const META_LINE = /^(\s*)export const meta\b/m;

// The v1 inner-loop engine is serial — replies are replayed in call order.
async function runInnerLoop({ args, budget = { spent: 1, remaining: 9 }, replies = [] }) {
  const spawns = [];
  let next = 0;
  const agent = async (prompt, opts) => { const r = replies[next]; next += 1; spawns.push({ prompt, opts }); return r ? r.returns : null; };
  const log = () => {};
  const parallel = () => { throw new Error('parallel() unused'); };
  const pipeline = () => { throw new Error('pipeline() unused'); };
  const body = readFileSync(SCRIPT, 'utf8').replace(META_LINE, '$1const meta');
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const run = new AsyncFunction('agent', 'parallel', 'pipeline', 'log', 'args', 'budget', body);
  await run(agent, parallel, pipeline, log, args, budget);
  return spawns;
}

test('criterion 1: plan → Plan, build → Build, derive & validate → Validate — the phase opt names the SDLC phase, not the feature', async () => {
  const args = {
    target: 'main',
    scope: ['alpha'],
    index: { designVersion: 1, features: [{ id: 'alpha', status: 'designed', depends_on: [], interfaces: [], acceptance: ['alpha works'] }] },
    slices: { alpha: { node: { id: 'alpha', title: 'alpha', status: 'designed', acceptance: ['alpha works'] }, contracts: [] } },
    plans: {},
    probe: { bringUp: 'npm start' },
    models: {},
  };
  const replies = [
    { returns: { result: 'planned', feature: 'alpha', tasks: [{ id: 't1', status: 'pending', depends_on: [], size: 's' }] } },
    { returns: { result: 'built', task: 'alpha/t1' } },
    { returns: { result: 'derived', feature: 'alpha', expectations: [{ criterion: 'alpha works', expect: 'alpha does the thing' }], ambiguities: [] } },
    { returns: { result: 'perfect', feature: 'alpha' } },
  ];
  const spawns = await runInnerLoop({ args, replies });

  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['plan', 'build', 'derive', 'validate'], 'the full Plan→Build→Validate spawn sequence ran');
  assert.deepEqual(spawns.map((s) => s.opts.phase), ['Plan', 'Build', 'Validate', 'Validate'], 'each phase opt is its SDLC phase, never the feature id');
});
