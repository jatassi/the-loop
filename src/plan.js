// The plan artifact (docs/plans/<feature-id>.md): parse + validate for the per-feature
// task-contract block — the Plan → Build handoff. Mirrors the design spine's split of
// concerns: parsePlan() is lenient and structural; semantics — coverage, overlap
// ordering, sizing, edges — live in validatePlan(); render.js handles the round-trip
// (its _blocks shape is shared).
//
// A plan carries contracts only — no task status, no folded reports (ADR-0034/0037):
// a task's state is derived from git (its branch and commit exist or they don't), and
// the plan file itself lives on the feature branch, never the integration target, so
// it disappears when the feature's squash-merge lands.

import YAML from 'yaml';

import { yamlBlockAfter } from './blocks.js';
import { findCycle } from './schema.js';

/**
 * Size classes a persisted task may carry. The plan agent over-decomposes until each
 * task is comfortably small: xs/s pass silently, m is the comfort ceiling (allowed, but
 * flagged — the plan's wiring note must justify why it can't split), and anything larger
 * is not representable here: it must be split, or the feature bounces up to re-slice.
 */
export const TASK_SIZES = ['xs', 's', 'm'];

/**
 * Decision-density classes a task may be stamped with — how much the task leaves the
 * builder to decide, not its size. `rote` additionally requires correctness fully
 * captured by the task's tests + lint; when unsure between `rote` and `standard`,
 * choose `standard`. Selects the `build.<tier>` model binding downstream (ADR-0030).
 */
export const TASK_TIERS = ['rote', 'standard', 'complex'];

const HEADING = '## Tasks';

/** The conventional location of a feature's plan artifact. */
export function planPath(featureId, root = 'docs/plans') {
  return `${root}/${featureId}.md`;
}

/**
 * @typedef {Object} TaskContract
 * @property {string} id            unique within the plan; global handle is <feature>/<id>
 * @property {string} title
 * @property {number[]} covers      1-based indexes into the feature's acceptance criteria
 * @property {string|string[]} acceptance  the task's own observable, binary criterion
 * @property {string[]} footprint   expected files created/modified
 * @property {string} size          xs | s | m
 * @property {string} [tier]        rote|standard|complex — decision-density, stamped at Plan
 * @property {string[]} depends_on  task-ordering edges (overlapping footprints must be chained)
 * @property {string} [wiring]      short per-task wiring note — how this task connects to the rest
 */

/**
 * @typedef {Object} PlanModel
 * @property {string} feature        the feature id this plan decomposes
 * @property {number} designVersion  the design_version the plan was cut from (drift stamp)
 * @property {TaskContract[]} tasks
 * @property {{tasks: ({doc: YAML.Document, span: import('./blocks.js').Span}|null)}} _blocks
 */

/**
 * Parse a plan artifact into a structural model. Lenient like parse(): a missing block
 * yields an empty task list; semantic problems are validatePlan()'s job.
 * @param {string} text
 * @returns {PlanModel}
 */
export function parsePlan(text) {
  const span = yamlBlockAfter(text, HEADING);
  const doc = span ? YAML.parseDocument(span.inner) : null;
  const js = (doc && doc.toJS()) || {};
  return {
    feature: js.feature,
    designVersion: js.design_version,
    tasks: (js.tasks || []).map((t) => normalizeTask(t)),
    _blocks: { tasks: span ? { doc, span } : null },
  };
}

function normalizeTask(t) {
  return {
    id: t.id,
    title: t.title,
    covers: t.covers || [],
    acceptance: t.acceptance,
    footprint: t.footprint || [],
    size: t.size,
    depends_on: t.depends_on || [],
    ...((t.tier != null) && { tier: t.tier }),
    ...((t.wiring != null) && { wiring: t.wiring }),
  };
}

/**
 * Validate a plan against the design it was cut from. Errors block (the plan is
 * malformed as a contract); warnings inform — a stale drift stamp or a task at the
 * size ceiling is a signal, not a blocker.
 * @param {PlanModel} plan
 * @param {import('./parse.js').DesignModel} design
 * @returns {{ok: boolean, errors: import('./schema.js').Issue[], warnings: import('./schema.js').Issue[]}}
 */
export function validatePlan(plan, design) {
  const errors = [];
  const warnings = [];
  const err = (code, message, where) => { errors.push({ code, message, where }); };
  const warn = (code, message, where) => { warnings.push({ code, message, where }); };

  checkPlanShape(plan, err);

  const feature = matchFeature(plan, design, { err, warn });
  const criteria = criteriaOf(feature);

  const tasks = plan.tasks || [];
  const ids = collectTaskIds(tasks, err);

  const covered = new Set();
  for (const t of tasks) {
    if (!t.id) { continue; }
    checkTaskFields(t, { err, warn });
    checkTaskTier(t, { err, warn });
    checkTaskCovers(t, { err, criteria, covered });
    checkTaskEdges(t, { err, ids });
  }

  checkCoverage({ feature, tasks, criteria, covered, err });

  const cycle = findCycle(tasks);
  if (cycle) { err('task-dependency-cycle', `depends_on cycle: ${cycle.join(' → ')}`, cycle[0]); }
  else { checkOverlaps(tasks, err); }

  return { ok: errors.length === 0, errors, warnings };
}

function checkPlanShape(plan, err) {
  if (!plan._blocks || !plan._blocks.tasks) {
    err('missing-tasks-block', 'no ```yaml tasks block found under "## Tasks"');
  }
  if (!Number.isSafeInteger(plan.designVersion)) {
    err('bad-plan-design-version', `design_version must be an integer (got ${JSON.stringify(plan.designVersion)})`);
  }
}

// The feature this plan decomposes: resolve it and check the drift stamp.
function matchFeature(plan, design, { err, warn }) {
  const feature = (design.features || []).find((f) => f.id === plan.feature);
  if (!feature) {
    err('unknown-feature', `plan targets unknown feature "${plan.feature}"`);
    return null;
  }
  if (Number.isSafeInteger(plan.designVersion) && plan.designVersion !== design.designVersion) {
    warn('stale-plan', `plan was cut from design_version ${plan.designVersion}; the design is at ${design.designVersion} — re-check before building`, plan.feature);
  }
  return feature;
}

// A feature's acceptance as a criterion list (no feature → no criteria).
function criteriaOf(feature) {
  if (!feature) { return []; }
  return Array.isArray(feature.acceptance) ? feature.acceptance : [feature.acceptance];
}

function collectTaskIds(tasks, err) {
  const ids = new Set();
  for (const t of tasks) {
    if (!t.id || typeof t.id !== 'string') { err('missing-task-id', 'task is missing a string id', t.title); continue; }
    if (ids.has(t.id)) { err('duplicate-task-id', 'duplicate task id', t.id); }
    ids.add(t.id);
  }
  return ids;
}

// Per-task field checks: title, acceptance, size class, footprint.
function checkTaskFields(t, { err, warn }) {
  if (!t.title) { err('missing-task-title', 'task has no title', t.id); }
  if (!hasAcceptance(t.acceptance)) { err('missing-task-acceptance', 'task has no acceptance criterion of its own', t.id); }
  if (!TASK_SIZES.includes(t.size)) {
    err('bad-size', `size must be one of ${TASK_SIZES.join('|')} — anything larger splits or bounces (got ${JSON.stringify(t.size)})`, t.id);
  } else if (t.size === 'm') {
    warn('size-at-ceiling', 'task sits at the comfort ceiling — the wiring note must justify why it cannot split', t.id);
  }
  if (t.footprint.length === 0) { err('missing-footprint', 'task declares no expected file footprint', t.id); }
}

// Decision-density tier: enum-checked when present; absence routes build.standard.
function checkTaskTier(t, { err, warn }) {
  if (t.tier == null) { warn('missing-tier', 'task has no tier — routes to build.standard downstream', t.id); }
  else if (!TASK_TIERS.includes(t.tier)) { err('bad-tier', `tier must be one of ${TASK_TIERS.join('|')} (got ${JSON.stringify(t.tier)})`, t.id); }
}

// Per-task coverage claims: each `covers` index lands inside the feature's criteria.
function checkTaskCovers(t, { err, criteria, covered }) {
  if (t.covers.length === 0) { err('task-covers-nothing', 'task claims no feature acceptance criterion', t.id); }
  for (const k of t.covers) {
    if (Number.isSafeInteger(k) && k >= 1 && k <= criteria.length) { covered.add(k); }
    else { err('bad-covers-ref', `covers references criterion #${k} but the feature has ${criteria.length}`, t.id); }
  }
}

// Per-task dependency edges.
function checkTaskEdges(t, { err, ids }) {
  for (const dep of t.depends_on) {
    if (dep === t.id) { err('self-dependency', 'task depends on itself', t.id); }
    else if (!ids.has(dep)) { err('dangling-task-dependency', `depends_on unknown task "${dep}"`, t.id); }
  }
}

// Coverage: every feature acceptance criterion is claimed by some task.
function checkCoverage({ feature, tasks, criteria, covered, err }) {
  if (!feature || tasks.length === 0) { return; }
  for (let k = 1; k <= criteria.length; k++) {
    if (!covered.has(k)) { err('uncovered-criterion', `feature acceptance criterion #${k} is claimed by no task ("${criteria[k - 1]}")`, feature.id); }
  }
}

// Overlap serialization: shared footprint ⇒ an ordering path must exist. The inverse
// is the concurrency guarantee: two tasks with no ordering path between them are
// footprint-disjoint, so the scheduler may run them in parallel worktrees safely.
function checkOverlaps(tasks, err) {
  for (const [a, b, shared] of overlaps(tasks)) {
    if (!reaches(tasks, a.id, b.id) && !reaches(tasks, b.id, a.id)) {
      err('unordered-overlap', `tasks share files (${shared.join(', ')}) but neither orders before the other — chain them via depends_on`, `${a.id}+${b.id}`);
    }
  }
}

/**
 * Resolve one task into the kernel a build agent is handed (ADR-0036): the task
 * contract plus the texts of the feature acceptance criteria it covers. The launch
 * assembler inlines this into the snapshot; the workflow pushes it into the build
 * prompt — the agent fetches nothing to start.
 * @param {PlanModel} plan
 * @param {import('./parse.js').DesignModel} design
 * @param {string} taskId
 * @returns {{feature: string, design_version: number, task: TaskContract, covers_criteria: string[]}}
 */
export function resolveTask(plan, design, taskId) {
  const task = (plan.tasks || []).find((t) => t.id === taskId);
  if (!task) {throw new Error(`unknown task id: ${plan.feature}/${taskId}`);}
  const feature = (design.features || []).find((f) => f.id === plan.feature);
  const criteria = criteriaOf(feature);
  return {
    feature: plan.feature,
    design_version: plan.designVersion,
    task,
    covers_criteria: task.covers.map((k) => criteria[k - 1]).filter((c) => c != null),
  };
}

function hasAcceptance(a) {
  if (typeof a === 'string') {return a.trim().length > 0;}
  if (Array.isArray(a)) {return a.length > 0 && a.every((x) => typeof x === 'string' && x.trim().length > 0);}
  return false;
}

function* overlaps(tasks) {
  for (let i = 0; i < tasks.length; i++) {
    const fa = new Set(tasks[i].footprint);
    for (let j = i + 1; j < tasks.length; j++) {
      const shared = tasks[j].footprint.filter((p) => fa.has(p));
      if (shared.length > 0) {yield [tasks[i], tasks[j], shared];}
    }
  }
}

// Is `to` a transitive dependency of `from`? DFS over depends_on edges.
function reaches(tasks, from, to) {
  const edges = new Map(tasks.filter((t) => t.id).map((t) => [t.id, t.depends_on || []]));
  const seen = new Set();
  const stack = [from];
  while (stack.length > 0) {
    const id = stack.pop();
    const deps = edges.get(id) || [];
    for (const dep of deps) {
      if (dep === to) { return true; }
      if (!seen.has(dep)) { seen.add(dep); stack.push(dep); }
    }
  }
  return false;
}
