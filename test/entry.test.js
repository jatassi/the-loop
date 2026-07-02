// the-loop-entry's acceptance, executable: a fresh repo routes to onboarding; a
// configured repo reads its artifacts and proposes the next action. Fixture repos are
// temp dirs; the last test dogfoods orient() against this very repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../src/parse.js';
import { detectState, frontier, propose, orient } from '../src/entry.js';

const feat = (id, status, deps = []) =>
  `  - id: ${id}\n    title: ${id}\n    status: ${status}\n    depends_on: [${deps.join(', ')}]\n    acceptance: x\n`;
const design = (...features) =>
  '## Feature graph\n\n```yaml\ndesign_version: 1\nfeatures:\n' + features.join('') + '```\n';
const model = (...features) => parse(design(...features));

function repo({ designText, ledgerText, briefText } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'loop-entry-'));
  if (designText != null) {
    mkdirSync(join(root, 'docs/design'), { recursive: true });
    writeFileSync(join(root, 'docs/design/design.md'), designText);
  }
  if (ledgerText != null) {
    mkdirSync(join(root, 'docs/ledger'), { recursive: true });
    writeFileSync(join(root, 'docs/ledger/ledger.md'), ledgerText);
  }
  if (briefText != null) {
    mkdirSync(join(root, 'docs/briefs'), { recursive: true });
    writeFileSync(join(root, 'docs/briefs/brief.md'), briefText);
  }
  return root;
}

// ── acceptance leg 1: fresh repo routes to onboarding ──
test('a fresh repo orients to cold-start and proposes onboarding', () => {
  const o = orient(repo());
  assert.equal(o.mode, 'cold-start');
  assert.equal(o.proposal.kind, 'onboard');
  assert.match(o.proposal.summary, /onboarding/);
});

// ── acceptance leg 2: configured repo reads its state and proposes the next action ──
test('a configured repo orients to active with position, frontier, and a proposal', () => {
  const root = repo({
    designText: design(feat('a', 'validated'), feat('b', 'designed', ['a']), feat('c', 'designed', ['b'])),
    ledgerText: '# Ledger — fixture\n',
  });
  const o = orient(root);
  assert.equal(o.mode, 'active');
  assert.equal(o.ledger, join(root, 'docs/ledger/ledger.md'));
  assert.equal(o.position.total, 3);
  assert.equal(o.position.byStatus.validated, 1);
  assert.deepEqual(o.frontier, ['b']); // c is dep-blocked behind b
  assert.deepEqual(o.proposal, {
    kind: 'advance-frontier', features: ['b'], summary: '1 feature(s) are dependency-ready to advance',
  });
});

test('one artifact without the other is partial, proposing repair', () => {
  const o = orient(repo({ designText: design(feat('a', 'designed')) }));
  assert.equal(o.mode, 'partial');
  assert.deepEqual(o.missing, ['docs/ledger/ledger.md']);
  assert.equal(o.proposal.kind, 'repair');
  assert.deepEqual(detectState(repo({ ledgerText: 'x' })), { mode: 'partial', hasDesign: false, hasLedger: true, hasBrief: false });
});

// ── frame's routing seam: a Brief moves onboarding's resume point past Frame ──
test('cold-start with a Brief proposes onboarding resumed at Design', () => {
  const o = orient(repo({ briefText: '# Brief — fixture\n' }));
  assert.equal(o.mode, 'cold-start'); // a Brief alone never makes a project active
  assert.equal(o.hasBrief, true);
  assert.equal(o.proposal.kind, 'onboard');
  assert.match(o.proposal.summary, /resume onboarding at Design/);
});

test('cold-start without a Brief still routes onboarding through Frame', () => {
  const o = orient(repo());
  assert.equal(o.hasBrief, false);
  assert.match(o.proposal.summary, /Frame/);
});

test('an invalid graph orients to repair, never a frontier', () => {
  const root = repo({
    designText: design(feat('a', 'designed', ['ghost'])),
    ledgerText: 'x',
  });
  const o = orient(root);
  assert.equal(o.proposal.kind, 'repair');
  assert.ok(o.graphErrors.some((e) => e.code === 'dangling-dependency'));
  assert.ok(!('frontier' in o));
});

// ── frontier semantics ──
test('frontier = actionable features whose deps are all validated/shipped', () => {
  const m = model(
    feat('done', 'shipped'),
    feat('ready', 'designed', ['done']),
    feat('inflight', 'building', ['done']),
    feat('gated', 'designed', ['ready']),   // dep not DONE → excluded
    feat('parked', 'parked', ['done']),     // needs a human, not the engine → excluded
    feat('rot', 'drifted', ['done']),       // drifted is actionable (re-validation)
  );
  assert.deepEqual(frontier(m).map((f) => f.id), ['ready', 'inflight', 'rot']);
});

// ── proposal precedence ──
test('parked escalations outrank a drainable frontier (they wait on the human now present)', () => {
  const p = propose(model(feat('a', 'parked'), feat('b', 'designed')));
  assert.equal(p.kind, 'resolve-parked');
  assert.deepEqual(p.features, ['a']);
});

test('all validated proposes ship; all shipped proposes a new intake', () => {
  assert.equal(propose(model(feat('a', 'validated'), feat('b', 'shipped'))).kind, 'ship');
  assert.equal(propose(model(feat('a', 'shipped'))).kind, 'new-intake');
});

test('an exhausted-but-unfinished graph is blocked (the cycle safety net)', () => {
  const p = propose(model(feat('a', 'designed', ['b']), feat('b', 'designed', ['a'])));
  assert.equal(p.kind, 'blocked');
  assert.deepEqual(p.features, ['a', 'b']);
});

// ── the dogfood: this very repo orients ──
test('orient(".") reads the-loop itself as an active project with a sound proposal', () => {
  const o = orient('.');
  assert.equal(o.mode, 'active');
  assert.ok(!('graphErrors' in o));
  assert.ok(o.position.total >= 12); // the walking skeleton alone is 12 features
  assert.ok(['resolve-parked', 'advance-frontier', 'ship', 'new-intake'].includes(o.proposal.kind));
  assert.ok(o.frontier.every((id) => !o.parked.includes(id)));
});
