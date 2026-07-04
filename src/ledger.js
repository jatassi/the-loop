// The Ledger's deterministic projection (ADR-0006): everyone else mutates design.md;
// this is the only place that reads the graph back into the document humans read.
// "## What this is" and "## Run history" are prose no mechanism should touch — carried
// byte-identical from the prior render — while "## Where we are", "## What needs you",
// and "## What's next" are regenerated from the graph and the open escalations every
// time, so the two artifacts can never silently disagree
// (docs/standards/derived-and-hybrid-artifacts.md).

import { frontier } from './entry.js';
import { STATUS } from './schema.js';

/**
 * Render a full Ledger document from the feature graph and the open escalation
 * records. Deterministic: the same three inputs always render the same bytes.
 * @param {import('./parse.js').DesignModel} model
 * @param {import('./escalation.js').EscalationRecord[]} escalations
 * @param {string} priorText  the Ledger's previous render, for the preserved sections
 * @returns {string}
 */
export function renderLedger(model, escalations, priorText) {
  const sections = [
    section(priorText, '## What this is'),
    whereWeAre(model),
    whatNeedsYou(escalations || []),
    whatsNext(model),
    section(priorText, '## Run history'),
  ];
  return `${preamble(priorText)}${sections.join('\n\n')}\n`;
}

const SEEDED_TITLE = '# Ledger — projected from design.md (feature graph)';

// Everything in priorText before its first "## " heading — the human-owned title
// region — carried byte-identically. A priorText with no "## " heading at all is
// all preamble; one with nothing before its first heading (fresh or empty) seeds
// the standard title line instead.
function preamble(priorText) {
  const first = /^## /m.exec(priorText);
  const kept = first ? priorText.slice(0, first.index) : priorText;
  return kept === '' ? `${SEEDED_TITLE}\n\n` : kept;
}

// A preserved section's prior text verbatim: the heading line through the line before
// the next "## " heading, or end of doc. priorText never having carried this heading
// (a fresh Ledger, or one hand-edited past the section out) seeds a minimal
// placeholder instead of failing the whole render.
function section(priorText, heading) {
  const headingRe = new RegExp(String.raw`^${heading}\s*$`, 'm');
  const m = headingRe.exec(priorText);
  if (!m) { return `${heading}\n_seeded — no prior content for this section_`; }
  const bodyStart = m.index + m[0].length;
  const next = /^## /m.exec(priorText.slice(bodyStart));
  const end = next ? bodyStart + next.index : priorText.length;
  return priorText.slice(m.index, end).replace(/\n+$/, '');
}

// Status counts, total, design_version — the graph's headline numbers.
function whereWeAre(model) {
  const features = model.features || [];
  const counts = STATUS.map((s) => `- ${s}: ${features.filter((f) => f.status === s).length}`);
  return ['## Where we are', `Total: ${features.length} (design_version ${model.designVersion})`, '', ...counts].join('\n');
}

// One entry per open escalation, or an explicit nothing-parked line.
function whatNeedsYou(escalations) {
  if (escalations.length === 0) {
    return '## What needs you\nNothing parked — no open escalations.';
  }
  const entries = escalations.map((e) => {
    const menu = e.menu && e.menu.length > 0
      ? e.menu.map((m) => `[${m.resolution ?? '?'}] ${m.option}`).join('; ')
      : '(none)';
    return `- **${e.feature}** (${e.phase}): ${e.deviation ?? '(no deviation recorded)'}\n  - menu: ${menu}\n  - branch: ${e.branch ?? 'none'}`;
  });
  return ['## What needs you', ...entries].join('\n');
}

// The dependency-ready frontier, in graph order.
function whatsNext(model) {
  const tick = '`';
  const ready = frontier(model).map((f) => `${tick}${f.id}${tick}`);
  return `## What's next\n${ready.length > 0 ? ready.join(', ') : 'Nothing dependency-ready.'}`;
}

/**
 * Insert one newest-first Run-history bullet as the first content after the
 * "## Run history" heading in a Ledger's prior text. Pure: the heading and its
 * carried content are the only things read; everything else in priorText passes
 * through untouched. "## Run history" is a preserved section (renderLedger carries
 * it byte-identically), so a subsequent render keeps the inserted bullet exactly.
 * @param {string} priorText
 * @param {{date: string, run: string, completed?: string[], parked?: string[],
 *   stalled?: string[], halted?: {reason: string, detail: string},
 *   budget?: {spent: number, remaining: number}}} summary
 * @returns {string}
 */
export function appendRun(priorText, summary) {
  const { date, run } = summary || {};
  if (!date || !run) { throw new Error('run summary requires date and run'); }
  const headingRe = /^## Run history\s*$/m;
  const m = headingRe.exec(priorText);
  if (!m) { throw new Error('Ledger has no "## Run history" heading'); }
  const at = m.index + m[0].length;
  return `${priorText.slice(0, at)}\n${runBullet(summary)}${priorText.slice(at)}`;
}

// One deterministic line: date, run, then completed/parked/stalled id lists, halted
// reason+detail, budget — in that fixed order, empty segments omitted.
function runBullet({ date, run, completed = [], parked = [], stalled = [], halted, budget }) {
  const fields = [date, run];
  if (completed.length > 0) { fields.push(`completed: ${completed.join(', ')}`); }
  if (parked.length > 0) { fields.push(`parked: ${parked.join(', ')}`); }
  if (stalled.length > 0) { fields.push(`stalled: ${stalled.join(', ')}`); }
  if (halted) { fields.push(`halted: ${halted.reason} — ${halted.detail}`); }
  if (budget) { fields.push(`budget: ${budget.spent}/${budget.remaining}`); }
  return `- ${fields.join(' | ')}`;
}

/**
 * Insert one newest-first ship-history bullet as the first content after the
 * "## Run history" heading in a Ledger's prior text. Same insertion semantics as
 * appendRun: pure (the date arrives as an argument; no clock or filesystem read),
 * throws with priorText untouched when the heading is absent.
 * @param {string} priorText
 * @param {{date: string, ship: number, outcome: string, features?: string[],
 *   rollback_verified?: boolean}} entry
 * @returns {string}
 */
export function appendShip(priorText, entry) {
  const { date, ship, outcome } = entry || {};
  if (!date || ship == null || !outcome) {
    throw new Error('ship entry requires date, ship, and outcome');
  }
  const headingRe = /^## Run history\s*$/m;
  const m = headingRe.exec(priorText);
  if (!m) { throw new Error('Ledger has no "## Run history" heading'); }
  const at = m.index + m[0].length;
  return `${priorText.slice(0, at)}\n${shipBullet(entry)}${priorText.slice(at)}`;
}

// One deterministic line: date, ship-N, outcome, features, then rollback_verified
// exactly when entry.rollback_verified is defined — in that fixed order.
function shipBullet({ date, ship, outcome, features = [], rollback_verified }) {
  const fields = [date, `ship-${ship}`, outcome, `features: ${features.join(', ')}`];
  if (rollback_verified !== undefined) { fields.push(`rollback_verified: ${rollback_verified}`); }
  return `- ${fields.join(' | ')}`;
}
