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

/**
 * Decision-density classes a task may be stamped with — how much the task leaves the
 * builder to decide, not its size. `rote` additionally requires correctness fully
 * captured by the task's tests + lint; when unsure between `rote` and `standard`,
 * choose `standard`. Selects the `build.<tier>` model binding downstream (ADR-0030).
 * Absent on a task cut before this field existed — validatePlan warns, never errors,
 * and downstream defaults an untiered task to `standard` with fallback provenance.
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
 * @property {string} status
 * @property {number[]} covers      1-based indexes into the feature's acceptance criteria
 * @property {string|string[]} acceptance  the task's own observable, binary criterion
 * @property {string[]} injects     contract ids the build agent gets injected
 * @property {string[]} standards   docs/standards/ files the task builds under (Plan-selected)
 * @property {string[]} footprint   expected files created/modified
 * @property {string} size          xs | s | m
 * @property {string} [tier]        rote|standard|complex — decision-density, stamped
 *                                   at Plan; absent on a pre-feature plan
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
    tasks: (js.tasks || []).map((t) => normalizeTask(t)),
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
    standards: t.standards || [],
    footprint: t.footprint || [],
    size: t.size,
    depends_on: t.depends_on || [],
    ...((t.tier != null) && { tier: t.tier }),
    ...((t.report != null) && { report: t.report }),
    ...((t.remediation != null) && { remediation: t.remediation }),
    ...((t.fix != null) && { fix: t.fix }),
  };
}

/**
 * Validate a plan against the design it was cut from. Errors block (the plan is
 * malformed as a contract); warnings inform — a stale drift stamp or a task at the
 * size ceiling is a signal, not a blocker.
 * @param {PlanModel} plan
 * @param {import('./parse.js').DesignModel} design
 * @param {{standardExists?: (path: string) => boolean}} [opts]  existence probe for
 *        standards paths — injected by the CLI (fs there, purity here)
 * @returns {{ok: boolean, errors: import('./schema.js').Issue[], warnings: import('./schema.js').Issue[]}}
 */
export function validatePlan(plan, design, { standardExists } = {}) {
  const errors = [];
  const warnings = [];
  const err = (code, message, where) => { errors.push({ code, message, where }); };
  const warn = (code, message, where) => { warnings.push({ code, message, where }); };

  checkPlanShape(plan, err);

  const feature = matchFeature(plan, design, { err, warn });
  const criteria = criteriaOf(feature);
  const contractIds = new Set((design.contracts || []).map((c) => c.id));

  const tasks = plan.tasks || [];
  const ids = collectTaskIds(tasks, err);

  const covered = new Set();
  for (const t of tasks) {
    if (!t.id) { continue; }
    checkTaskFields(t, { err, warn });
    checkTaskTier(t, { err, warn });
    checkTaskCovers(t, { err, criteria, covered });
    checkTaskEdges(t, { err, contractIds, ids });
    checkTaskStandards(t, { err, standardExists });
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
  const effective = feature.design_version ?? design.designVersion;
  if (Number.isSafeInteger(plan.designVersion) && plan.designVersion !== effective) {
    warn('stale-plan', `plan was cut from design_version ${plan.designVersion}; the feature is at ${effective} — re-check before building`, plan.feature);
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

// Per-task field checks: title, status, acceptance, size class, footprint.
function checkTaskFields(t, { err, warn }) {
  if (!t.title) { err('missing-task-title', 'task has no title', t.id); }
  if (!TASK_STATUS.includes(t.status)) { err('bad-task-status', `status must be one of ${TASK_STATUS.join('|')} (got ${JSON.stringify(t.status)})`, t.id); }
  if (!hasAcceptance(t.acceptance)) { err('missing-task-acceptance', 'task has no acceptance criterion of its own', t.id); }
  if (!TASK_SIZES.includes(t.size)) {
    err('bad-size', `size must be one of ${TASK_SIZES.join('|')} — anything larger splits or bounces (got ${JSON.stringify(t.size)})`, t.id);
  } else if (t.size === 'm') {
    warn('size-at-ceiling', 'task sits at the comfort ceiling — the plan narrative must justify why it cannot split', t.id);
  }
  if (t.footprint.length === 0) { err('missing-footprint', 'task declares no expected file footprint', t.id); }
}

// Decision-density tier: enum-checked when present. A plan cut before this field
// existed carries none — absence only warns (grandfathered), downstream defaults it
// to `standard` with fallback provenance.
function checkTaskTier(t, { err, warn }) {
  if (t.tier == null) { warn('missing-tier', 'task has no tier — routes to build.standard downstream', t.id); }
  else if (!TASK_TIERS.includes(t.tier)) { err('bad-tier', `tier must be one of ${TASK_TIERS.join('|')} (got ${JSON.stringify(t.tier)})`, t.id); }
}

// Per-task coverage claims: each `covers` index lands inside the feature's criteria.
// The remediation round-marker and a fix task (ADR-0027/0029, ADR-0032) are exempt
// both ways: they cover no criterion by design, and their empty `covers` never
// satisfies one either.
function checkTaskCovers(t, { err, criteria, covered }) {
  if (t.covers.length === 0 && !t.remediation && !t.fix) { err('task-covers-nothing', 'task claims no feature acceptance criterion', t.id); }
  for (const k of t.covers) {
    if (Number.isSafeInteger(k) && k >= 1 && k <= criteria.length) { covered.add(k); }
    else { err('bad-covers-ref', `covers references criterion #${k} but the feature has ${criteria.length}`, t.id); }
  }
}

// Per-task reference checks: injected contracts and dependency edges.
function checkTaskEdges(t, { err, contractIds, ids }) {
  for (const cid of t.injects) {
    if (!contractIds.has(cid)) { err('dangling-inject', `injects unknown contract "${cid}"`, t.id); }
  }
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

// Per-task standards references: docs/standards/ paths, existing when probeable.
function checkTaskStandards(t, { err, standardExists }) {
  const standards = t.standards || [];
  for (const s of standards) {
    if (typeof s !== 'string' || !s.startsWith('docs/standards/')) {
      err('bad-standards-path', `standards entries are docs/standards/ paths (got ${JSON.stringify(s)})`, t.id);
    } else if (standardExists && !standardExists(s)) {
      err('unknown-standard', `standards references a missing file "${s}"`, t.id);
    }
  }
}

// Overlap serialization: shared footprint ⇒ an ordering path must exist.
function checkOverlaps(tasks, err) {
  for (const [a, b, shared] of overlaps(tasks)) {
    if (!reaches(tasks, a.id, b.id) && !reaches(tasks, b.id, a.id)) {
      err('unordered-overlap', `tasks share files (${shared.join(', ')}) but neither orders before the other — chain them via depends_on`, `${a.id}+${b.id}`);
    }
  }
}

/** Completion results a build agent may return; folding one sets the task's status. */
export const REPORT_RESULTS = ['built', 'blocked'];

/**
 * Resolve one task into the slice a build agent is handed — injection-on-demand at
 * task granularity, the plan-side sibling of resolveIn(): the task contract, the texts
 * of the feature acceptance criteria it covers, and the bodies of the contracts it
 * injects. `unbuilt_dependencies` lists depends_on tasks not yet `built`, so a
 * mis-sequenced builder can refuse mechanically instead of building on absent work.
 * @param {PlanModel} plan
 * @param {import('./parse.js').DesignModel} design
 * @param {string} taskId
 * @returns {{feature: string, design_version: number, task: TaskContract,
 *            covers_criteria: string[], injects: Array<{id: string, body: string}>,
 *            unbuilt_dependencies: string[]}}
 */
export function resolveTask(plan, design, taskId) {
  const task = (plan.tasks || []).find((t) => t.id === taskId);
  if (!task) {throw new Error(`unknown task id: ${plan.feature}/${taskId}`);}
  const feature = (design.features || []).find((f) => f.id === plan.feature);
  const criteria = criteriaOf(feature);
  const contractById = new Map((design.contracts || []).map((c) => [c.id, c]));
  const taskById = new Map(plan.tasks.map((t) => [t.id, t]));
  return {
    feature: plan.feature,
    design_version: plan.designVersion,
    task,
    covers_criteria: task.covers.map((k) => criteria[k - 1]).filter((c) => c != null),
    injects: task.injects.map((cid) => contractById.get(cid)).filter(Boolean),
    unbuilt_dependencies: task.depends_on.filter((id) => {
      const dep = taskById.get(id);
      return !dep || dep.status !== 'built';
    }),
  };
}

/**
 * Fold a completion report (contract: completion-report) into its task node — the
 * boundary-step write-back. Sets `status` from `result` and embeds the rest under
 * `report:`, in both the JS model and the retained YAML document, so render() persists
 * it without touching any other byte of the artifact. Refuses a malformed result and a
 * double fold — re-opening a finished task is a resolution decision, not a re-write.
 * @param {PlanModel} plan
 * @param {string} taskId
 * @param {Object} report  {result, footprint_actual, diff_actual, deviations, summary}
 */
export function foldReport(plan, taskId, report) {
  const idx = (plan.tasks || []).findIndex((t) => t.id === taskId);
  if (idx === -1) {throw new Error(`unknown task id: ${plan.feature}/${taskId}`);}
  if (!report || !REPORT_RESULTS.includes(report.result)) {
    throw new Error(`report.result must be one of ${REPORT_RESULTS.join('|')}`);
  }
  const task = plan.tasks[idx];
  if (task.report != null || task.status === 'built' || task.status === 'blocked') {
    throw new Error(`task ${plan.feature}/${taskId} already carries a report (status: ${task.status})`);
  }
  if (!plan._blocks.tasks) {throw new Error('plan has no tasks block to fold into');}
  const { task: _named, ...body } = report; // the node's own id already names the task
  task.status = report.result;
  task.report = body;
  const doc = plan._blocks.tasks.doc;
  doc.setIn(['tasks', idx, 'status'], report.result);
  doc.setIn(['tasks', idx, 'report'], body);
}

/**
 * Append the remediation round-marker (ADR-0027/0029): the durable, one-shot task
 * carrying a bounded pass over standards findings that survived validation. Its
 * presence is the round-marker itself, so a second append is refused, and a findings
 * set citing no file:line location is refused too — the plan on disk must never gain
 * a footprint-less task.
 * @param {PlanModel} plan
 * @param {Array<{location: string, observation: string}>} findings  from the validator's leg reports
 */
export function appendRemediation(plan, findings) {
  if ((plan.tasks || []).some((t) => t.remediation)) {
    throw new Error(`plan ${plan.feature} already carries a remediation round-marker`);
  }
  const footprint = [...new Set((findings || []).map((f) => fileOfFinding(f)).filter(Boolean))];
  if (footprint.length === 0) {
    throw new Error('findings carry no file:line location — nothing to remediate');
  }
  if (!plan._blocks.tasks) {throw new Error('plan has no tasks block to append into');}

  const task = {
    id: 'remediation',
    title: 'Remediation round — standards findings addressed or rebutted',
    status: 'pending',
    remediation: true,
    covers: [],
    acceptance: findings.map((f) => `${f.location}: ${f.observation} — addressed, or rebutted with evidence`),
    injects: [],
    standards: [],
    footprint,
    size: 's',
    tier: 'standard',
    depends_on: plan.tasks.map((t) => t.id),
  };
  plan.tasks.push(task);
  plan._blocks.tasks.doc.setIn(['tasks', plan.tasks.length - 1], task);
}

// A finding's file, when its location is shaped "path:line"; null for the free-text
// probe observations a finding may carry instead, which name no file to remediate.
function fileOfFinding(finding) {
  const m = /^(.+):(\d+)$/.exec((finding && finding.location) || '');
  return m ? m[1] : null;
}

/**
 * Append a fix task (ADR-0032): the mechanical channel a human's fix routes through
 * after a park. Unlike the remediation round-marker, a fix is not one-shot — each
 * call appends the next fix-N (N = 1 + however many fix-flagged tasks already exist).
 * When the plan carries blocked tasks (a build park), each is reset to `pending`, its
 * report dropped, and fix-N appended to its `depends_on` — chained behind the fix so
 * it reruns after. fix-N's own `depends_on` lists every other prior task (so any
 * overlapping footprint stays ordered) but never a task being reset — chaining both
 * directions would cycle. When no task is blocked (a validate park), the reset step
 * is simply empty and the append is plain.
 * @param {PlanModel} plan
 * @param {{directive?: string, acceptance: string[], footprint: string[], title?: string}} input
 * @returns {TaskContract} the appended task
 */
export function appendFix(plan, input) {
  const { directive, acceptance, footprint, title } = input || {};
  validateFixInput(acceptance, footprint);
  const resolvedTitle = title || firstLineOf(directive);
  if (!resolvedTitle) {
    throw new Error('fix requires a title, or a directive to default one from');
  }
  if (!plan._blocks.tasks) {throw new Error('plan has no tasks block to append into');}

  const id = `fix-${plan.tasks.filter((t) => t.fix).length + 1}`;
  const blocked = plan.tasks.filter((t) => t.status === 'blocked');
  const blockedIds = new Set(blocked.map((t) => t.id));
  const task = buildFixTask({ id, title: resolvedTitle, acceptance, footprint, priorIds: plan.tasks.map((t) => t.id), blockedIds });

  const doc = plan._blocks.tasks.doc;
  plan.tasks.push(task);
  doc.setIn(['tasks', plan.tasks.length - 1], task);
  resetBlockedTasks({ plan, doc, blocked, fixId: id });

  return task;
}

function validateFixInput(acceptance, footprint) {
  if (!Array.isArray(acceptance) || acceptance.length === 0) {
    throw new Error('fix requires a non-empty acceptance list');
  }
  if (!Array.isArray(footprint) || footprint.length === 0) {
    throw new Error('fix requires a non-empty footprint list');
  }
}

// title's fallback: the directive's own first line; '' when there is no directive to fall
// back to (the caller then refuses for lack of a title).
function firstLineOf(directive) {
  return typeof directive === 'string' ? directive.split('\n', 1)[0].trim() : '';
}

function buildFixTask({ id, title, acceptance, footprint, priorIds, blockedIds }) {
  return {
    id,
    title,
    status: 'pending',
    fix: true,
    covers: [],
    acceptance,
    injects: [],
    standards: [],
    footprint,
    size: 's',
    tier: 'standard',
    depends_on: priorIds.filter((tid) => !blockedIds.has(tid)),
  };
}

// Reset each blocked task to pending, drop its report, and chain fix-N behind it —
// in both the JS model and the retained YAML document.
function resetBlockedTasks({ plan, doc, blocked, fixId }) {
  for (const t of blocked) {
    const idx = plan.tasks.indexOf(t);
    t.status = 'pending';
    delete t.report;
    t.depends_on.push(fixId);
    doc.setIn(['tasks', idx, 'status'], 'pending');
    doc.deleteIn(['tasks', idx, 'report']);
    doc.addIn(['tasks', idx, 'depends_on'], fixId);
  }
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
