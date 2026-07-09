// The happy-path leg of the Workflow's own acceptance: the harness executes the real
// workflows/execution-pipeline.js, scripted with replies live Plan/Build/Validate spawns
// would return, and we assert the task briefs pushed into prompts, the branch DAG, the
// concurrency-policy scheduling, and the resulting run summary.
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
    probe: 'bring-up: node app · exercise: curl /health · teardown: kill',
    models: {},
    agentNamespace: '', // bare agent types; a real run resolves the-loop:<role> (see the namespace test)
    cli: 'node /plugin/bin/the-loop.js',
    features: Object.fromEntries(features.map((f) => [f.id, f])),
    ...overrides,
  };
}

const BUDGET = { spent: 1, remaining: 9 };
const validated = (id) => ({ returns: { result: 'validated', feature: id } });
const built = (task) => ({ returns: { result: 'built', task } });

// ── standard + small workflow paths, dependency scheduling, branch DAG, task briefs ──
test('a dependency-linked pair runs Plan→Build→Validate per feature — standard workflow path on a task DAG, small workflow path whole — to a completed run summary', async () => {
  const alphaTasks = [ // deliberately out of dependency order — the DAG orders builds, not the array
    { id: 't2', title: 'wire it', covers: [1], acceptance: ['t2 passes'], footprint: ['src/b.js'], size: 's', depends_on: ['t1'], wiring: 't2 sits atop t1' },
    { id: 't1', title: 'core', covers: [1], acceptance: ['t1 passes'], footprint: ['src/a.js'], size: 's', depends_on: [] },
  ];
  const args = executionContextOf([feature('alpha'), feature('beta', { depends_on: ['alpha'] })]);
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'planned', workflow_path: 'standard', tasks: alphaTasks } },
    // alpha builds as 2 tasks: build-agent-title-progress prefixes each label with its
    // fixed 1-based position in the *declared* array above (t2 first, t1 second) — never
    // the DAG build order below, which runs t1 before t2.
    'build:(2/2) alpha/t1': built('alpha/t1'),
    'build:(1/2) alpha/t2': built('alpha/t2'),
    'validate:alpha': validated('alpha'),
    'plan:beta': { returns: { result: 'planned', workflow_path: 'small' } },
    'build:beta/feature': built('beta/feature'), // small workflow path: never a divided build, no prefix
    'validate:beta': validated('beta'),
  });

  const { result, spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  const labels = spawns.map((s) => `${s.opts.agentType}:${s.opts.label}`);
  assert.deepEqual(labels, [
    'plan:alpha', 'build:(2/2) alpha/t1', 'build:(1/2) alpha/t2', 'validate:alpha',
    'plan:beta', 'build:beta/feature', 'validate:beta',
  ]);
  // run-presentation: no spawn label itself carries a phase/agentType prefix — the phase
  // box (asserted right below) is the sole disambiguator, so plan and validate on the
  // same feature share one bare label, `<feature>`. build-agent-title-progress: the two
  // alpha build labels additionally carry their `(<pos>/<N>)` plan-array position — beta,
  // a single small-workflow build, carries none.
  assert.deepEqual(spawns.map((s) => s.opts.label), [
    'alpha', '(2/2) alpha/t1', '(1/2) alpha/t2', 'alpha', 'beta', 'beta/feature', 'beta',
  ]);
  assert.deepEqual(spawns.map((s) => s.opts.phase), ['Plan', 'Build', 'Build', 'Validate', 'Plan', 'Build', 'Validate']);

  const prompt = (label) => spawns[labels.indexOf(label)].prompt;
  // plan task brief: criteria numbered, design doc pushed, CLI path carried
  assert.ok(prompt('plan:alpha').includes('1. alpha works'));
  assert.ok(prompt('plan:alpha').includes('design doc for alpha'));
  assert.ok(prompt('plan:alpha').includes('node /plugin/bin/the-loop.js'));
  // build task briefs: the branch DAG — t1 branches from the feature branch, t2 from t1's
  assert.ok(prompt('build:(2/2) alpha/t1').includes('worktree-create loop/alpha--t1 --base-branch loop/alpha'));
  assert.ok(prompt('build:(1/2) alpha/t2').includes('worktree-create loop/alpha--t2 --base-branch loop/alpha--t1'));
  assert.ok(prompt('build:(1/2) alpha/t2').includes('commit subject: "alpha/t2:'));
  assert.ok(prompt('build:(1/2) alpha/t2').includes('footprint (the lease — stay inside it): src/b.js'));
  assert.ok(prompt('build:(1/2) alpha/t2').includes('wiring: t2 sits atop t1'));
  assert.ok(prompt('build:(1/2) alpha/t2').includes('covers feature criteria: alpha works'));
  assert.ok(!prompt('build:(1/2) alpha/t2').includes('design doc for alpha'), 'build task briefs resource-guide-reference the design doc, never inline it');
  // build-agent-title-progress criterion 4: the position prefix lives only in the display
  // label — branch names, commit subjects, and merge order below are unaffected.
  assert.ok(!prompt('build:(1/2) alpha/t2').includes('(1/2)'), 'the prefix never bleeds into the task brief itself');
  // small workflow path: one whole-feature build straight off the target, design doc pushed
  assert.ok(prompt('build:beta/feature').includes('small workflow path'));
  assert.ok(prompt('build:beta/feature').includes('worktree-create loop/beta --base-branch main'));
  assert.ok(prompt('build:beta/feature').includes('design doc for beta'));
  // validate task briefs: merge order over the branch DAG, probe pushed
  assert.ok(prompt('validate:alpha').includes('merge, in order: loop/alpha, loop/alpha--t1, loop/alpha--t2'));
  assert.ok(prompt('validate:alpha').includes('bring-up: node app'));
  assert.ok(prompt('validate:beta').includes('merge, in order: loop/beta'));

  assert.deepEqual(result, { completed: ['alpha', 'beta'], blocked: [], stalled: [], budget: BUDGET });
  assert.equal(logs.at(-1), JSON.stringify(result)); // the completion channel's belt-and-braces echo
});

// ── build-agent-title-progress criterion 3: undivided builds (a small workflow path,
// or a standard plan that returned exactly one task) never carry an ordinal prefix —
// `(1/1)` is pure noise, so both stay the bare `<feature>/<task>` run-presentation shape.
test('a single-task standard plan and a small-workflow build both carry the bare build label — never a redundant (1/1)', async () => {
  const singleTask = [{ id: 'only', title: 'sole task', covers: [1], acceptance: ['only passes'], footprint: ['src/only.js'], size: 's', depends_on: [] }];
  const args = executionContextOf([feature('alpha'), feature('beta')]);
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'planned', workflow_path: 'standard', tasks: singleTask } },
    'build:alpha/only': built('alpha/only'),
    'validate:alpha': validated('alpha'),
    'plan:beta': { returns: { result: 'planned', workflow_path: 'small' } },
    'build:beta/feature': built('beta/feature'),
    'validate:beta': validated('beta'),
  });

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  const buildLabels = spawns.filter((s) => s.opts.agentType === 'build').map((s) => s.opts.label);
  assert.deepEqual(buildLabels, ['alpha/only', 'beta/feature']);
  assert.ok(buildLabels.every((l) => !l.startsWith('(')), 'a single-task standard plan and a small-workflow build never carry an ordinal prefix');
  assert.deepEqual(result.completed.toSorted((a, b) => a.localeCompare(b)), ['alpha', 'beta']);
});

// ── resume: a plan already in the execution context skips Plan; git-derived builtTasks skip their builds ──
test('a feature whose plan is already in the execution context skips Plan and resumes Build at the first task git has not landed', async () => {
  const plan = { designVersion: 8, tasks: [
    { id: 'g1', title: 'done already', covers: [1], acceptance: ['g1'], footprint: ['a.js'], size: 'xs', depends_on: [] },
    { id: 'g2', title: 'remaining', covers: [1], acceptance: ['g2'], footprint: ['b.js'], size: 'xs', depends_on: ['g1'] },
  ] };
  const args = executionContextOf([feature('gamma', { plan, builtTasks: ['g1'] })]);
  const replies = byLabel({
    // build-agent-title-progress: g2's position stays its fixed plan-array slot (2/2)
    // even though g1 already landed and never spawns — a resume never re-bases to (1/2).
    'build:(2/2) gamma/g2': built('gamma/g2'),
    'validate:gamma': validated('gamma'),
  });

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['build', 'validate']); // no plan spawn, no g1 spawn
  assert.equal(spawns[0].opts.label, '(2/2) gamma/g2');
  assert.ok(spawns[0].prompt.includes('worktree-create loop/gamma--g2 --base-branch loop/gamma--g1'));
  assert.ok(spawns[1].prompt.includes('merge, in order: loop/gamma, loop/gamma--g1, loop/gamma--g2'));
  assert.deepEqual(result.completed, ['gamma']);
});

test('a small-workflow-path feature whose branch head already carries its landing commit skips Build and goes straight to Validate', async () => {
  const args = executionContextOf([feature('delta', { branchHead: 'delta/feature: landed last run' })]);
  const replies = byLabel({
    'plan:delta': { returns: { result: 'planned', workflow_path: 'small' } },
    'validate:delta': validated('delta'),
  });

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(spawns.map((s) => s.opts.agentType), ['plan', 'validate']);
  assert.deepEqual(result.completed, ['delta']);
});

// ── feature-level concurrency: independent features start together ──
test('independent in-scope features start concurrently — both Plan spawns land before any Build', async () => {
  const args = executionContextOf([feature('alpha'), feature('beta')]);
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'planned', workflow_path: 'small' } },
    'plan:beta': { returns: { result: 'planned', workflow_path: 'small' } },
    'build:alpha/feature': built('alpha/feature'),
    'build:beta/feature': built('beta/feature'),
    'validate:alpha': validated('alpha'),
    'validate:beta': validated('beta'),
  });

  const { result, spawns } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  assert.deepEqual(spawns.slice(0, 2).map((s) => s.opts.agentType), ['plan', 'plan'], 'both features planned before either built');
  assert.deepEqual(result.completed.toSorted((a, b) => a.localeCompare(b)), ['alpha', 'beta']);
});

// ── model routing: build.<judgment_level> bindings, [model] label prefixes, session fallback ──
test('build spawns route through build.<judgment_level> bindings and every label carries its resolved-model prefix', async () => {
  const tasks = [
    { id: 't1', title: 'hard', covers: [1], acceptance: ['t1'], footprint: ['a.js'], size: 's', judgment_level: 'complex', depends_on: [] },
    { id: 't2', title: 'unrated', covers: [1], acceptance: ['t2'], footprint: ['b.js'], size: 's', depends_on: ['t1'] },
  ];
  const args = executionContextOf([feature('alpha')], {
    models: { 'build.complex': { model: 'opus' }, 'build.standard': { model: 'sonnet' }, validate: { model: 'sonnet', effort: 'high' } }, // plan deliberately unbound
  });
  const replies = byLabel({
    'plan:alpha': { returns: { result: 'planned', workflow_path: 'standard', tasks } },
    'build:(1/2) alpha/t1': built('alpha/t1'),
    'build:(2/2) alpha/t2': built('alpha/t2'),
    'validate:alpha': validated('alpha'),
  });

  const { result, spawns, logs } = await runWorkflowScript(SCRIPT, { agentReplies: replies, args, budget: BUDGET });

  // Bare labels alone no longer disambiguate plan from validate on the same feature
  // (run-presentation dropped the agentType prefix) — key on agentType + label instead.
  const optsByLabel = Object.fromEntries(spawns.map((s) => [`${s.opts.agentType}:${s.opts.label}`, s.opts]));
  assert.equal('model' in optsByLabel['plan:alpha'], false, 'an unbound role passes no model opt');
  assert.equal(optsByLabel['build:(1/2) alpha/t1'].model, 'opus');
  assert.equal('model' in optsByLabel['build:(2/2) alpha/t2'], true, 'an unrated task routes build.standard');
  assert.equal(optsByLabel['validate:alpha'].effort, 'high', 'a bound effort rides the spawn');
  assert.ok(logs.includes('model-selection — role plan unbound, session-model fallback'));
  assert.ok(logs.includes('model-selection — task alpha/t2 has no judgment_level, routing build.standard'));
  assert.deepEqual(result.completed, ['alpha']);
});

// ── agent-type namespacing: plugin agents register as the-loop:<role> in any installed
// session (only a repo symlinking agents/*.md into .claude/agents/ also exposes the bare
// names). A run must spawn the namespaced type by default so it works in any target
// project — the bug that stalled a run in a plugin-only project. The namespace is
// overridable (a fork under a different plugin name).
test('spawns resolve through the plugin agent namespace — the-loop:<role> when the context omits one, overridable per run', async () => {
  const alphaTasks = [{ id: 't1', title: 'core', covers: [1], acceptance: ['t1 passes'], footprint: ['src/a.js'], size: 's', depends_on: [] }];
  const repliesFor = (ns) => byLabel({
    [`${ns}plan:alpha`]: { returns: { result: 'planned', workflow_path: 'standard', tasks: alphaTasks } },
    [`${ns}build:alpha/t1`]: built('alpha/t1'),
    [`${ns}validate:alpha`]: validated('alpha'),
  });

  // A context with no agentNamespace (what prepare-execution-context emits) → the plugin namespace.
  const defaulted = executionContextOf([feature('alpha')]);
  delete defaulted.agentNamespace;
  const run1 = await runWorkflowScript(SCRIPT, { agentReplies: repliesFor('the-loop:'), args: defaulted, budget: BUDGET });
  assert.deepEqual(run1.spawns.map((s) => s.opts.agentType), ['the-loop:plan', 'the-loop:build', 'the-loop:validate']);
  assert.deepEqual(run1.result.completed, ['alpha']);

  // A fork installed under a different plugin name overrides the namespace.
  const forked = executionContextOf([feature('alpha')], { agentNamespace: 'acme' });
  const run2 = await runWorkflowScript(SCRIPT, { agentReplies: repliesFor('acme:'), args: forked, budget: BUDGET });
  assert.deepEqual(run2.spawns.map((s) => s.opts.agentType), ['acme:plan', 'acme:build', 'acme:validate']);
  assert.deepEqual(run2.result.completed, ['alpha']);
});
