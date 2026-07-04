// docs/escalations/<feature-id>.md — narrative prose, then one ```yaml block under
// "## Escalation" (contract: escalation-record, ADR-0029). Parking agents write the
// file; resolution (a later feature) deletes it. This layer only reads it: there is
// no in-place mutation contract for an escalation record, unlike the graph/plan.

import YAML from 'yaml';

import { yamlBlockAfter } from './blocks.js';

const HEADING = '## Escalation';

/**
 * @typedef {Object} MenuEntry
 * @property {string|null} resolution  retry | fix-in-place | re-plan | waive | defer, or
 *                                     null for a pre-amendment bare-string entry
 * @property {string} option
 */

/**
 * @typedef {Object} EscalationRecord
 * @property {string} feature
 * @property {string} phase        plan | build | validate
 * @property {string} kind         feature | environment
 * @property {string|null} deviation
 * @property {MenuEntry[]} menu    authored by the parking agent, recommended first;
 *                                 normalized from either a { resolution, option } mapping
 *                                 or a pre-amendment bare string (resolution: null)
 * @property {string|null} branch  the loop/<feature-id> ref, or null when none exists
 */

/**
 * A raw menu entry is either a pre-amendment bare string or a { resolution, option }
 * mapping; normalize both to the mapping shape.
 * @param {string|{resolution: string, option: string}} entry
 * @returns {MenuEntry}
 */
function normalizeMenuEntry(entry) {
  if (typeof entry === 'string') { return { resolution: null, option: entry }; }
  return { resolution: entry.resolution ?? null, option: entry.option };
}

/**
 * Parse an escalation record's yaml block. Lenient like parse()/parsePlan(): text
 * with no "## Escalation" heading, or a heading with no fenced yaml block under it,
 * yields null rather than throwing — an absent escalation is not a parse error.
 * @param {string} text
 * @returns {EscalationRecord|null}
 */
export function parseEscalation(text) {
  const span = yamlBlockAfter(text, HEADING);
  if (!span) { return null; }
  const js = YAML.parse(span.inner) || {};
  return {
    feature: js.feature ?? null,
    phase: js.phase ?? null,
    kind: js.kind ?? null,
    deviation: js.deviation ?? null,
    menu: (js.menu || []).map((entry) => normalizeMenuEntry(entry)),
    branch: js.branch ?? null,
  };
}

const PHASES = ['plan', 'build', 'validate'];

// The status a resolution flips a parked feature to, keyed by the park's phase: a
// retry/fix-in-place re-enters the loop at the phase that was parked (a plan park
// goes back to `designed`, a build or validate park to `building`); re-plan always
// re-plans from `designed`; waive lands `validated` and belongs to a validate park
// only. A kind/phase pair with no cell here is an invalid combination.
const FLIP = {
  retry: { plan: 'designed', build: 'building', validate: 'building' },
  'fix-in-place': { plan: 'designed', build: 'building', validate: 'building' },
  're-plan': { plan: 'designed', build: 'designed', validate: 'designed' },
  waive: { validate: 'validated' },
};

/**
 * @typedef {Object} Resolution
 * @property {string} status         the design.md status the feature flips to
 * @property {boolean} deletesPlan   re-plan discards the plan artifact
 * @property {boolean} stampsRetried retry-on-a-validate-park stamps the retried mark
 */

/**
 * Validate a resolution kind against the park's phase and return the resulting status
 * flip plus the kind-specific extras the effecting caller must run. Pure — the flip
 * table and its guards live here; bin/spine.js performs the writes. Throws on every
 * invalid combination, so a bad resolution never reaches a write:
 *   - defer is not a resolution — it leaves the park in place
 *   - an unknown kind, or an unknown phase
 *   - waive on anything but a validate park
 *   - retry on a validate park with no reason to stamp
 * @param {string} kind   retry | fix-in-place | re-plan | waive
 * @param {string} phase  plan | build | validate — from the escalation record
 * @param {{reason?: string}} [opts]
 * @returns {Resolution}
 */
export function planResolution(kind, phase, { reason } = {}) {
  if (kind === 'defer') {
    throw new Error('defer leaves the park in place — there is nothing to resolve');
  }
  if (!Object.hasOwn(FLIP, kind)) {
    throw new Error(`unknown resolution kind: ${JSON.stringify(kind)} (expected ${Object.keys(FLIP).join('|')})`);
  }
  if (!PHASES.includes(phase)) {
    throw new Error(`unknown phase: ${JSON.stringify(phase)} (expected ${PHASES.join('|')})`);
  }
  const status = FLIP[kind][phase];
  if (!status) { throw new Error(`${kind} is valid only on a validate park, not a ${phase} park`); }
  if (kind === 'retry' && phase === 'validate' && !reason) {
    throw new Error('retry on a validate park requires a reason');
  }
  return {
    status,
    deletesPlan: kind === 're-plan',
    stampsRetried: kind === 'retry' && phase === 'validate',
  };
}
