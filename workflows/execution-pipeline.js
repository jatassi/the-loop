// The execution-pipeline engine (ADR-0036/0038): script = brain, agents = hands. This
// file has no filesystem — it consumes the `the-loop prepare-execution-context`
// execution context via `args` and never imports anything: `agent`, `log`, `args`,
// `budget` arrive as harness globals (declared for eslint in the workflows/ block of
// eslint.config.js). It pushes each worker's task brief (contract + refs) into the
// prompt — workers fetch nothing to start — and schedules a concurrency policy over
// features and tasks, so anything whose dependencies are satisfied runs concurrently
// in its own worktree. The completion channel is a bare top-level `return` of the run
// summary.
export const meta = { name: 'execution-pipeline', description: 'One autonomous pass over the scoped feature graph: Plan → Build → Validate per feature, concurrent where dependencies allow, ending in a run summary', whenToUse: 'Launched by /the-loop with the `the-loop prepare-execution-context` execution context as args — never invoked bare', phases: [{ title: 'Plan' }, { title: 'Build' }, { title: 'Validate' }] };

// Some callers deliver args as a JSON-encoded string rather than the parsed execution context.
const executionContext = typeof args === 'string' ? JSON.parse(args) : args;
const CLI = executionContext.cli || 'node bin/the-loop.js';

const asList = (x) => (Array.isArray(x) ? x : [x]);

// ---- model bindings (ADR-0030): role → {model, effort?, executor?}; unbound falls
// back to the session model with one visible log line.
const modelTable = executionContext.models || {};
const hasRole = (role) => Object.prototype.hasOwnProperty.call(modelTable, role);
function roleBinding(role) {
  if (hasRole(role)) { return modelTable[role]; }
  log(`model-selection — role ${role} unbound, session-model fallback`);
  return { model: 'session' };
}
function modelOpts(binding) {
  const opts = {};
  if (binding.model !== 'session') { opts.model = binding.model; }
  if (binding.effort !== undefined) { opts.effort = binding.effort; }
  return opts;
}

// ---- return schemas (the harness validates each agent's structured return; every
// pinned field must be described or the harness's schema-as-template drops it).
const strings = (...names) => Object.fromEntries(names.map((n) => [n, { type: 'string' }]));
const stringArray = { type: 'array', items: { type: 'string' } };
const TASK_SHAPE = {
  type: 'object',
  properties: { ...strings('id', 'title', 'size', 'judgment_level', 'wiring'), covers: { type: 'array', items: { type: 'number' } }, acceptance: stringArray, footprint: stringArray, depends_on: stringArray },
  required: ['id'],
};
const PLAN_SCHEMA = {
  type: 'object',
  properties: { result: { enum: ['planned', 'needs_refinement', 'blocked'] }, workflow_path: { enum: ['small', 'standard'] }, tasks: { type: 'array', items: TASK_SHAPE }, ...strings('kind', 'detail'), options: stringArray },
  required: ['result'],
};
const BUILD_SCHEMA = {
  type: 'object',
  properties: { result: { enum: ['built', 'blocked'] }, ...strings('task', 'summary', 'kind', 'detail'), deviations: stringArray, options: stringArray },
  required: ['result', 'task'],
};
const VALIDATE_SCHEMA = {
  type: 'object',
  properties: { result: { enum: ['validated', 'fail', 'blocked'] }, ...strings('feature', 'summary', 'kind', 'detail'), findings: stringArray, options: stringArray },
  required: ['result', 'feature'],
};

// ---- run state
const completed = [];
const blocked = [];   // needs a human decision at this boundary: {feature, reason, options}
const stalled = [];   // agent/infra error, nothing recorded — rerun next pass
let halted;

// ---- the one spawn choke point: classifies thrown errors and environment blocks
// into run-level halts / feature-level stalls that every stage reports identically.
function isBudgetExhausted(error) {
  return /budget/i.test(`${error?.name ?? ''} ${error?.code ?? ''}`);
}
async function spawn(prompt, opts, featureId) {
  let r;
  try {
    r = await agent(prompt, opts);
  } catch (error) {
    if (isBudgetExhausted(error)) { return { halted: { reason: 'budget-exhausted', detail: error.message } }; }
    return { stalled: { feature: featureId, agent: opts.agentType, note: error.message } };
  }
  if (r == null) { return { stalled: { feature: featureId, agent: opts.agentType, note: 'agent returned null' } }; }
  if (r.result === 'blocked' && r.kind === 'environment') {
    return { halted: { reason: 'environment-blocked', detail: r.detail } };
  }
  return r;
}

// Record a signal on the shared lists. Returns 'halt' | 'fail' | null — the stage
// flow-control every caller maps the same way.
function signalOf(r) {
  if (r.halted) { halted = r.halted; return 'halt'; }
  if (r.stalled) { stalled.push(r.stalled); return 'fail'; }
  return null;
}

// ---- task brief assembly (ADR-0036): what each worker gets pushed, and the resource
// guide of fetchable context. The per-feature design doc is pushed to plan and validate
// (their whole-feature judgment needs it) and resource-guide-referenced for build (its
// task brief is the task contract; the doc is one Read away in its own worktree).
function resourceGuide(f) {
  return [
    'Fetch more only if needed:',
    `- feature design doc: docs/designs/${f.id}/design.md`,
    '- system design (architecture, cross-feature contracts): docs/architecture.md',
    `- plan (all task contracts): docs/plans/${f.id}/plan.md on ${f.branch}`,
    `- graph/status: ${CLI} status`,
  ].join('\n');
}

const criteriaList = (acceptance) => asList(acceptance).map((c, i) => `${i + 1}. ${c}`).join('\n');
const taskBranch = (f, taskId) => `${f.branch}--${taskId}`;

function planPrompt(f) {
  return [
    `feature: ${f.id} — ${f.title}`,
    `target: ${executionContext.target} · branch: ${f.branch} · plan file: docs/plans/${f.id}/plan.md`,
    `cli: ${CLI}`,
    '',
    'acceptance criteria:',
    criteriaList(f.acceptance),
    ...(f.notes ? ['', `design notes: ${asList(f.notes).join(' · ')}`] : []),
    '',
    '--- feature design doc ---',
    f.designDoc || '(none recorded — read docs/architecture.md for context)',
  ].join('\n');
}

function buildPrompt(f, task, { base, mergeBranches }) {
  const coversCriteria = (task.covers || []).map((k) => f.acceptance[k - 1]).filter(Boolean);
  return [
    `feature: ${f.id} · task: ${task.id} — ${task.title}`,
    `worktree: ${CLI} worktree-create ${taskBranch(f, task.id)} --base-branch ${base}`,
    ...(mergeBranches.length > 0 ? [`merge these sibling branches first, apply the test-gated merge policy to any textual conflict: ${mergeBranches.join(', ')}`] : []),
    `commit subject: "${f.id}/${task.id}: <what landed>"`,
    '',
    'task acceptance (each criterion gets a red-then-green test):',
    criteriaList(task.acceptance),
    '',
    `covers feature criteria: ${coversCriteria.join(' · ') || '(listed in plan)'}`,
    `footprint (the lease — stay inside it): ${(task.footprint || []).join(', ')}`,
    ...(task.wiring ? [`wiring: ${task.wiring}`] : []),
    '',
    resourceGuide(f),
  ].join('\n');
}

function smallBuildPrompt(f) {
  return [
    `feature: ${f.id} — ${f.title} (small workflow path: the whole feature is one task)`,
    `worktree: ${CLI} worktree-create ${f.branch} --base-branch ${executionContext.target}`,
    `commit subject: "${f.id}/feature: <what landed>"`,
    '',
    'feature acceptance (each criterion gets a red-then-green test):',
    criteriaList(f.acceptance),
    '',
    '--- feature design doc ---',
    f.designDoc || '(none recorded)',
    '',
    resourceGuide(f),
  ].join('\n');
}

function validatePrompt(f, branches) {
  return [
    `feature: ${f.id} — ${f.title}`,
    `target: ${executionContext.target} · integration worktree: ${CLI} worktree-create integrate--${f.id} --base-branch ${executionContext.target}`,
    `merge, in order: ${branches.join(', ')}`,
    `cli: ${CLI}`,
    '',
    'acceptance criteria to judge:',
    criteriaList(f.acceptance),
    '',
    'validation-runbook binding:',
    executionContext.probe || '(none recorded — skip the runtime leg and say so)',
    '',
    '--- feature design doc ---',
    f.designDoc || '(none recorded)',
    '',
    resourceGuide(f),
  ].join('\n');
}

// ---- generic concurrency-policy scheduler: run every item whose deps are satisfied,
// launch newly-ready items as results land. `run` resolves true on success; false stops
// dependents; 'halt' stops the whole run.
async function runConcurrencyPolicy({ ids, depsOf, run, onUnreachable }) {
  const pending = new Set(ids);
  const done = new Set();
  const running = new Map();
  const start = async (id) => ({ id, ok: await run(id) });
  let didHalt = false;
  while (pending.size > 0 || running.size > 0) {
    // Only a dep that *landed* unblocks its dependents; a failed dep never enters
    // `done`, so its dependents drain to onUnreachable once nothing is running.
    const startable = [...pending].filter((id) => depsOf(id).every((d) => done.has(d)));
    for (const id of startable) {
      pending.delete(id);
      running.set(id, start(id));
    }
    if (running.size === 0) { break; }
    const { id, ok } = await Promise.race(running.values());
    running.delete(id);
    if (ok === 'halt') { didHalt = true; break; }
    if (ok) { done.add(id); }
  }
  await Promise.allSettled(running.values());
  // A halt stops the run mid-flight — the un-started remainder isn't "unreachable",
  // the run just ended; the run summary's `halted` explains them.
  if (!didHalt) { for (const id of pending) { onUnreachable(id); } }
}

// Validators write the target branch; serialize them (ADR-0038: merges happen
// in a dedicated integration worktree, one at a time — a natural mutex).
let validateTurn = Promise.resolve();
async function withValidateLock(fn) {
  const prev = validateTurn;
  const { promise, resolve } = Promise.withResolvers();
  validateTurn = promise;
  await prev;
  try {
    return await fn();
  } finally {
    resolve();
  }
}

// ---- phases
async function runPlan(f) {
  if (f.plan) { return { workflow_path: 'standard', tasks: f.plan.tasks }; }
  const binding = roleBinding('plan');
  const planned = await spawn(planPrompt(f), {
    agentType: 'plan', label: f.id, phase: 'Plan', schema: PLAN_SCHEMA, ...modelOpts(binding),
  }, f.id);
  const flow = signalOf(planned);
  if (flow) { return { flow }; }
  if (planned.result === 'needs_refinement' || planned.result === 'blocked') {
    blocked.push({ feature: f.id, reason: planned.detail, options: planned.options });
    return { flow: 'fail' };
  }
  if (planned.workflow_path === 'small') { return { workflow_path: 'small' }; }
  return { workflow_path: 'standard', tasks: planned.tasks };
}

function buildSpawnOpts(f, task, binding) {
  return { agentType: 'build', label: `${f.id}/${task.id}`, phase: 'Build', schema: BUILD_SCHEMA, ...modelOpts(binding) };
}

async function runTask(f, task, prompt) {
  if (task.judgment_level == null) { log(`model-selection — task ${f.id}/${task.id} has no judgment_level, routing build.standard`); }
  const binding = roleBinding(`build.${task.judgment_level ?? 'standard'}`);
  const opts = buildSpawnOpts(f, task, binding);
  if (binding.executor && binding.executor !== 'agent') {
    const driveBinding = hasRole(`drive.${binding.executor}`) ? modelTable[`drive.${binding.executor}`] : roleBinding('drive');
    log(`model-selection — task ${f.id}/${task.id} routed via ${binding.executor}/${binding.model}, drive ${driveBinding.model}`);
    return spawn(`executor: ${binding.executor} · executor-model: ${binding.model}\n${prompt}`, {
      ...opts, agentType: 'drive', label: `${f.id}/${task.id} via ${binding.executor}`, ...modelOpts(driveBinding),
    }, f.id);
  }
  return spawn(prompt, opts, f.id);
}

// Map one task result onto the shared lists → the scheduler's tri-state.
function taskOutcome(f, r) {
  const flow = signalOf(r);
  if (flow === 'halt') { return 'halt'; }
  if (flow === 'fail') { return false; }
  if (r.result === 'blocked') {
    blocked.push({ feature: f.id, reason: r.detail, options: r.options });
    return false;
  }
  return true;
}

// Build every task in dependency order, concurrent where the DAG allows — unordered
// tasks may still share a footprint file (disjointness is the plan's bias, not law;
// a shared-file sibling merge resolves under the test-gated merge policy — ADR-0042),
// each in its own worktree on its own branch (ADR-0038). Returns true when every task
// landed.
async function runBuild(f, tasks) {
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const already = new Set(f.builtTasks || []);
  let didAllLand = true;
  await runConcurrencyPolicy({
    ids: tasks.map((t) => t.id),
    depsOf: (id) => tasksById.get(id).depends_on || [],
    run: async (id) => {
      if (already.has(id)) { return true; }
      const task = tasksById.get(id);
      const deps = task.depends_on || [];
      const base = deps.length > 0 ? taskBranch(f, deps[0]) : f.branch;
      const mergeBranches = deps.slice(1).map((d) => taskBranch(f, d));
      const outcome = taskOutcome(f, await runTask(f, task, buildPrompt(f, task, { base, mergeBranches })));
      if (outcome !== true) { didAllLand = false; }
      return outcome;
    },
    onUnreachable: () => { didAllLand = false; },
  });
  return didAllLand;
}

async function runSmallBuild(f) {
  if ((f.branchHead || '').startsWith(`${f.id}/feature: `)) { return true; } // already landed
  const task = { id: 'feature', title: f.title, acceptance: f.acceptance };
  return taskOutcome(f, await runTask(f, task, smallBuildPrompt(f))) === true;
}

// depends_on-respecting topological order over task contracts.
function topoOrder(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ordered = [];
  const seen = new Set();
  const visit = (id) => {
    if (seen.has(id) || !byId.get(id)) { return; }
    seen.add(id);
    const deps = byId.get(id).depends_on || [];
    for (const dep of deps) { visit(dep); }
    ordered.push(byId.get(id));
  };
  for (const t of tasks) { visit(t.id); }
  return ordered;
}

async function runValidate(f, workflowPath, tasks) {
  const branches = workflowPath === 'small'
    ? [f.branch]
    : [f.branch, ...topoOrder(tasks).map((t) => taskBranch(f, t.id))];
  const binding = roleBinding('validate');
  const verdict = await withValidateLock(() => spawn(validatePrompt(f, branches), {
    agentType: 'validate', label: f.id, phase: 'Validate', schema: VALIDATE_SCHEMA, ...modelOpts(binding),
  }, f.id));
  const flow = signalOf(verdict);
  if (flow) { return flow === 'halt' ? 'halt' : false; }
  if (verdict.result === 'validated') {
    completed.push(f.id);
    return true;
  }
  blocked.push({ feature: f.id, reason: verdict.detail || (verdict.findings || []).join('; '), options: verdict.options });
  return false;
}

// One feature, Plan → Build → Validate. Returns true when it validated (unblocking
// in-scope dependents), 'halt' to stop the whole run, false otherwise.
async function runFeature(id) {
  const f = executionContext.features[id];
  const plan = await runPlan(f);
  if (plan.flow) { return plan.flow === 'halt' ? 'halt' : false; }

  if (plan.workflow_path === 'small') {
    const landed = await runSmallBuild(f);
    if (landed !== true) { return halted ? 'halt' : false; }
    return runValidate(f, 'small', []);
  }

  if (!Array.isArray(plan.tasks) || plan.tasks.length === 0) {
    stalled.push({ feature: f.id, agent: 'plan', note: 'no task contracts reached the script' });
    return false;
  }
  const landed = await runBuild(f, plan.tasks);
  if (!landed) { return halted ? 'halt' : false; }
  return runValidate(f, 'standard', plan.tasks);
}

// ---- the run: concurrency policy over the scoped subgraph (ADR-0038). Deps outside
// the scope were gated as already-landed by `the-loop prepare-execution-context`; deps
// inside it unblock as they land.
const inScope = new Set(executionContext.scope);
const depsWithin = (id) => (executionContext.features[id].depends_on || []).filter((d) => inScope.has(d));
await runConcurrencyPolicy({
  ids: executionContext.scope,
  depsOf: depsWithin,
  run: runFeature,
  onUnreachable: (id) => { stalled.push({ feature: id, agent: 'scheduler', note: 'an in-scope dependency did not land this run' }); },
});

const result = { completed, blocked, stalled, budget: { spent: budget.spent, remaining: budget.remaining } };
if (halted) { result.halted = halted; }
log(JSON.stringify(result)); // belt-and-braces echo of the completion channel
return result;
