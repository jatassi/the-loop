// The deterministic core of /the-loop (ADR-0002): where does this project stand, and
// what should happen next? Pure inspection — reads artifacts, never writes them. The
// command surface (commands/the-loop.md) narrates on top of this JSON; status truth
// comes from the feature graph, not the Ledger, which is a projection for humans
// (ADR-0006). Cold-start routing per ADR-0017.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parse } from './parse.js';
import { STATUS, validate } from './schema.js';

const DESIGN = 'docs/design/design.md';
const LEDGER = 'docs/ledger/ledger.md';
const BRIEF = 'docs/briefs/brief.md';

// Statuses that satisfy a depends_on edge (the work behind it is done)…
const DONE = new Set(['validated', 'shipped']);
// …and those the engine may advance without a human decision. parked needs one
// (ADR-0009); drifted is actionable — it re-enters via impact-scoped re-validation.
const ACTIONABLE = new Set(['designed', 'planned', 'building', 'drifted']);

/**
 * @typedef {Object} Proposal
 * @property {'onboard'|'repair'|'resolve-parked'|'advance-frontier'|'ship'|'new-intake'|'blocked'} kind
 * @property {string[]} features  the ids the proposal concerns
 * @property {string} summary     one sentence; the command surface expands it
 */

/**
 * Cold-start detection (ADR-0017): a project with no design doc and no Ledger has
 * nothing to resume, so /the-loop routes to onboarding. The durable artifacts are the
 * state proxy — harness-native config arrives with configure-step-full. A Brief never
 * changes the mode (Frame's output, not Design's); it only moves onboarding's resume
 * point past Frame.
 * @param {string} [root]
 * @returns {{mode: 'cold-start'|'active'|'partial', hasDesign: boolean, hasLedger: boolean, hasBrief: boolean}}
 */
export function detectState(root = '.') {
  const hasDesign = existsSync(path.join(root, DESIGN));
  const hasLedger = existsSync(path.join(root, LEDGER));
  const hasBrief = existsSync(path.join(root, BRIEF));
  let mode = 'cold-start';
  if (hasDesign && hasLedger) { mode = 'active'; }
  else if (hasDesign || hasLedger) { mode = 'partial'; }
  return { mode, hasDesign, hasLedger, hasBrief };
}

/**
 * The dependency-ready frontier: features the engine could advance right now —
 * actionable status, every depends_on edge satisfied.
 * @param {import('./parse.js').DesignModel} model
 * @returns {import('./parse.js').FeatureNode[]}
 */
export function frontier(model) {
  const byId = new Map((model.features || []).map((f) => [f.id, f]));
  const satisfied = (id) => { const d = byId.get(id); return !!d && DONE.has(d.status); };
  return (model.features || []).filter(
    (f) => ACTIONABLE.has(f.status) && (f.depends_on || []).every((id) => satisfied(id)),
  );
}

/**
 * The next-action proposal /the-loop opens with. Precedence: parked escalations first
 * (they are waiting on exactly the human now present — ADR-0009), then the drainable
 * frontier, then Ship, then a fresh intake. `blocked` is the safety net: unreachable
 * on a validate-clean graph (acyclic + no dangling edges ⇒ some actionable feature
 * has a satisfied frontier), so seeing it means the graph needs repair.
 * @param {import('./parse.js').DesignModel} model
 * @returns {Proposal}
 */
export function propose(model) {
  const features = model.features || [];
  const withStatus = (s) => features.filter((f) => f.status === s).map((f) => f.id);

  const parked = withStatus('parked');
  if (parked.length > 0) {
    return { kind: 'resolve-parked', features: parked,
      summary: `${parked.length} parked escalation(s) need a decision before their slices can move` };
  }
  const ready = frontier(model).map((f) => f.id);
  if (ready.length > 0) {
    return { kind: 'advance-frontier', features: ready,
      summary: `${ready.length} feature(s) are dependency-ready to advance` };
  }
  const stuck = features.filter((f) => !DONE.has(f.status)).map((f) => f.id);
  if (stuck.length > 0) {
    return { kind: 'blocked', features: stuck,
      summary: 'non-terminal features exist but none are actionable — the graph needs repair' };
  }
  const validated = withStatus('validated');
  if (validated.length > 0) {
    return { kind: 'ship', features: validated,
      summary: 'everything buildable is validated — the frontier is shippable' };
  }
  return { kind: 'new-intake', features: [],
    summary: 'everything is shipped — bring the next intake' };
}

/**
 * The one call the command surface makes: mode, position, parked, frontier, proposal.
 * Never throws on an unconfigured repo — cold-start is an answer, not an error.
 * @param {string} [root]
 */
export function orient(root = '.') {
  const state = detectState(root);
  if (state.mode === 'cold-start') {
    return { ...state, proposal: { kind: 'onboard', features: [],
      summary: state.hasBrief
        ? 'a Brief exists (docs/briefs/brief.md) but no design.md or Ledger — resume onboarding at Design'
        : 'no design.md and no Ledger — nothing to resume; route to greenfield onboarding (Configure → Frame → Design, ADR-0017)' } };
  }
  if (state.mode === 'partial') {
    const missing = [!state.hasDesign && DESIGN, !state.hasLedger && LEDGER].filter(Boolean);
    return { ...state, missing, proposal: { kind: 'repair', features: [],
      summary: `half-configured project (missing: ${missing.join(', ')}) — repair before resuming` } };
  }

  const model = parse(readFileSync(path.join(root, DESIGN), 'utf8'));
  const position = countByStatus(model);
  const { ok, errors } = validate(model);
  if (!ok) {
    // A frontier computed over an invalid graph is untrustworthy — don't offer one.
    return { ...state, position, graphErrors: errors, proposal: { kind: 'repair', features: [],
      summary: `the feature graph fails validation (${errors.length} error(s)) — fix design.md before proposing work` } };
  }
  return {
    ...state,
    ledger: path.join(root, LEDGER),
    position,
    parked: model.features.filter((f) => f.status === 'parked').map((f) => f.id),
    frontier: frontier(model).map((f) => f.id),
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
