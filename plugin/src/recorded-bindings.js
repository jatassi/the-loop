// The recorded-bindings status reader: derives present / absent / opted-out for
// architecture.md's three recorded bindings (validation runbook, release runbook,
// operations toolkit) from their heading/section text. Pure — takes the
// architecture.md text as a string, touches no filesystem, process, or clock
// (the pure-core/thin-CLI discipline). A thin CLI layer (later) reads the file
// and calls this. See docs/architecture.md and docs/designs/configure/design.md.

import { sectionAfter } from './replace-fenced-block.js';

const HEADINGS = {
  validationRunbook: '## Validation runbook',
  releaseRunbook: '## Release runbook',
  operationsToolkit: '## Operations toolkit',
};

// Named-gap wording for absent block-family bindings (configure design hook-
// inventory table). Validation has no declared named-gap phrase.
const GAPS = {
  releaseRunbook: 'blocked — no guessed deploys',
  operationsToolkit: 'lazy retrofit (operate-tooling)',
};

/**
 * @typedef {Object} BindingStatus
 * @property {'present'|'absent'|'opted-out'} status
 * @property {string|null} gap  the named-gap text a hooks-list-style CLI can print
 *                              verbatim when status is "absent" on a block family;
 *                              null otherwise
 */

/**
 * Derive present / absent / opted-out status for the three recorded bindings in
 * an architecture.md text string. Whole-section body `none` (trimmed, case-
 * insensitive) is a recorded opt-out. Absent block-family bindings carry their
 * named-gap wording; validation has none. Read-only — never proposes writes.
 * @param {string} architectureText  docs/architecture.md's full text
 * @returns {{validationRunbook: BindingStatus, releaseRunbook: BindingStatus, operationsToolkit: BindingStatus}}
 */
export function recordedBindingsStatus(architectureText) {
  return {
    validationRunbook: statusOf(architectureText, 'validationRunbook'),
    releaseRunbook: statusOf(architectureText, 'releaseRunbook'),
    operationsToolkit: statusOf(architectureText, 'operationsToolkit'),
  };
}

/**
 * @param {string} text
 * @param {'validationRunbook'|'releaseRunbook'|'operationsToolkit'} key
 * @returns {BindingStatus}
 */
function statusOf(text, key) {
  const body = sectionAfter(text, HEADINGS[key]);
  if (body === null) {
    return { status: 'absent', gap: GAPS[key] ?? null };
  }
  if (body.trim().toLowerCase() === 'none') {
    return { status: 'opted-out', gap: null };
  }
  return { status: 'present', gap: null };
}
