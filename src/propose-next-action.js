// The deterministic core of /the-loop (ADR-0002): where does this project stand, and
// what should happen next? Pure inspection — reads artifacts, never writes them.
// Status truth is the feature graph (docs/feature-graph.md); in-flight detail (plans,
// branches, task commits) is git's to answer, at execution-context time, not here
// (ADR-0034).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { STATUS, validate } from './feature-schema.js';
import { parse } from './parse-feature-graph.js';

const DESIGN = 'docs/architecture.md';
const GRAPH = 'docs/feature-graph.md';
const BRIEFS_DIR = 'docs/briefs';

// Statuses that satisfy a depends_on edge (the work behind it is done).
const DONE = new Set(['validated', 'shipped']);

/**
 * @typedef {Object} Proposal
 * @property {'onboard'|'repair'|'advance-eligible-set'|'design'|'release'|'new-intake'|'blocked'} kind
 * @property {string[]} features  the ids the proposal concerns
 * @property {string} summary     one sentence; the command surface expands it
 */

/**
 * Unconfigured detection (ADR-0017): a project with no graph and no system design has
 * nothing to resume, so /the-loop routes to onboarding. A brief never changes the mode
 * (Define's output, not Design's); it only moves onboarding's resume point past Define.
 * @param {string} [root]
 * @returns {{mode: 'unconfigured'|'configured'|'partial', hasDesign: boolean, hasGraph: boolean, hasBrief: boolean}}
 */
export function detectState(root = '.') {
  const hasDesign = existsSync(path.join(root, DESIGN));
  const hasGraph = existsSync(path.join(root, GRAPH));
  const briefsDir = path.join(root, BRIEFS_DIR);
  const hasBrief = existsSync(briefsDir)
    && readdirSync(briefsDir).some((f) => f.endsWith('.md'));
  let mode = 'unconfigured';
  if (hasGraph) { mode = 'configured'; }
  else if (hasDesign) { mode = 'partial'; }
  return { mode, hasDesign, hasGraph, hasBrief };
}

/**
 * The dependency-ready eligible set: features the engine could advance right now —
 * still `designed`, every depends_on edge satisfied.
 * @param {import('./parse-feature-graph.js').DesignModel} model
 * @returns {import('./parse-feature-graph.js').FeatureRecord[]}
 */
export function eligibleSet(model) {
  const byId = new Map((model.features || []).map((f) => [f.id, f]));
  const satisfied = (id) => { const d = byId.get(id); return !!d && DONE.has(d.status); };
  return (model.features || []).filter(
    (f) => f.status === 'designed' && (f.depends_on || []).every((id) => satisfied(id)),
  );
}

// A node's depends_on ids that aren't already DONE — the edges that could block it.
function unsatisfiedDeps(node, satisfied) {
  return (node.depends_on || []).filter((dep) => !satisfied(dep));
}

// One node's unsatisfied deps: a `proposed` one is a terminal blocker, anything
// else unresolved (a `designed` dep, typically) re-queues the chain.
function queueBlockers(node, { byId, satisfied, queue, blockers }) {
  for (const dep of unsatisfiedDeps(node, satisfied)) {
    const depNode = byId.get(dep); // a dangling dep is reported by validate() elsewhere
    if (depNode?.status === 'proposed') { blockers.add(dep); }
    else if (depNode) { queue.push(dep); }
  }
}

// The proposed features a stuck designed feature is blocked behind, transitively:
// walk each stuck feature's unsatisfied depends_on edges (DONE deps aren't
// blocking); a `proposed` dep is a terminal blocker, a `designed` dep keeps the
// chain going. Visited-tracking makes this safe over a cycle (which yields no
// proposed blocker at all — the `blocked` safety net's job).
function blockingProposedIds(model, stuckIds) {
  const byId = new Map((model.features || []).map((f) => [f.id, f]));
  const satisfied = (id) => { const d = byId.get(id); return !!d && DONE.has(d.status); };
  const blockers = new Set();
  const visited = new Set();
  const queue = [...stuckIds];
  while (queue.length > 0) {
    const id = queue.shift();
    if (visited.has(id)) { continue; }
    visited.add(id);
    const node = byId.get(id);
    if (node) { queueBlockers(node, { byId, satisfied, queue, blockers }); }
  }
  return [...blockers];
}

/**
 * The next-action proposal /the-loop opens with. Precedence: the drainable eligible
 * set; then, if designed work is stuck, `design` naming the proposed dependencies
 * that explain the stall; then Release; then `design` again to drain a proposed-only
 * backlog; then a fresh intake. `blocked` is the true safety net: on a validate-clean
 * graph (acyclic + no dangling edges), the base case that used to make it
 * unreachable now has exactly one exception — a stall bottoming out at proposed
 * dependencies reads as `design`, not `blocked` — so seeing `blocked` still means
 * the graph needs repair (e.g. a dependency cycle among designed features).
 * @param {import('./parse-feature-graph.js').DesignModel} model
 * @returns {Proposal}
 */
export function propose(model) {
  const features = model.features || [];
  const withStatus = (s) => features.filter((f) => f.status === s).map((f) => f.id);

  const ready = eligibleSet(model).map((f) => f.id);
  if (ready.length > 0) {
    return { kind: 'advance-eligible-set', features: ready,
      summary: `${ready.length} feature(s) are dependency-ready to advance` };
  }
  const stuck = withStatus('designed');
  if (stuck.length > 0) {
    const blocking = blockingProposedIds(model, stuck);
    if (blocking.length > 0) {
      return { kind: 'design', features: blocking,
        summary: `${blocking.length} proposed feature(s) block the stuck designed set — design them first` };
    }
    return { kind: 'blocked', features: stuck,
      summary: 'designed features exist but none are actionable — the graph needs repair' };
  }
  const validated = withStatus('validated');
  if (validated.length > 0) {
    return { kind: 'release', features: validated,
      summary: 'everything buildable is validated — ready to release' };
  }
  const proposed = withStatus('proposed');
  if (proposed.length > 0) {
    return { kind: 'design', features: proposed,
      summary: `${proposed.length} proposed feature(s) are the whole remaining backlog — design them next` };
  }
  return { kind: 'new-intake', features: [],
    summary: 'everything is shipped — bring the next intake' };
}

/**
 * The one call the command surface makes: mode, position, eligible set, proposal.
 * Never throws on an unconfigured repo — unconfigured is an answer, not an error.
 * @param {string} [root]
 */
export function machineOrientation(root = '.') {
  const state = detectState(root);
  if (state.mode === 'unconfigured') {
    return { ...state, proposal: { kind: 'onboard', features: [],
      summary: state.hasBrief
        ? 'a brief exists under docs/briefs/ but no design yet — resume onboarding at Design'
        : 'no design and no graph — nothing to resume; route to onboarding (Define → Design)' } };
  }
  if (state.mode === 'partial') {
    return { ...state, missing: [GRAPH], proposal: { kind: 'repair', features: [],
      summary: `a system design exists but the feature graph (${GRAPH}) is missing — finish the interrupted Design or restore it from git history` } };
  }

  const model = parse(readFileSync(path.join(root, GRAPH), 'utf8'));
  const position = countByStatus(model);
  const { ok, errors } = validate(model);
  if (!ok) {
    // An eligible set computed over an invalid graph is untrustworthy — don't offer one.
    return { ...state, position, graphErrors: errors, proposal: { kind: 'repair', features: [],
      summary: `the feature graph fails validation (${errors.length} error(s)) — fix ${GRAPH} before proposing work` } };
  }
  return {
    ...state,
    position,
    eligibleSet: eligibleSet(model).map((f) => f.id),
    proposal: propose(model),
  };
}

function countByStatus(model) {
  const byStatus = Object.fromEntries(STATUS.map((s) => [s, 0]));
  const features = model.features || [];
  for (const f of features) {
    if (byStatus[f.status] != null) { byStatus[f.status] += 1; }
  }
  return { designVersion: model.designVersion, total: features.length, byStatus };
}
