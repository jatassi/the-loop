// The execution-pipeline engine (ADR-0036/0038): script = brain, agents = hands. This
// file has no filesystem — it consumes the `the-loop prepare-execution-context`
// execution context via `args` and never imports anything: `agent`, `log`, `args`,
// `budget` arrive as harness globals (declared for eslint in the workflows/ block of
// eslint.config.js). It pushes each worker's task brief (contract + refs) into the
// prompt — workers fetch nothing to start — and schedules a concurrency policy over
// features and tasks, so anything whose dependencies are satisfied runs concurrently
// in its own worktree. The completion channel is a bare top-level `return` of the run
// summary.
export const meta = { name: 'execution-pipeline', description: 'One autonomous pass over the scoped feature graph: Plan → Build → Validate per feature, concurrent where dependencies allow, ending in a run summary', whenToUse: 'Launched by /begin with the `the-loop prepare-execution-context` execution context as args — never invoked bare', phases: [{ title: 'Plan' }, { title: 'Build' }, { title: 'Validate' }, { title: 'Record' }] };

// Some callers deliver args as a JSON-encoded string rather than the parsed execution context.
const executionContext = typeof args === 'string' ? JSON.parse(args) : args;
const CLI = executionContext.cli || 'node plugin/bin/the-loop.js';

// ---- agent-type resolution. Installed-plugin sessions register the plugin's agents
// under the plugin namespace (`the-loop:plan`, …); only a repo that symlinks
// agents/*.md into .claude/agents/ (this dev repo does) also exposes the bare names.
// Spawn by the namespaced name so a run works in any target project, not just here.
// The execution context may override the namespace (a fork under a different plugin
// name) or set it to '' to spawn the bare names.
const AGENT_NS = executionContext.agentNamespace ?? 'the-loop';
const agentTypeFor = (role) => (AGENT_NS ? `${AGENT_NS}:${role}` : role);
// role-agent-binding (ADR-0050): a bound `agent` is the spawn's agentType as-is
// (harness registry resolves the name); unbound keeps the namespaced bundled type.
const agentTypeForRole = (role, binding) => binding.agent || agentTypeFor(role);

const asList = (x) => (Array.isArray(x) ? x : [x]);

// ---- model bindings (ADR-0030/0050): role → {model, effort?, executor?, agent?};
// unbound falls back to the session model with one visible log line. agent+executor
// on one role is a named configuration gap — can't-run, reported as blocked (a human
// must fix the config; distinct from stalled, which the scheduler silently retries).
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

// ---- calibration observation collector (ADR-0046): the script observes, the record
// agent transcribes. Every awaited spawn is sampled at the one choke point below —
// per-feature per-role counts and a per-role spend delta read from `budget.spent()` (a
// method — the harness's budget metric throws "No default value" on any implicit
// primitive coercion, so it must be called, never read as a property and used in
// arithmetic or a template; called identically here and at the run-summary read site)
// — and concurrency is watched so the payload can flag whether
// the per-role split was measured serially or across overlapping spawns (approximate by
// construction, and the record says so structurally).
const ROLES = ['plan', 'build', 'drive', 'validate'];
const zeroRoles = () => Object.fromEntries(ROLES.map((r) => [r, 0]));
const featureObs = new Map();
function obsFor(id) {
  let o = featureObs.get(id);
  if (o === undefined) {
    o = { workflow_path: null, tasks: [], agents: zeroRoles(), reslice: null };
    featureObs.set(id, o);
  }
  return o;
}
const taskContracts = (tasks) => (tasks || []).map((t) => ({
  id: t.id, size: t.size ?? null, judgment_level: t.judgment_level ?? null, footprint: t.footprint || [],
}));
// YAML scalars for the record payload. `yamlUnknown` renders script-final unknowns as
// `~` (and JSON-quotes present strings for validity); `yamlToken` passes a bare token
// through, `~` when absent; `yamlInline`/`yamlRoleMap` render the two flow collections.
const yamlUnknown = (v) => (v == null ? '~' : JSON.stringify(v));
const yamlToken = (v) => v ?? '~';
const yamlInline = (arr) => `[${arr.join(', ')}]`;
const yamlRoleMap = (m) => `{ ${ROLES.map((r) => `${r}: ${m[r]}`).join(', ')} }`;
const budgetByRole = zeroRoles();
let spawnsInFlight = 0;
let didSpawnsOverlap = false;

// ---- the one spawn choke point: classifies thrown errors and environment blocks
// into run-level halts / feature-level stalls that every stage reports identically.
function isBudgetExhausted(error) {
  return /budget/i.test(`${error?.name ?? ''} ${error?.code ?? ''}`);
}
async function spawn(prompt, opts, { featureId, role }) {
  const spentBefore = budget.spent();
  spawnsInFlight += 1;
  if (spawnsInFlight > 1) { didSpawnsOverlap = true; }
  obsFor(featureId).agents[role] += 1;
  let r;
  try {
    r = await agent(prompt, opts);
  } catch (error) {
    if (isBudgetExhausted(error)) { return { halted: { reason: 'budget-exhausted', detail: error.message } }; }
    return { stalled: { feature: featureId, agent: opts.agentType, note: error.message } };
  } finally {
    spawnsInFlight -= 1;
    budgetByRole[role] += Math.max(0, budget.spent() - spentBefore);
  }
  if (r == null) { return { stalled: { feature: featureId, agent: opts.agentType, note: 'agent returned null' } }; }
  if (r.result === 'blocked' && r.kind === 'environment') {
    return { stalled: { feature: featureId, agent: opts.agentType, note: r.detail } };
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
    // Recall: the deterministic digest of this repository's own run history rides the
    // plan prompt only when prepare-execution-context found docs/calibration/index.md.
    // A repo with no calibration history leaves this off entirely — the prompt is then
    // byte-identical to a pre-calibration run's.
    ...(executionContext.calibration ? ['', "calibration digest (this repository's run history):", executionContext.calibration] : []),
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
    'validation-procedure binding:',
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
  if (f.plan) {
    const o = obsFor(f.id);
    o.workflow_path = 'standard';
    o.tasks = taskContracts(f.plan.tasks);
    return { workflow_path: 'standard', tasks: f.plan.tasks };
  }
  const binding = roleBinding('plan');
  // Configuration gap short-circuits as a blocked agent reply so the path below pushes blocked.
  const planned = binding.gap
    ? { result: 'blocked', detail: binding.gap }
    : await spawn(planPrompt(f), {
      agentType: agentTypeForRole('plan', binding), label: f.id, phase: 'Plan', schema: PLAN_SCHEMA, ...modelOpts(binding),
    }, { featureId: f.id, role: 'plan' });
  const flow = signalOf(planned);
  if (flow) { return { flow }; }
  if (planned.result === 'needs_refinement' || planned.result === 'blocked') {
    if (planned.result === 'needs_refinement') { obsFor(f.id).reslice = planned.detail ?? null; }
    blocked.push({ feature: f.id, reason: planned.detail, options: planned.options });
    return { flow: 'fail' };
  }
  if (planned.workflow_path === 'small') { obsFor(f.id).workflow_path = 'small'; return { workflow_path: 'small' }; }
  const o = obsFor(f.id);
  o.workflow_path = 'standard';
  o.tasks = taskContracts(planned.tasks);
  return { workflow_path: 'standard', tasks: planned.tasks };
}

function buildSpawnOpts(f, task, { binding, prefix = '' }) {
  return { agentType: agentTypeForRole('build', binding), label: `${prefix}${f.id}/${task.id}`, phase: 'Build', schema: BUILD_SCHEMA, ...modelOpts(binding) };
}

// `prefix` is `(<pos>/<N>) ` when the feature built as 2+ tasks (computed by `runBuild`
// from the task's position in the plan's task array), empty otherwise — the sole source
// of the ordinal is that array, never the task id (build-agent-title-progress). It rides
// both the ordinary build label and the drive-path override below.
// Shared executor reroute (ADR-0047): any routing-surface role whose binding names an
// executor spawns the drive agent instead, prompt prefixed with the executor header;
// the drive model comes from drive.<executor> when bound, else drive.
function executorReroute({ binding, prompt, opts, label, featureId, role }) {
  const driveBinding = hasRole(`drive.${binding.executor}`) ? modelTable[`drive.${binding.executor}`] : roleBinding('drive');
  if (driveBinding.gap) { return { result: 'blocked', detail: driveBinding.gap }; }
  log(`model-selection — ${role} routed via ${binding.executor}/${binding.model}, drive ${driveBinding.model}`);
  return spawn(`executor: ${binding.executor} · executor-model: ${binding.model}\n${prompt}`, {
    ...opts, agentType: agentTypeForRole('drive', driveBinding), label, ...modelOpts(driveBinding),
  }, { featureId, role: 'drive' });
}

async function runTask(f, task, { prompt, prefix = '' }) {
  if (task.judgment_level == null) { log(`model-selection — task ${f.id}/${task.id} has no judgment_level, routing build.standard`); }
  const role = `build.${task.judgment_level ?? 'standard'}`;
  const binding = roleBinding(role);
  // Same shape a blocked agent reply takes — taskOutcome's existing branch pushes blocked.
  if (binding.gap) { return { result: 'blocked', detail: binding.gap }; }
  const opts = buildSpawnOpts(f, task, { binding, prefix });
  if (binding.executor && binding.executor !== 'agent') {
    return executorReroute({
      binding, prompt, opts, label: `${prefix}${f.id}/${task.id} via ${binding.executor}`, featureId: f.id, role: `task ${f.id}/${task.id}`,
    });
  }
  return spawn(prompt, opts, { featureId: f.id, role: 'build' });
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
  // Position is the task's fixed 1-based slot in the plan's declared task array — never
  // the DAG build order (concurrent, so it varies run to run) and never parsed from the
  // free-form task id. A single-task plan gets no prefix; `(1/1)` is pure noise.
  const positionOf = new Map(tasks.map((t, i) => [t.id, i + 1]));
  const prefixFor = (id) => (tasks.length >= 2 ? `(${positionOf.get(id)}/${tasks.length}) ` : '');
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
      const outcome = taskOutcome(f, await runTask(f, task, { prompt: buildPrompt(f, task, { base, mergeBranches }), prefix: prefixFor(id) }));
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
  return taskOutcome(f, await runTask(f, task, { prompt: smallBuildPrompt(f) })) === true;
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
  const opts = { agentType: agentTypeForRole('validate', binding), label: f.id, phase: 'Validate', schema: VALIDATE_SCHEMA, ...modelOpts(binding) };
  // Configuration gap short-circuits as a non-validated verdict — existing branch pushes blocked.
  const verdict = binding.gap
    ? { result: 'blocked', detail: binding.gap }
    : await withValidateLock(() => {
      if (binding.executor && binding.executor !== 'agent') {
        return executorReroute({
          binding, prompt: validatePrompt(f, branches), opts, label: `${f.id} via ${binding.executor}`, featureId: f.id, role: `validate ${f.id}`,
        });
      }
      return spawn(validatePrompt(f, branches), opts, { featureId: f.id, role: 'validate' });
    });
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

// ---- record-payload assembly (ADR-0046): a pure, deterministic function over what the
// script observed → the byte-final YAML the record agent transcribes verbatim. Ordering
// is fixed (scope order for features, plan order for tasks, the ROLES order for every
// role map); `prepared_at` is the only timestamp; `features[].actual` is emitted as
// explicit `null`s the record agent fills with git-derived enrichment. Same observations
// in → byte-identical string out. Hand-rolled because this script imports nothing.
function recordPayload(obs, result, run) {
  const completedSet = new Set(result.completed);
  const blockedBy = new Map(result.blocked.map((b) => [b.feature, b]));
  const stalledBy = new Map(result.stalled.map((s) => [s.feature, s]));
  const outcomeOf = (id) => {
    if (completedSet.has(id)) { return 'validated'; }
    if (blockedBy.has(id)) { return 'blocked'; }
    if (stalledBy.has(id)) { return 'stalled'; }
    return 'unreached';
  };
  const reasonOf = (id) => (blockedBy.get(id)?.reason ?? stalledBy.get(id)?.note ?? null);
  const emptyObs = { workflow_path: null, tasks: [], agents: zeroRoles(), reslice: null };
  const featureBlock = (id) => {
    const f = obs.features.get(id) || emptyObs;
    const taskLines = f.tasks.length === 0
      ? ['    tasks: []']
      : ['    tasks:', ...f.tasks.map((t) => `      - { id: ${t.id}, size: ${yamlToken(t.size)}, judgment_level: ${yamlToken(t.judgment_level)}, footprint: ${yamlInline(t.footprint)} }`)];
    return [
      `  - id: ${id}`,
      `    workflow_path: ${yamlToken(f.workflow_path)}`,
      `    outcome: ${outcomeOf(id)}`,
      `    reason: ${yamlUnknown(reasonOf(id))}`,
      `    reslice: ${yamlUnknown(f.reslice)}`,
      `    agents: ${yamlRoleMap(f.agents)}`,
      ...taskLines,
      // features[].actual arrives as explicit nulls the record agent fills from git (ADR-0038).
      '    actual:',
      '      files_touched: null',
      '      insertions: null',
      '      deletions: null',
      '      commits: null',
      '      duration_minutes: null',
    ];
  };
  return [
    'run:',
    `  prepared_at: ${run.preparedAt}`,
    `  target: ${run.target}`,
    `  scope: ${yamlInline(run.scope)}`,
    '  tokens:',
    `    spent: ${result.budget.spent}`,
    `    by_role: ${yamlRoleMap(obs.byRole)}`,
    `    attribution: ${obs.overlapped ? 'overlapped' : 'serial'}`,
    `  halted: ${result.halted ? yamlUnknown(result.halted.reason) : '~'}`,
    'features:',
    ...run.scope.flatMap((id) => featureBlock(id)),
  ].join('\n');
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

const result = { completed, blocked, stalled, budget: { spent: budget.spent(), remaining: budget.remaining() } };
if (halted) { result.halted = halted; }

// ---- calibration capture (ADR-0046): after the run summary is assembled — every path,
// blocked and halt included — spawn the record agent to transcribe the byte-final
// payload. This can never alter, delay-fail, or replace the completion channel:
//   • no `executionContext.preparedAt` → no clock to stamp/seed the record, so capture is
//     a silent no-op (a pre-calibration context, incl. every legacy fixture, is untouched);
//   • a budget-exhausted halt → a further spawn would just throw, so skip with one log line;
//   • otherwise spawn inside try/catch: any failure logs exactly one line and the run
//     summary is returned byte-identical.
if (executionContext.preparedAt) {
  if (halted?.reason === 'budget-exhausted') {
    log('calibration — record skipped: budget-exhausted halt would throw on a further spawn');
  } else {
    const observations = { features: featureObs, byRole: budgetByRole, overlapped: didSpawnsOverlap };
    const payload = recordPayload(observations, result, { preparedAt: executionContext.preparedAt, scope: executionContext.scope, target: executionContext.target });
    const recordBinding = roleBinding('record');
    // Trailer names the CLI invocation for the record agent; it is NOT part of the
    // transcribed calibration artifact — `payload` stays byte-identical for capture.
    try {
      await agent(`${payload}\n\ncli: ${CLI}`, {
        agentType: agentTypeForRole('record', recordBinding), label: 'record', phase: 'Record', ...modelOpts(recordBinding),
      });
    } catch (error) {
      log(`calibration — record spawn failed, run summary unchanged: ${error.message}`);
    }
  }
}

log(JSON.stringify(result)); // belt-and-braces echo of the completion channel
return result;
