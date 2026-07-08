// Oracle for run-presentation-t2-labels — executes the real workflows/execution-pipeline.js
// under stub harness globals (inlined so the oracle never leans on the candidate's own
// harness) and asserts every spawn label is prefix-free: plan/validate labels are the bare
// feature id, build labels are <feature>/<task>, drive labels are <feature>/<task> via
// <executor>, and no label carries a phase/agentType prefix. Assertions read the recorded
// spawns, so a prefixed (parent-shape) label is observed even though its replies won't match.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const SCRIPT = 'workflows/execution-pipeline.js';
const META_LINE = /^(\s*)export const meta\b/m;

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

const contextOf = (feature) => ({
  target: 'main', scope: [feature.id], probe: null, models: {
    'build.rote': { model: 'grok-build', executor: 'grok' }, 'build.standard': { model: 'sonnet' }, 'drive.grok': { model: 'haiku' },
  }, agentNamespace: '', cli: 'node bin/the-loop.js', features: { [feature.id]: feature },
});

test('plan, build, drive, and validate spawn labels are all prefix-free', async () => {
  const alpha = {
    id: 'alpha', title: 'alpha title', acceptance: ['alpha works'], depends_on: [],
    designDoc: 'design doc for alpha', branch: 'loop/alpha', branchHead: null, plan: null, builtTasks: [],
  };
  const tasks = [
    { id: 't1', title: 'rote', covers: [1], acceptance: ['t1'], footprint: ['a.js'], size: 'xs', judgment_level: 'rote', depends_on: [] },
    { id: 't2', title: 'std', covers: [1], acceptance: ['t2'], footprint: ['b.js'], size: 'xs', judgment_level: 'standard', depends_on: ['t1'] },
  ];
  const replies = {
    'plan:alpha': { returns: { result: 'planned', workflow_path: 'standard', tasks } },
    'drive:alpha/t1 via grok': { returns: { result: 'built', task: 'alpha/t1' } },
    'build:alpha/t2': { returns: { result: 'built', task: 'alpha/t2' } },
    'validate:alpha': { returns: { result: 'validated', feature: 'alpha' } },
  };
  const spawns = await runScript({ args: contextOf(alpha), replies });

  const byType = (t) => spawns.filter((s) => s.opts.agentType === t);
  assert.equal(byType('plan').length, 1, 'a plan spawned');
  assert.equal(byType('validate').length, 1, 'a validate spawned');
  assert.ok(byType('drive').length === 1, 'the rote task routed to drive');
  assert.ok(byType('build').length === 1, 'the standard task routed to build');

  assert.equal(byType('plan')[0].opts.label, 'alpha', 'plan label is the bare feature id');
  assert.equal(byType('validate')[0].opts.label, 'alpha', 'validate label is the bare feature id');
  assert.equal(byType('build')[0].opts.label, 'alpha/t2', 'build label is <feature>/<task>');
  assert.equal(byType('drive')[0].opts.label, 'alpha/t1 via grok', 'drive label is <feature>/<task> via <executor>');

  // No label anywhere carries a phase/agentType prefix.
  for (const s of spawns) {
    assert.doesNotMatch(String(s.opts.label), /^(plan|build|validate|drive):/, `label "${s.opts.label}" carries no agentType prefix`);
  }
});
