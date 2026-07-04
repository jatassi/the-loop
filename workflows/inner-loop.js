// The inner-loop engine (ADR-0036/0038): script = brain, agents = hands. This file has
// no filesystem — it consumes the `spine launch` snapshot via `args` and never imports
// anything: `agent`, `log`, `args`, `budget` arrive as harness globals (declared for
// eslint in the workflows/ block of eslint.config.js). It pushes each worker's kernel
// (contract + refs) into the prompt — workers fetch nothing to start — and schedules a
// ready-set walk over features and tasks, so anything whose dependencies are satisfied
// runs concurrently in its own worktree. The completion channel is a bare top-level
// `return` of the BoundaryResult.
export const meta = { name: 'inner-loop', description: 'One autonomous pass over the scoped feature graph: Plan → Build → Validate per feature, concurrent where dependencies allow, ending in a BoundaryResult', whenToUse: 'Launched by /the-loop with the `spine launch` snapshot as args — never invoked bare', phases: [{ title: 'Plan' }, { title: 'Build' }, { title: 'Validate' }] };

// Some callers deliver args as a JSON-encoded string rather than the parsed snapshot.
const snapshot = typeof args === 'string' ? JSON.parse(args) : args;
const SPINE = snapshot.spine || 'node bin/spine.js';

const asList = (x) => (Array.isArray(x) ? x : [x]);

// ---- model bindings (ADR-0030): role → {model, effort?, via?}; unbound falls back
// to the session model with one visible log line.
const modelTable = snapshot.models || {};
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
const modelLabel = (binding) => `[${binding.model}] `;

// ---- return schemas (the harness validates each agent's structured return; every
// pinned field must be described or the harness's schema-as-template drops it).
const strings = (...names) => Object.fromEntries(names.map((n) => [n, { type: 'string' }]));
const stringArray = { type: 'array', items: { type: 'string' } };
const TASK_SHAPE = {
  type: 'object',
  properties: { ...strings('id', 'title', 'size', 'tier', 'wiring'), covers: { type: 'array', items: { type: 'number' } }, acceptance: stringArray, footprint: stringArray, depends_on: stringArray },
  required: ['id'],
};
const PLAN_SCHEMA = {
  type: 'object',
  properties: { result: { enum: ['planned', 'bounce', 'blocked'] }, lane: { enum: ['small', 'standard'] }, tasks: { type: 'array', items: TASK_SHAPE }, ...strings('kind', 'detail'), options: stringArray },
  required: ['result'],
};
const BUILD_SCHEMA = {
  type: 'object',
  properties: { result: { enum: ['built', 'blocked'] }, ...strings('task', 'summary', 'kind', 'detail'), deviations: stringArray, options: stringArray },
  required: ['result', 'task'],
};
const VALIDATE_SCHEMA = {
  type: 'object',
  properties: { result: { enum: ['validated', 'deviation', 'blocked'] }, ...strings('feature', 'summary', 'kind', 'detail'), findings: stringArray, options: stringArray },
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

// ---- kernel assembly (ADR-0036): what each worker gets pushed, and the menu of
// fetchable context. The per-feature design doc is pushed to plan and validate (their
// whole-feature judgment needs it) and menu-referenced for build (its kernel is the
// task contract; the doc is one Read away in its own worktree).
function menu(f) {
  return [
    'Fetch more only if needed:',
    `- feature design doc: docs/design/features/${f.id}.md`,
    '- system design (architecture, cross-feature contracts): docs/design/design.md',
    `- plan (all task contracts): docs/plans/${f.id}.md on ${f.branch}`,
    `- graph/status: ${SPINE} ledger`,
  ].join('\n');
}

const criteriaList = (acceptance) => asList(acceptance).map((c, i) => `${i + 1}. ${c}`).join('\n');
const taskBranch = (f, taskId) => `${f.branch}--${taskId}`;

function planPrompt(f) {
  return [
    `feature: ${f.id} — ${f.title}`,
    `target: ${snapshot.target} · branch: ${f.branch} · plan file: docs/plans/${f.id}.md`,
    `spine: ${SPINE}`,
    '',
    'acceptance criteria:',
    criteriaList(f.acceptance),
    ...(f.notes ? ['', `design notes: ${asList(f.notes).join(' · ')}`] : []),
    '',
    '--- feature design doc ---',
    f.designDoc || '(none recorded — read docs/design/design.md for context)',
  ].join('\n');
}

function buildPrompt(f, task, { base, mergeBranches }) {
  const coversCriteria = (task.covers || []).map((k) => f.acceptance[k - 1]).filter(Boolean);
  return [
    `feature: ${f.id} · task: ${task.id} — ${task.title}`,
    `worktree: ${SPINE} worktree create ${taskBranch(f, task.id)} --from ${base}`,
    ...(mergeBranches.length > 0 ? [`merge these sibling branches first (clean by construction): ${mergeBranches.join(', ')}`] : []),
    `commit subject: "${f.id}/${task.id}: <what landed>"`,
    '',
    'task acceptance (each criterion gets a red-then-green test):',
    criteriaList(task.acceptance),
    '',
    `covers feature criteria: ${coversCriteria.join(' · ') || '(listed in plan)'}`,
    `footprint (the lease — stay inside it): ${(task.footprint || []).join(', ')}`,
    ...(task.wiring ? [`wiring: ${task.wiring}`] : []),
    '',
    menu(f),
  ].join('\n');
}

function smallBuildPrompt(f) {
  return [
    `feature: ${f.id} — ${f.title} (small lane: the whole feature is one task)`,
    `worktree: ${SPINE} worktree create ${f.branch} --from ${snapshot.target}`,
    `commit subject: "${f.id}/feature: <what landed>"`,
    '',
    'feature acceptance (each criterion gets a red-then-green test):',
    criteriaList(f.acceptance),
    '',
    '--- feature design doc ---',
    f.designDoc || '(none recorded)',
    '',
    menu(f),
  ].join('\n');
}

function validatePrompt(f, branches) {
  return [
    `feature: ${f.id} — ${f.title}`,
    `target: ${snapshot.target} · integration worktree: ${SPINE} worktree create integrate--${f.id} --from ${snapshot.target}`,
    `merge, in order: ${branches.join(', ')}`,
    `spine: ${SPINE}`,
    '',
    'acceptance criteria to judge:',
    criteriaList(f.acceptance),
    '',
    'runtime probe binding:',
    snapshot.probe || '(none recorded — skip the runtime leg and say so)',
    '',
    '--- feature design doc ---',
    f.designDoc || '(none recorded)',
    '',
    menu(f),
  ].join('\n');
}

// ---- generic ready-set scheduler: run every item whose deps are satisfied, launch
// newly-ready items as results land. `run` resolves true on success; false stops
// dependents; 'halt' stops the whole walk.
async function readySetRun({ ids, depsOf, run, onUnreachable }) {
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
  // A halt stops the walk mid-flight — the un-started remainder isn't "unreachable",
  // the run just ended; the BoundaryResult's `halted` explains them.
  if (!didHalt) { for (const id of pending) { onUnreachable(id); } }
}

// Validators write the integration target; serialize them (ADR-0038: merges happen
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
  if (f.plan) { return { lane: 'standard', tasks: f.plan.tasks }; }
  const binding = roleBinding('plan');
  const planned = await spawn(planPrompt(f), {
    agentType: 'plan', label: `${modelLabel(binding)}plan:${f.id}`, phase: 'Plan', schema: PLAN_SCHEMA, ...modelOpts(binding),
  }, f.id);
  const flow = signalOf(planned);
  if (flow) { return { flow }; }
  if (planned.result === 'bounce' || planned.result === 'blocked') {
    blocked.push({ feature: f.id, reason: planned.detail, options: planned.options });
    return { flow: 'fail' };
  }
  if (planned.lane === 'small') { return { lane: 'small' }; }
  return { lane: 'standard', tasks: planned.tasks };
}

function buildSpawnOpts(f, task, binding) {
  return { agentType: 'build', label: `${modelLabel(binding)}build:${f.id}/${task.id}`, phase: 'Build', schema: BUILD_SCHEMA, ...modelOpts(binding) };
}

async function runTask(f, task, prompt) {
  if (task.tier == null) { log(`model-selection — task ${f.id}/${task.id} has no tier, routing build.standard`); }
  const binding = roleBinding(`build.${task.tier ?? 'standard'}`);
  const opts = buildSpawnOpts(f, task, binding);
  if (binding.via && binding.via !== 'agent') {
    const driverBinding = hasRole(`drive.${binding.via}`) ? modelTable[`drive.${binding.via}`] : roleBinding('drive');
    log(`model-selection — task ${f.id}/${task.id} routed via ${binding.via}/${binding.model}, driver ${driverBinding.model}`);
    return spawn(`executor: ${binding.via} · executor-model: ${binding.model}\n${prompt}`, {
      ...opts, agentType: 'drive', label: `${modelLabel(driverBinding)}drive:${f.id}/${task.id} via ${binding.via}`, ...modelOpts(driverBinding),
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

// Build every task in dependency order, concurrent where the DAG allows (unordered
// tasks are footprint-disjoint by plan-check construction, each in its own worktree
// on its own branch — ADR-0038). Returns true when every task landed.
async function runBuild(f, tasks) {
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const already = new Set(f.builtTasks || []);
  let didAllLand = true;
  await readySetRun({
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

async function runValidate(f, lane, tasks) {
  const branches = lane === 'small'
    ? [f.branch]
    : [f.branch, ...topoOrder(tasks).map((t) => taskBranch(f, t.id))];
  const binding = roleBinding('validate');
  const verdict = await withValidateLock(() => spawn(validatePrompt(f, branches), {
    agentType: 'validate', label: `${modelLabel(binding)}validate:${f.id}`, phase: 'Validate', schema: VALIDATE_SCHEMA, ...modelOpts(binding),
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
  const f = snapshot.features[id];
  const plan = await runPlan(f);
  if (plan.flow) { return plan.flow === 'halt' ? 'halt' : false; }

  if (plan.lane === 'small') {
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

// ---- the run: ready-set over the scoped subgraph (ADR-0038). Deps outside the scope
// were gated as already-landed by `spine launch`; deps inside it unblock as they land.
const inScope = new Set(snapshot.scope);
const depsWithin = (id) => (snapshot.features[id].depends_on || []).filter((d) => inScope.has(d));
await readySetRun({
  ids: snapshot.scope,
  depsOf: depsWithin,
  run: runFeature,
  onUnreachable: (id) => { stalled.push({ feature: id, agent: 'scheduler', note: 'an in-scope dependency did not land this run' }); },
});

const result = { completed, blocked, stalled, budget: { spent: budget.spent, remaining: budget.remaining } };
if (halted) { result.halted = halted; }
log(JSON.stringify(result)); // belt-and-braces echo of the completion channel
return result;
