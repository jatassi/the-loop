// The Workflow orchestration (ADR-0029): script = brain, agents = hands. This file has
// no filesystem — it consumes the artifact spine only through the `args` snapshot the
// launch leg assembled, and it never `import`s anything: `agent`, `parallel`, `pipeline`,
// `log`, `args`, `budget` all arrive as harness globals (declared for eslint in the
// workflows/ block of eslint.config.js). The completion channel is the pinned shape a
// workflow script exports: a single `export const meta` line, and a bare top-level
// `return` of the BoundaryResult once the harness (and test/workflow-shim.js, in tests)
// applies its own async-body transform to this text.
export const meta = { name: 'inner-loop', description: 'One autonomous pass over the feature graph: Plan → Build → Validate per in-scope feature, park-and-drain, ending in a BoundaryResult', whenToUse: 'Launched by /the-loop with the args orientation snapshot — never invoked bare' };

// Some callers deliver args as a JSON-encoded string rather than the parsed snapshot;
// normalize into a local before anything reads it — the launch leg cannot control the
// delivery shape, and the harness global itself is read-only.
const snapshot = typeof args === 'string' ? JSON.parse(args) : args;

// A dependency is satisfied once its feature has shipped its validated result; these are
// the only statuses the engine may still advance without a human decision (ADR-0029).
const DONE_STATUSES = new Set(['validated', 'shipped']);
const RUNNABLE_STATUSES = new Set(['designed', 'planned', 'building']);

// Spawn schemas (the harness validates each return against these, in strict JSON Schema
// mode — no invented keywords). The schema doubles as the agent's return TEMPLATE: a
// field left undescribed gets silently dropped from the structured return (first-run
// finding), so every pinned per-result field is described in properties even though
// only the always-present keys are required.
const strings = (...names) => Object.fromEntries(names.map((n) => [n, { type: 'string' }]));
const stringArray = { type: 'array', items: { type: 'string' } };
const phaseSchema = (results, required, extras) => ({
  type: 'object',
  properties: { result: { enum: results }, ...strings(...required), ...extras },
  required: ['result', ...required],
});
const TASK_SUMMARY = {
  type: 'array',
  items: {
    type: 'object',
    properties: { ...strings('id', 'status', 'size'), depends_on: stringArray },
    required: ['id'],
  },
};
const PLAN_SCHEMA = phaseSchema(['planned', 'bounce', 'blocked'], ['feature'], {
  tasks: TASK_SUMMARY, ...strings('plan', 'notes', 'kind', 'deviation', 'detail'), menu: stringArray,
});
const BUILD_SCHEMA = phaseSchema(['built', 'blocked'], ['task'], {
  ...strings('kind', 'summary'), deviations: stringArray, menu: stringArray,
  footprint_actual: stringArray, diff_actual: { type: 'object' },
});
const DERIVE_SCHEMA = phaseSchema(['derived', 'blocked'], ['feature'], {
  expectations: { type: 'array', items: { type: 'object' } }, ambiguities: stringArray, missing: stringArray,
});
const VALIDATE_SCHEMA = phaseSchema(['perfect', 'deviation', 'remediation-pending', 'blocked'], ['feature'], {
  ...strings('kind', 'deviation', 'detail', 'remediation_task', 'patch_id', 'reconstruction'),
  menu: stringArray, merged: { type: 'boolean' }, dedup: { type: 'boolean' },
});

// In-memory status view, seeded from the snapshot's index and updated as agents return — the
// frontier below is computed against this, not the on-disk snapshot, so a dependency
// validated earlier in this same run unblocks its dependents without a re-read.
const statusById = new Map(snapshot.index.features.map((f) => [f.id, f.status]));
const nodeById = new Map(snapshot.index.features.map((f) => [f.id, f]));

function dependenciesSatisfied(featureId) {
  const node = nodeById.get(featureId);
  return (node?.depends_on || []).every((dep) => DONE_STATUSES.has(statusById.get(dep)));
}

function isRunnable(featureId) {
  return RUNNABLE_STATUSES.has(statusById.get(featureId)) && dependenciesSatisfied(featureId);
}

// Topological order over a task-summary list ({id, depends_on, …}) — depends_on first,
// stable in input order otherwise; the plan return's array order is not the build order.
function orderTasks(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ordered = [];
  const seen = new Set();
  const visit = (id) => {
    if (seen.has(id)) { return; }
    seen.add(id);
    const task = byId.get(id);
    if (!task) { return; }
    const deps = task.depends_on || [];
    for (const dep of deps) { visit(dep); }
    ordered.push(task);
  };
  for (const task of tasks) { visit(task.id); }
  return ordered;
}

// Budget-exhaustion identity (ADR-0029): matched only on `name`/`code`, never message
// text — the true harness identity is confirmed at the first live run, and this
// conservative match degrades an unrecognized budget throw to a stall, never a wrong
// halt.
function isBudgetExhausted(error) {
  return /budget/i.test(`${error?.name ?? ''} ${error?.code ?? ''}`);
}

// Derive's `blocked` carries no `kind` field — any blocked return from it is
// environment-shaped by convention (an args-construction defect, per the pinned
// return-shape deltas); plan, build, and validate each type their own blocked return,
// so only their own `kind` decides for them.
function isEnvironmentBlock(agentType, r) {
  return r.result === 'blocked' && (agentType === 'derive' || r.kind === 'environment');
}

// A signal to bubble straight back up to the outer loop unrecorded — run-shaped
// (`halted`) or feature-shaped (`stalled`) — as opposed to a park, which callers push
// to the shared list themselves. Every phase result funnels through `spawn`, so this is
// the one shape test every caller above it needs.
function isSignal(r) {
  return Boolean(r.halted || r.stalled);
}

// The one spawn choke point every phase call funnels through: classifies a thrown error
// or the agent's own return per the pinned exception policy (ADR-0029). Returns either
// the ordinary agent return, or a run-level `{halted}`/feature-level `{stalled}` signal
// — every caller up the chain checks for those two keys identically and returns them
// straight up, so a signal from any phase reaches the outer loop unchanged.
async function spawn(prompt, opts, featureId) {
  let r;
  try {
    r = await agent(prompt, opts);
  } catch (error) {
    if (isBudgetExhausted(error)) { return { halted: { reason: 'budget-exhausted', detail: error.message } }; }
    return { stalled: { feature: featureId, phase: opts.agentType, note: error.message } };
  }
  if (r == null) {
    return { stalled: { feature: featureId, phase: opts.agentType, note: 'agent returned null' } };
  }
  if (isEnvironmentBlock(opts.agentType, r)) {
    return { halted: { reason: 'environment-blocked', detail: r.detail } };
  }
  return r;
}

// Runs the feature's pending tasks in depends_on order; returns the first feature-kind
// blocked return (build.md's "first block parks" contract), or a halted/stalled signal
// from `spawn` — either way the caller stops there. Undefined once every task has built
// cleanly. A missing task list (a planned return or args.plans entry that carried no
// summaries) stalls the feature rather than crashing the run — the plan itself is
// already booked durable, so the next pass re-enters Build with a corrected snapshot.
async function runBuild(featureId, tasks) {
  if (!Array.isArray(tasks)) {
    return { stalled: { feature: featureId, phase: 'plan', note: 'no task summaries reached the script (planned return or args.plans entry empty) — plan artifact is booked; re-run with a corrected snapshot' } };
  }
  const pending = orderTasks(tasks).filter((task) => task.status !== 'built');
  for (const task of pending) {
    const built = await spawn(`feature: ${featureId}\ntask: ${task.id}`, {
      agentType: 'build', label: `build:${featureId}/${task.id}`, phase: featureId, schema: BUILD_SCHEMA,
    }, featureId);
    if (built.halted || built.stalled) { return built; }
    if (built.result === 'blocked' && built.kind === 'feature') { return built; }
  }
}

// Spawns Validate carrying an expectation sheet — factored out because the remediation
// round (below) re-spawns it a second time against the very same sheet.
async function runValidate(featureId, sheet) {
  return spawn(
    `feature: ${featureId}\nexpectation-sheet: ${JSON.stringify(sheet)}`,
    { agentType: 'validate', label: `validate:${featureId}`, phase: featureId, schema: VALIDATE_SCHEMA },
    featureId,
  );
}

// Plan's bounce and validate's deviation verdict return `deviation` for the defect
// prose; build's blocked return returns it plural as `deviations`; validate's own
// feature-shaped blocked return (a semantic rebase conflict at readiness) carries
// neither — its prose lives in `detail` instead. This reconciles all three into the
// one parked-entry shape the pinned BoundaryResult names: { feature, deviation, menu }.
function parkEntry(featureId, r) {
  return { feature: featureId, deviation: r.deviation ?? r.deviations?.join('; ') ?? r.detail, menu: r.menu };
}

// The one bounded remediation round (ADR-0029): build the named round-marker task —
// reusing `runBuild`'s own feature-blocked handling for the single task — then
// re-validate against the pass-1 expectation sheet already in hand. The deriver never
// respawns; the round-marker's presence in the plan is what makes a second
// remediation-pending on the same feature a protocol violation rather than a retry, so
// that case stalls instead of recursing into a second round. A feature-kind block on
// the round's own build is parked directly here (rather than bubbled as a raw `blocked`
// verdict) so runFeature's final fallthrough stays exactly what it was pre-remediation.
async function runRemediation(featureId, remediationTask, sheet) {
  const blocked = await runBuild(featureId, [{ id: remediationTask, status: 'pending', depends_on: [] }]);
  if (blocked) {
    if (isSignal(blocked)) { return blocked; }
    parked.push(parkEntry(featureId, blocked));
    return { parked: true };
  }

  const verdict = await runValidate(featureId, sheet);
  if (verdict.result !== 'remediation-pending') { return verdict; }
  return { stalled: { feature: featureId, phase: 'validate', note: 'a second remediation-pending on the same feature — protocol violation' } };
}

// Runs Plan when the feature enters `designed`; otherwise resumes from the task list
// already on record for it (`snapshot.plans`). Returns `{tasks}` to proceed into Build, the
// bounce return itself for the caller to park, or a halted/stalled signal.
async function runPlan(featureId) {
  if (statusById.get(featureId) !== 'designed') { return { tasks: snapshot.plans[featureId] }; }
  const planned = await spawn(`feature: ${featureId}`, {
    agentType: 'plan', label: `plan:${featureId}`, phase: featureId, schema: PLAN_SCHEMA,
  }, featureId);
  if (isSignal(planned) || planned.result === 'bounce') { return planned; }
  return { tasks: planned.tasks };
}

// Derive the pass-1 expectation sheet, validate against it, and run the one bounded
// remediation round when the verdict comes back remediation-pending. Returns the final
// verdict (perfect/deviation/blocked) or a halted/stalled signal.
async function runValidationCycle(featureId) {
  const derived = await spawn(
    `feature: ${featureId}\nslice: ${JSON.stringify(snapshot.slices[featureId])}\nprobe: ${JSON.stringify(snapshot.probe)}`,
    { agentType: 'derive', label: `derive:${featureId}`, phase: featureId, schema: DERIVE_SCHEMA, effort: 'low' },
    featureId,
  );
  if (isSignal(derived)) { return derived; }
  const sheet = { expectations: derived.expectations, ambiguities: derived.ambiguities };

  const verdict = await runValidate(featureId, sheet);
  if (isSignal(verdict) || verdict.result !== 'remediation-pending') { return verdict; }
  return runRemediation(featureId, verdict.remediation_task, sheet);
}

const completed = [];
const parked = [];
const stalled = [];
let halted;

// One feature, start to (attempted) finish: Plan (unless a plan already exists) → Build
// the remaining tasks → Derive the pass-1 expectation sheet → Validate against it. A
// feature-shaped park at any phase stops the rest of this feature's own sequence and
// records the park directly; a halted/stalled signal from `spawn` propagates straight
// back up unrecorded — the outer loop is the one place that acts on it. Neither a park
// nor a stall ever stops a *different* feature's own run — the caller moves on, and the
// frontier keeps a parked feature's dependents excluded since its status never advances
// past `designed`/`planned`/`building`.
async function runFeature(featureId) {
  const planResult = await runPlan(featureId);
  if (isSignal(planResult)) { return planResult; }
  if (planResult.result === 'bounce') {
    parked.push(parkEntry(featureId, planResult));
    return;
  }

  const blocked = await runBuild(featureId, planResult.tasks);
  if (blocked) {
    if (isSignal(blocked)) { return blocked; }
    parked.push(parkEntry(featureId, blocked));
    return;
  }

  const verdict = await runValidationCycle(featureId);
  if (isSignal(verdict)) { return verdict; }
  if (verdict.parked) { return; } // the remediation round parked itself already
  return verdict;
}

// Files a finished feature's verdict into the run's shared result lists — kept out of
// the outer loop's own scope so its branching doesn't inflate that loop's complexity.
// Returns true when the verdict halted the run, the caller's signal to stop iterating
// scope entirely.
function recordVerdict(featureId, verdict) {
  if (verdict.halted) {
    halted = verdict.halted; // run-shaped: stop spawning anything further, for any feature
    return true;
  }
  if (verdict.stalled) {
    stalled.push(verdict.stalled); // this feature only; the drain continues
    return false;
  }
  if (verdict.result === 'perfect') {
    statusById.set(featureId, 'validated');
    completed.push(featureId);
  } else if (verdict.result === 'deviation' || (verdict.result === 'blocked' && verdict.kind === 'feature')) {
    // the latter is validate's own feature-shaped readiness block (a semantic rebase
    // conflict) — it already booked its park and reaches here as an ordinary blocked
    // return, since only `kind: environment` gets converted to `halted` upstream (spawn).
    parked.push(parkEntry(featureId, verdict));
  }
  return false;
}

for (const featureId of snapshot.scope) {
  if (!isRunnable(featureId)) {
    log(`inner-loop: skipping ${featureId} — not runnable`);
    continue;
  }
  const verdict = await runFeature(featureId);
  if (!verdict) { continue; } // already parked (or otherwise recorded) inside runFeature
  if (recordVerdict(featureId, verdict)) { break; } // halted: no further feature runs
}

const result = { completed, parked, stalled, budget: { spent: budget.spent, remaining: budget.remaining } };
if (halted) { result.halted = halted; }
log(JSON.stringify(result)); // belt-and-braces echo of the completion channel (ADR-0029)
return result;
