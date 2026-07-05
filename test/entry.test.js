// the-loop-entry's acceptance, executable: a fresh repo routes to onboarding; a
// configured repo reads its graph and proposes the next action. Fixture repos are
// temp dirs — status truth is docs/design/graph.md (ADR-0034).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { detectState, frontier, orient, propose } from '../src/entry.js';
import { parse } from '../src/parse.js';

const feat = (id, status, deps = []) =>
  `  - id: ${id}\n    title: ${id}\n    status: ${status}\n    depends_on: [${deps.join(', ')}]\n    acceptance: x\n`;
const graph = (...features) =>
  `## Feature graph\n\n\`\`\`yaml\ndesign_version: 1\nfeatures:\n${features.join('')}\`\`\`\n`;
const model = (...features) => parse(graph(...features));

function repo({ graphText, designText, briefText } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'loop-entry-'));
  mkdirSync(path.join(root, 'docs/design'), { recursive: true });
  if (graphText != null) {
    writeFileSync(path.join(root, 'docs/design/graph.md'), graphText);
  }
  if (designText != null) {
    writeFileSync(path.join(root, 'docs/design/design.md'), designText);
  }
  if (briefText != null) {
    mkdirSync(path.join(root, 'docs/briefs'), { recursive: true });
    writeFileSync(path.join(root, 'docs/briefs/brief.md'), briefText);
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
test('a repo with a graph orients to active with position, frontier, and a proposal', () => {
  const root = repo({
    graphText: graph(feat('a', 'validated'), feat('b', 'designed', ['a']), feat('c', 'designed', ['b'])),
  });
  const o = orient(root);
  assert.equal(o.mode, 'active'); // active iff graph.md exists — design.md is not required
  assert.equal(o.position.total, 3);
  assert.equal(o.position.byStatus.validated, 1);
  assert.deepEqual(o.frontier, ['b']); // c is dep-blocked behind b
  assert.deepEqual(o.proposal, {
    kind: 'advance-frontier', features: ['b'], summary: '1 feature(s) are dependency-ready to advance',
  });
});

test('a design without a graph is partial, proposing repair', () => {
  const o = orient(repo({ designText: '# Design\nnarrative\n' }));
  assert.equal(o.mode, 'partial');
  assert.deepEqual(o.missing, ['docs/design/graph.md']);
  assert.equal(o.proposal.kind, 'repair');
  assert.deepEqual(detectState(repo({ designText: 'x' })),
    { mode: 'partial', hasDesign: true, hasGraph: false, hasBrief: false });
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
  const graphText = graph(feat('a', 'designed', ['ghost']));
  const o = orient(repo({ graphText }));
  assert.equal(o.proposal.kind, 'repair');
  assert.ok(o.graphErrors.some((e) => e.code === 'dangling-dependency'));
  assert.ok(!('frontier' in o));
});

// ── frontier semantics ──
test('frontier = designed features whose deps are all validated/shipped', () => {
  const m = model(
    feat('done', 'shipped'),
    feat('landed', 'validated'),
    feat('ready', 'designed', ['done', 'landed']), // both DONE flavors satisfy
    feat('gated', 'designed', ['ready']),          // dep still designed → excluded
  );
  assert.deepEqual(frontier(m).map((f) => f.id), ['ready']);
});

// ── proposal precedence ──
test('a drainable frontier proposes advance-frontier with the ready ids', () => {
  const p = propose(model(feat('a', 'validated'), feat('b', 'designed', ['a'])));
  assert.equal(p.kind, 'advance-frontier');
  assert.deepEqual(p.features, ['b']);
});

test('all validated proposes ship; all shipped proposes a new intake', () => {
  const shippable = model(feat('a', 'validated'), feat('b', 'shipped'));
  assert.equal(propose(shippable).kind, 'ship');
  const allShipped = model(feat('a', 'shipped'));
  assert.equal(propose(allShipped).kind, 'new-intake');
});

test('an exhausted-but-unfinished graph is blocked (the repair safety net)', () => {
  const p = propose(model(feat('a', 'designed', ['b']), feat('b', 'designed', ['a'])));
  assert.equal(p.kind, 'blocked');
  assert.deepEqual(p.features, ['a', 'b']);
});
