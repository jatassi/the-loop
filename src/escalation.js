// docs/escalations/<feature-id>.md — narrative prose, then one ```yaml block under
// "## Escalation" (contract: escalation-record, ADR-0029). Parking agents write the
// file; resolution (a later feature) deletes it. This layer only reads it: there is
// no in-place mutation contract for an escalation record, unlike the graph/plan.

import YAML from 'yaml';

import { yamlBlockAfter } from './blocks.js';

const HEADING = '## Escalation';

/**
 * @typedef {Object} EscalationRecord
 * @property {string} feature
 * @property {string} phase        plan | build | validate
 * @property {string} kind         feature | environment
 * @property {string|null} deviation
 * @property {string[]} menu       authored by the parking agent
 * @property {string|null} branch  the loop/<feature-id> ref, or null when none exists
 */

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
    menu: js.menu || [],
    branch: js.branch ?? null,
  };
}
