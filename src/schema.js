// The feature-node schema and the model validator. Pure: validate() inspects an
// already-parsed model and never touches text. Errors mean the doc is malformed as a
// contract (block); warnings inform but don't block.

/** The lifecycle a feature node moves through (the status enum). */
export const STATUS = ['designed', 'planned', 'building', 'validated', 'shipped', 'parked', 'drifted'];

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
  const warn = (code, message, where) => { warnings.push({ code, message, where }); };

  const features = model.features || [];
  const contracts = model.contracts || [];

  checkDocShape(model, err);

  const ids = collectIds(features, err, {
    missing: ['missing-id', 'feature is missing a string id'],
    duplicate: ['duplicate-id', 'duplicate feature id'],
  });
  const contractIds = collectIds(contracts, err, {
    missing: ['missing-contract-id', 'contract is missing a string id'],
    duplicate: ['duplicate-contract-id', 'duplicate contract id'],
  });

  const referenced = new Set();
  for (const f of features) {
    if (!f.id) { continue; }
    checkFeatureFields(f, err);
    checkFeatureEdges(f, { err, warn, ids, contractIds, referenced });
  }

  for (const c of contracts) {
    if (c.id && !referenced.has(c.id)) { warn('unreferenced-contract', 'contract is defined but no feature references it', c.id); }
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
    if (ids.has(item.id)) { err(...codes.duplicate, item.id); }
    ids.add(item.id);
  }
  return ids;
}

// Per-feature field checks: title, status, acceptance, drift stamp.
function checkFeatureFields(f, err) {
  if (!f.title) { err('missing-title', 'feature has no title', f.id); }
  if (!STATUS.includes(f.status)) { err('bad-status', `status must be one of ${STATUS.join('|')} (got ${JSON.stringify(f.status)})`, f.id); }
  if (!hasAcceptance(f.acceptance)) { err('missing-acceptance', 'feature has no acceptance criterion', f.id); }
  if (f.design_version != null && !Number.isSafeInteger(f.design_version)) { err('bad-design-version', 'node design_version must be an integer', f.id); }
}

// Per-feature reference checks: depends_on edges and interface contracts.
function checkFeatureEdges(f, { err, warn, ids, contractIds, referenced }) {
  const deps = f.depends_on || [];
  for (const dep of deps) {
    if (dep === f.id) { err('self-dependency', 'feature depends on itself', f.id); }
    else if (!ids.has(dep)) { err('dangling-dependency', `depends_on unknown feature "${dep}"`, f.id); }
  }
  const interfaces = f.interfaces || [];
  for (const cid of interfaces) {
    referenced.add(cid);
    if (!contractIds.has(cid)) { warn('dangling-interface', `interface "${cid}" has no contract body`, f.id); }
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
