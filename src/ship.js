// The ship record artifact (docs/ships/ship-<N>.md): narrative plus one fenced yaml
// block under "## Ship record" (contract: ship-record, ADR-0033). Parse is lenient
// like parse()/parsePlan(): a missing block yields a record with every contract field
// absent and _blocks.record null, rather than throwing — the bin edge (spine ship
// status) is where a genuinely malformed file becomes an exit. Mutation goes through
// the retained yaml Document (docs/standards/derived-and-hybrid-artifacts.md) so
// render() persists exactly the touched field with every other byte untouched.

import YAML from 'yaml';

import { yamlBlockAfter } from './blocks.js';

const HEADING = '## Ship record';

/** The corridor's three concluding outcomes (ADR-0033) — a ship record's outcome field. */
export const OUTCOMES = ['deployed', 'rolled-back', 'deploy-failed'];

/**
 * @typedef {Object} ShipRecord
 * @property {number} [ship]
 * @property {string} [ship_sha]
 * @property {number} [design_version]
 * @property {string[]} features
 * @property {Object} [evidence]
 * @property {Object} [approval]              {approver, date} — absent pre-approval
 * @property {string} [outcome]                deployed | rolled-back | deploy-failed
 * @property {boolean} [rollback_verified]
 * @property {{record: ({doc: YAML.Document, span: import('./blocks.js').Span}|null)}} _blocks
 *           the retained yaml Document + span — render()'s substrate; not for consumers
 */

/**
 * Parse a ship record. Lenient: a missing "## Ship record" block yields features: []
 * and every other contract field undefined, with _blocks.record null rather than
 * throwing — the caller decides whether an absent block is an error.
 * @param {string} text
 * @returns {ShipRecord}
 */
export function parseShipRecord(text) {
  const span = yamlBlockAfter(text, HEADING);
  const doc = span ? YAML.parseDocument(span.inner) : null;
  const js = (doc && doc.toJS()) || {};
  return {
    ship: js.ship,
    ship_sha: js.ship_sha,
    design_version: js.design_version,
    features: js.features || [],
    evidence: js.evidence,
    approval: js.approval,
    ...(js.outcome != null && { outcome: js.outcome }),
    ...(js.rollback_verified != null && { rollback_verified: js.rollback_verified }),
    _blocks: { record: span ? { doc, span } : null },
  };
}

/**
 * Apply the corridor's concluded outcome to a parsed ship record — mutates both the JS
 * model and its retained yaml Document so render() persists exactly the new fields,
 * every other byte untouched. Refuses, model and document both untouched, an outcome
 * outside the pinned enum or a record that already concluded: a ship record's outcome
 * is written once.
 * @param {ShipRecord} model
 * @param {{outcome: string, rollback_verified?: boolean}} update
 */
export function applyOutcome(model, { outcome, rollback_verified } = {}) {
  if (!OUTCOMES.includes(outcome)) {
    throw new Error(`outcome must be one of ${OUTCOMES.join('|')} (got ${JSON.stringify(outcome)})`);
  }
  if (model.outcome != null) {
    throw new Error(`ship-${model.ship} already carries an outcome (${model.outcome})`);
  }
  model.outcome = outcome;
  model._blocks.record.doc.setIn(['outcome'], outcome);
  if (rollback_verified != null) {
    model.rollback_verified = rollback_verified;
    model._blocks.record.doc.setIn(['rollback_verified'], rollback_verified);
  }
}

/**
 * A record is interrupted mid-corridor exactly when it carries approval but no
 * outcome — commit 1 landed, the corridor never concluded (or crashed). Never
 * auto-resumed; the caller surfaces it instead.
 * @param {ShipRecord} record
 * @returns {boolean}
 */
export function isInterrupted(record) {
  return Boolean(record.approval) && record.outcome == null;
}

/**
 * @typedef {Object} ShipSummary
 * @property {number} count
 * @property {ShipRecord|null} latest      the highest-N record, or null when none
 * @property {number} next                 highest N + 1, or 1 when none
 * @property {string|null} previous_ship_sha  latest's ship_sha, or null when none
 */

/**
 * Summarize a set of parsed ship records, order-independent — the healing + pin
 * helper `spine ship status` and `spine ship book` both build on.
 * @param {ShipRecord[]} records
 * @returns {ShipSummary}
 */
export function summarizeShips(records) {
  if (records.length === 0) {
    return { count: 0, latest: null, next: 1, previous_ship_sha: null };
  }
  const latest = highestN(records);
  return { count: records.length, latest, next: latest.ship + 1, previous_ship_sha: latest.ship_sha };
}

// The record carrying the highest `ship` number, first-wins on a tie.
function highestN(records) {
  let best = records[0];
  for (const r of records) {
    if (r.ship > best.ship) { best = r; }
  }
  return best;
}
