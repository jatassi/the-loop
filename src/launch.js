// The launch assembler's pure core (ADR-0036/0038): scope gating, git-derived task
// state, and snapshot shaping. The bin edge gathers the raw inputs (graph text, design
// sections, plan texts, branch heads); everything here is a pure function over them,
// so the gates are unit-testable without a repo.

/** Statuses that satisfy a depends_on edge. */
const DONE = new Set(['validated', 'shipped']);

/** The feature's branch, and a task's branch within it. */
export function featureBranch(featureId) {
  return `loop/${featureId}`;
}
export function taskBranch(featureId, taskId) {
  return `loop/${featureId}--${taskId}`;
}

/** The commit-subject prefix that marks a task's landing commit. */
export function taskCommitPrefix(featureId, taskId) {
  return `${featureId}/${taskId}: `;
}

/**
 * Gate a requested scope against the graph: every id known, still `designed`, and
 * every dependency either already landed or satisfiable within this same scope (the
 * ready-set scheduler runs dependents after their in-scope deps validate).
 * @param {import('./parse.js').DesignModel} model
 * @param {string[]} scope
 * @returns {{ok: boolean, errors: import('./schema.js').Issue[]}}
 */
export function checkScope(model, scope) {
  const errors = [];
  const err = (code, message, where) => { errors.push({ code, message, where }); };
  const byId = new Map((model.features || []).map((f) => [f.id, f]));
  const inScope = new Set(scope);

  for (const id of scope) {
    const node = byId.get(id);
    if (!node) { err('unknown-feature', `scope names unknown feature "${id}"`, id); continue; }
    if (node.status !== 'designed') { err('not-designed', `feature is ${node.status}, not designed — nothing to run`, id); }
    const deps = node.depends_on || [];
    for (const dep of deps) {
      const depNode = byId.get(dep);
      const satisfied = depNode && (DONE.has(depNode.status) || inScope.has(dep));
      if (!satisfied) { err('unsatisfied-dependency', `depends on "${dep}", which is neither landed nor in scope`, id); }
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Which of a plan's tasks already landed, derived from git alone: a task is built
 * iff its branch exists and its head commit's subject carries the task's own prefix
 * (`<feature>/<task>: `). A branch that exists without that head is a crashed,
 * uncommitted attempt — unbuilt; the scheduler just runs the task again (ADR-0034:
 * idempotent re-run replaces crash healing).
 * @param {string} featureId
 * @param {{tasks: Array<{id: string}>}|null} plan
 * @param {Object<string, string>} branchHeads  branch name → head commit subject
 * @returns {string[]}
 */
export function builtTaskIds(featureId, plan, branchHeads) {
  if (!plan) { return []; }
  const landed = (t) => {
    const head = branchHeads[taskBranch(featureId, t.id)] || '';
    return head.startsWith(taskCommitPrefix(featureId, t.id));
  };
  return (plan.tasks || []).filter((t) => t.id && landed(t)).map((t) => t.id);
}

/**
 * Shape the one launch snapshot the workflow consumes as `args` (ADR-0036: the
 * orchestrator pushes kernels; agents fetch nothing to start).
 * @param {Object} input
 * @param {import('./parse.js').DesignModel} input.model
 * @param {string[]} input.scope
 * @param {string} input.target
 * @param {string|null} input.probe        verbatim "## Runtime probe" section text
 * @param {Object} input.models            resolved role → binding table
 * @param {Object<string, {designDoc: string|null, plan: Object|null, branchHeads: Object<string, string>}>} input.inputs
 *        per-feature gathered inputs, keyed by feature id
 * @param {string} [input.spine]  the spine CLI invocation workers should use
 */
export function assembleSnapshot({ model, scope, target, probe, models, inputs, spine }) {
  const byId = new Map((model.features || []).map((f) => [f.id, f]));
  const features = {};
  for (const id of scope) {
    features[id] = featureEntry(byId.get(id), inputs[id] || {});
  }
  return { target, scope, probe, models, features, ...(spine && { spine }) };
}

function featureEntry(node, { designDoc = null, plan = null, branchHeads = {} }) {
  const id = node.id;
  return {
    id,
    title: node.title,
    acceptance: Array.isArray(node.acceptance) ? node.acceptance : [node.acceptance],
    depends_on: node.depends_on || [],
    ...((node.notes != null) && { notes: node.notes }),
    designDoc,
    branch: featureBranch(id),
    branchHead: branchHeads[featureBranch(id)] || null,
    plan: plan && { designVersion: plan.designVersion, tasks: plan.tasks },
    builtTasks: builtTaskIds(id, plan, branchHeads),
  };
}
