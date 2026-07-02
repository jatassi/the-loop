// The plan artifact (docs/plans/<feature-id>.md): parse + validate for the per-feature
// task-contract block — the Plan → Build handoff (contract: task-contract). Mirrors the
// design spine's split of concerns: parsePlan() is lenient and structural; semantics —
// coverage, overlap ordering, sizing, edges — live in validatePlan(); render.js handles
// the round-trip (its _blocks shape is shared).

import YAML from 'yaml';
import { yamlBlockAfter } from './blocks.js';
import { findCycle } from './schema.js';

/** Task lifecycle within a plan. Plan writes `pending`; Build owns the transitions. */
export const TASK_STATUS = ['pending', 'building', 'built', 'blocked'];

/**
 * Size classes a persisted task may carry. The sizing gate over-decomposes until each
 * task is comfortably small: xs/s pass silently, m is the comfort ceiling (allowed, but
 * flagged — the plan narrative must justify why it can't split), and anything larger is
 * not representable here: it must be split, or the feature bounces up to re-slice.
 */
export const TASK_SIZES = ['xs', 's', 'm'];

const HEADING = '## Tasks';

/** The conventional location of a feature's plan artifact. */
export function planPath(featureId, root = 'docs/plans') {
  return `${root}/${featureId}.md`;
}

/**
 * @typedef {Object} TaskContract
 * @property {string} id            unique within the plan; global handle is <feature>/<id>
 * @property {string} title
 * @property {string} status
 * @property {number[]} covers      1-based indexes into the feature's acceptance criteria
 * @property {string|string[]} acceptance  the task's own observable, binary criterion
 * @property {string[]} injects     contract ids the build agent gets injected
 * @property {string[]} footprint   expected files created/modified
 * @property {string} size          xs | s | m
 * @property {string[]} depends_on  task-ordering edges (overlapping footprints must be chained)
 * @property {Object} [report]      completion report, folded in by Build (contract: completion-report)
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
    tasks: (js.tasks || []).map(normalizeTask),
    _blocks: { tasks: span ? { doc, span } : null },
  };
}

function normalizeTask(t) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    covers: t.covers || [],
    acceptance: t.acceptance,
    injects: t.injects || [],
    footprint: t.footprint || [],
    size: t.size,
    depends_on: t.depends_on || [],
    ...(t.report != null ? { report: t.report } : {}),
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
  const err = (code, message, where) => errors.push({ code, message, where });
  const warn = (code, message, where) => warnings.push({ code, message, where });

  if (!plan._blocks || !plan._blocks.tasks) {
    err('missing-tasks-block', 'no ```yaml tasks block found under "## Tasks"');
  }
  if (!Number.isInteger(plan.designVersion)) {
    err('bad-plan-design-version', `design_version must be an integer (got ${JSON.stringify(plan.designVersion)})`);
  }

  // ── the feature this plan decomposes ──
  const feature = (design.features || []).find((f) => f.id === plan.feature);
  if (!feature) {
    err('unknown-feature', `plan targets unknown feature "${plan.feature}"`);
  } else {
    const effective = feature.design_version != null ? feature.design_version : design.designVersion;
    if (Number.isInteger(plan.designVersion) && plan.designVersion !== effective) {
      warn('stale-plan', `plan was cut from design_version ${plan.designVersion}; the feature is at ${effective} — re-check before building`, plan.feature);
    }
  }
  const criteria = feature ? (Array.isArray(feature.acceptance) ? feature.acceptance : [feature.acceptance]) : [];
  const contractIds = new Set((design.contracts || []).map((c) => c.id));

  // ── task ids + uniqueness ──
  const tasks = plan.tasks || [];
  const ids = new Set();
  for (const t of tasks) {
    if (!t.id || typeof t.id !== 'string') { err('missing-task-id', 'task is missing a string id', t.title); continue; }
    if (ids.has(t.id)) err('duplicate-task-id', 'duplicate task id', t.id);
    ids.add(t.id);
  }

  // ── per-task field + reference checks ──
  const covered = new Set();
  for (const t of tasks) {
    if (!t.id) continue;
    if (!t.title) err('missing-task-title', 'task has no title', t.id);
    if (!TASK_STATUS.includes(t.status)) err('bad-task-status', `status must be one of ${TASK_STATUS.join('|')} (got ${JSON.stringify(t.status)})`, t.id);
    if (!hasAcceptance(t.acceptance)) err('missing-task-acceptance', 'task has no acceptance criterion of its own', t.id);
    if (!TASK_SIZES.includes(t.size)) {
      err('bad-size', `size must be one of ${TASK_SIZES.join('|')} — anything larger splits or bounces (got ${JSON.stringify(t.size)})`, t.id);
    } else if (t.size === 'm') {
      warn('size-at-ceiling', 'task sits at the comfort ceiling — the plan narrative must justify why it cannot split', t.id);
    }
    if (!t.footprint.length) err('missing-footprint', 'task declares no expected file footprint', t.id);

    if (!t.covers.length) err('task-covers-nothing', 'task claims no feature acceptance criterion', t.id);
    for (const k of t.covers) {
      if (!Number.isInteger(k) || k < 1 || k > criteria.length) {
        err('bad-covers-ref', `covers references criterion #${k} but the feature has ${criteria.length}`, t.id);
      } else covered.add(k);
    }
    for (const cid of t.injects) {
      if (!contractIds.has(cid)) err('dangling-inject', `injects unknown contract "${cid}"`, t.id);
    }
    for (const dep of t.depends_on) {
      if (dep === t.id) err('self-dependency', 'task depends on itself', t.id);
      else if (!ids.has(dep)) err('dangling-task-dependency', `depends_on unknown task "${dep}"`, t.id);
    }
  }

  // ── coverage: every feature criterion is claimed by some task ──
  if (feature && tasks.length) {
    for (let k = 1; k <= criteria.length; k++) {
      if (!covered.has(k)) err('uncovered-criterion', `feature acceptance criterion #${k} is claimed by no task ("${criteria[k - 1]}")`, plan.feature);
    }
  }

  const cycle = findCycle(tasks);
  if (cycle) err('task-dependency-cycle', `depends_on cycle: ${cycle.join(' → ')}`, cycle[0]);

  // ── overlap serialization: shared footprint ⇒ an ordering path must exist ──
  if (!cycle) {
    for (const [a, b, shared] of overlaps(tasks)) {
      if (!reaches(tasks, a.id, b.id) && !reaches(tasks, b.id, a.id)) {
        err('unordered-overlap', `tasks share files (${shared.join(', ')}) but neither orders before the other — chain them via depends_on`, `${a.id}+${b.id}`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function hasAcceptance(a) {
  if (typeof a === 'string') return a.trim().length > 0;
  if (Array.isArray(a)) return a.length > 0 && a.every((x) => typeof x === 'string' && x.trim().length > 0);
  return false;
}

function* overlaps(tasks) {
  for (let i = 0; i < tasks.length; i++) {
    const fa = new Set(tasks[i].footprint);
    for (let j = i + 1; j < tasks.length; j++) {
      const shared = tasks[j].footprint.filter((p) => fa.has(p));
      if (shared.length) yield [tasks[i], tasks[j], shared];
    }
  }
}

// Is `to` a transitive dependency of `from`? DFS over depends_on edges.
function reaches(tasks, from, to) {
  const edges = new Map(tasks.filter((t) => t.id).map((t) => [t.id, t.depends_on || []]));
  const seen = new Set();
  const stack = [from];
  while (stack.length) {
    const id = stack.pop();
    for (const dep of edges.get(id) || []) {
      if (dep === to) return true;
      if (!seen.has(dep)) { seen.add(dep); stack.push(dep); }
    }
  }
  return false;
}
