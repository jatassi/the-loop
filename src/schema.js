// The feature-node schema and the graph validator. Pure: validate() inspects an
// already-parsed model and never touches text. Errors mean the doc is malformed as a
// contract (block); warnings inform but don't block.

/**
 * The durable lifecycle a feature node moves through (ADR-0034): what has *landed*.
 * Everything in-flight — planned, building, blocked-on-a-question — is derived from
 * git (branches, plan files, task commits) at launch time, never stored here.
 */
export const STATUS = ['designed', 'validated', 'shipped'];

/**
 * Ids become git refs (`loop/<id>`) and file paths (`docs/plans/<id>.md`)
 * downstream, so they must be a lowercase slug — no path separators, no shell
 * metacharacters, no leading hyphen. Rejecting a malformed id here stops a hostile
 * graph from an untrusted repo before its id can reach any ref or path construction.
 */
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * @typedef {Object} Issue
 * @property {string} code
 * @property {string} message
 * @property {string} [where]   the id (or title) the issue concerns
 */

/**
 * @param {import('./parse.js').DesignModel} model
 * @returns {{ok: boolean, errors: Issue[], warnings: Issue[]}}
 */
export function validate(model) {
  const errors = [];
  const warnings = [];
  const err = (code, message, where) => { errors.push({ code, message, where }); };

  const features = model.features || [];

  checkDocShape(model, err);

  const ids = collectIds(features, err, {
    missing: ['missing-id', 'feature is missing a string id'],
    duplicate: ['duplicate-id', 'duplicate feature id'],
    malformed: ['malformed-id', 'feature id must be a lowercase slug matching ^[a-z0-9][a-z0-9-]*$'],
  });

  for (const f of features) {
    if (!f.id) { continue; }
    checkFeatureFields(f, err);
    checkFeatureEdges(f, { err, ids });
  }

  const cycle = findCycle(features);
  if (cycle) { err('dependency-cycle', `depends_on cycle: ${cycle.join(' → ')}`, cycle[0]); }

  return { ok: errors.length === 0, errors, warnings };
}

function checkDocShape(model, err) {
  if (!model._blocks || !model._blocks.featureGraph) {
    err('missing-feature-graph', 'no ```yaml feature graph block found under "## Feature graph"');
  }
  if (!Number.isSafeInteger(model.designVersion)) {
    err('bad-doc-design-version', `top-level design_version must be an integer (got ${JSON.stringify(model.designVersion)})`);
  }
}

// Gather string ids into a Set, reporting missing/duplicate under the caller's codes.
function collectIds(items, err, codes) {
  const ids = new Set();
  for (const item of items) {
    if (!item.id || typeof item.id !== 'string') { err(...codes.missing, item.title); continue; }
    if (!ID_PATTERN.test(item.id)) { err(...codes.malformed, item.id); }
    if (ids.has(item.id)) { err(...codes.duplicate, item.id); }
    ids.add(item.id);
  }
  return ids;
}

// Per-feature field checks: title, status, acceptance.
function checkFeatureFields(f, err) {
  if (!f.title) { err('missing-title', 'feature has no title', f.id); }
  if (!STATUS.includes(f.status)) { err('bad-status', `status must be one of ${STATUS.join('|')} (got ${JSON.stringify(f.status)})`, f.id); }
  if (!hasAcceptance(f.acceptance)) { err('missing-acceptance', 'feature has no acceptance criterion', f.id); }
}

// Per-feature reference checks: depends_on edges.
function checkFeatureEdges(f, { err, ids }) {
  const deps = f.depends_on || [];
  for (const dep of deps) {
    if (dep === f.id) { err('self-dependency', 'feature depends on itself', f.id); }
    else if (!ids.has(dep)) { err('dangling-dependency', `depends_on unknown feature "${dep}"`, f.id); }
  }
}

function hasAcceptance(a) {
  if (typeof a === 'string') { return a.trim().length > 0; }
  if (Array.isArray(a)) { return a.length > 0 && a.every((x) => typeof x === 'string' && x.trim().length > 0); }
  return false;
}

// DFS colouring; returns the first cycle as an id path (…→ x → … → x), or null.
// Generic over anything shaped {id, depends_on} — plan.js reuses it for task edges.
export function findCycle(features) {
  const edges = new Map(features.filter((f) => f.id).map((f) => [f.id, f.depends_on || []]));
  const WHITE = 0, GREY = 1, BLACK = 2;
  const colour = new Map();
  const stack = [];
  let cycle = null;
  const visit = (id) => {
    colour.set(id, GREY);
    stack.push(id);
    const deps = edges.get(id) || [];
    for (const dep of deps) {
      if (!edges.has(dep)) { continue; } // dangling edge — reported elsewhere
      const c = colour.get(dep) || WHITE;
      if (c === GREY) { cycle = [...stack.slice(stack.indexOf(dep)), dep]; return; }
      if (c === WHITE) { visit(dep); if (cycle) { return; } }
    }
    stack.pop();
    colour.set(id, BLACK);
  };
  for (const id of edges.keys()) {
    if ((colour.get(id) || WHITE) === WHITE) { visit(id); }
    if (cycle) { break; }
  }
  return cycle;
}
