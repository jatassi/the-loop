import assert from 'node:assert/strict';
import { test } from 'node:test';

import { render } from '../src/render.js';
import { applyOutcome, isInterrupted, parseShipRecord, summarizeShips } from '../src/ship.js';

const RECORD = `# Ship 3

Narrative before the record — the evidence package narrated in prose.

## Ship record

\`\`\`yaml
ship: 3
ship_sha: abc123
design_version: 7
features: [alpha, beta]
evidence:
  integration: green
  security: []
  changelog: |
    - alpha shipped
  waivers: []
approval:
  approver: Jackson Atassi
  date: 2026-07-03
\`\`\`

Narrative after the record — approval granted, corridor not yet run.
`;

test('parseShipRecord extracts the ship-record contract fields and round-trips byte-for-byte through render', () => {
  const m = parseShipRecord(RECORD);
  assert.equal(m.ship, 3);
  assert.equal(m.ship_sha, 'abc123');
  assert.equal(m.design_version, 7);
  assert.deepEqual(m.features, ['alpha', 'beta']);
  assert.deepEqual(m.evidence, { integration: 'green', security: [], changelog: '- alpha shipped\n', waivers: [] });
  assert.deepEqual(m.approval, { approver: 'Jackson Atassi', date: '2026-07-03' });
  assert.ok(!('outcome' in m));
  assert.ok(!('rollback_verified' in m));
  assert.equal(render(RECORD, m), RECORD);
});

test('applyOutcome mutates the model and its retained document so render persists the new outcome and rollback_verified', () => {
  const m = parseShipRecord(RECORD);
  applyOutcome(m, { outcome: 'rolled-back', rollback_verified: false });
  assert.equal(m.outcome, 'rolled-back');
  assert.equal(m.rollback_verified, false);
  const rendered = render(RECORD, m);
  assert.notEqual(rendered, RECORD);
  const reparsed = parseShipRecord(rendered);
  assert.equal(reparsed.outcome, 'rolled-back');
  assert.equal(reparsed.rollback_verified, false);
  const above = RECORD.slice(0, RECORD.indexOf('## Ship record'));
  const below = RECORD.slice(RECORD.indexOf('Narrative after'));
  assert.ok(rendered.startsWith(above)); // narrative above untouched
  assert.ok(rendered.endsWith(below)); // narrative below untouched
});

test('applyOutcome omits rollback_verified from the persisted record when it is not given', () => {
  const m = parseShipRecord(RECORD);
  applyOutcome(m, { outcome: 'deployed' });
  assert.ok(!('rollback_verified' in m));
  assert.ok(!/rollback_verified/.test(render(RECORD, m)));
});

test('applyOutcome throws, model untouched, on an outcome outside the pinned enum', () => {
  const m = parseShipRecord(RECORD);
  assert.throws(() => applyOutcome(m, { outcome: 'success' }));
  assert.ok(!('outcome' in m));
});

test('applyOutcome throws, model untouched, when the record already carries an outcome', () => {
  const m = parseShipRecord(RECORD);
  applyOutcome(m, { outcome: 'deployed' });
  assert.throws(() => applyOutcome(m, { outcome: 'rolled-back' }));
  assert.equal(m.outcome, 'deployed'); // the refused second call left the first outcome standing
});

test('isInterrupted is true exactly for approval-without-outcome, false for no-approval and for outcome-present', () => {
  const approvedNoOutcome = parseShipRecord(RECORD);
  assert.equal(isInterrupted(approvedNoOutcome), true);

  const noApproval = { ...approvedNoOutcome, approval: undefined };
  assert.equal(isInterrupted(noApproval), false);

  const concluded = { ...approvedNoOutcome, outcome: 'deployed' };
  assert.equal(isInterrupted(concluded), false);
});

test('summarizeShips over zero records: count 0, latest null, next 1, previous_ship_sha null', () => {
  assert.deepEqual(summarizeShips([]), { count: 0, latest: null, next: 1, previous_ship_sha: null });
});

test('summarizeShips over one record: it is latest, next is N + 1, previous_ship_sha is its sha', () => {
  const record = { ship: 1, ship_sha: 'sha1' };
  assert.deepEqual(summarizeShips([record]), { count: 1, latest: record, next: 2, previous_ship_sha: 'sha1' });
});

test('summarizeShips over several unordered records: the highest-N record wins regardless of array order', () => {
  const r1 = { ship: 1, ship_sha: 'sha1' };
  const r2 = { ship: 2, ship_sha: 'sha2' };
  const r3 = { ship: 3, ship_sha: 'sha3' };
  assert.deepEqual(summarizeShips([r2, r3, r1]), { count: 3, latest: r3, next: 4, previous_ship_sha: 'sha3' });
});
