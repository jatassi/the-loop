// the-loop-entry's acceptance, executable: a fresh repo routes to onboarding; a
// configured repo reads its graph and proposes the next action. Fixture repos are
// temp dirs — status truth is docs/feature-graph.md (ADR-0034).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { parse } from '../src/parse-feature-graph.js';
import { detectState, eligibleSet, machineOrientation, propose } from '../src/propose-next-action.js';

const feat = (id, status, deps = []) =>
  `  - id: ${id}\n    title: ${id}\n    status: ${status}\n    depends_on: [${deps.join(', ')}]\n    acceptance: x\n`;
const graph = (...features) =>
  `## Feature graph\n\n\`\`\`yaml\ndesign_version: 1\nfeatures:\n${features.join('')}\`\`\`\n`;
const model = (...features) => parse(graph(...features));

function repo({ graphText, designText, briefText } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'loop-entry-'));
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  if (graphText != null) {
    writeFileSync(path.join(root, 'docs/feature-graph.md'), graphText);
  }
  if (designText != null) {
    writeFileSync(path.join(root, 'docs/architecture.md'), designText);
  }
  if (briefText != null) {
    mkdirSync(path.join(root, 'docs/briefs'), { recursive: true });
    writeFileSync(path.join(root, 'docs/briefs/brief.md'), briefText);
  }
  return root;
}

// ── acceptance leg 1: fresh repo routes to onboarding ──
test('a fresh repo orients to unconfigured and proposes onboarding', () => {
  const o = machineOrientation(repo());
  assert.equal(o.mode, 'unconfigured');
  assert.equal(o.proposal.kind, 'onboard');
  assert.match(o.proposal.summary, /onboarding/);
});

// ── acceptance leg 2: configured repo reads its state and proposes the next action ──
test('a repo with a graph orients to configured with position, eligible set, and a proposal', () => {
  const root = repo({
    graphText: graph(feat('a', 'validated'), feat('b', 'designed', ['a']), feat('c', 'designed', ['b'])),
  });
  const o = machineOrientation(root);
  assert.equal(o.mode, 'configured'); // configured iff feature-graph.md exists — architecture.md is not required
  assert.equal(o.position.total, 3);
  assert.equal(o.position.byStatus.validated, 1);
  assert.deepEqual(o.eligibleSet, ['b']); // c is dep-blocked behind b
  assert.deepEqual(o.proposal, {
    kind: 'advance-eligible-set', features: ['b'], summary: '1 feature(s) are dependency-ready to advance',
  });
});

test('a design without a graph is partial, proposing repair', () => {
  const o = machineOrientation(repo({ designText: '# Design\nnarrative\n' }));
  assert.equal(o.mode, 'partial');
  assert.deepEqual(o.missing, ['docs/feature-graph.md']);
  assert.equal(o.proposal.kind, 'repair');
  assert.deepEqual(detectState(repo({ designText: 'x' })),
    { mode: 'partial', hasDesign: true, hasGraph: false, hasBrief: false });
});

// ── define's routing seam: a brief moves onboarding's resume point past Define ──
test('unconfigured with a brief proposes onboarding resumed at Design', () => {
  const o = machineOrientation(repo({ briefText: '# brief — fixture\n' }));
  assert.equal(o.mode, 'unconfigured'); // a brief alone never makes a project configured
  assert.equal(o.hasBrief, true);
  assert.equal(o.proposal.kind, 'onboard');
  assert.match(o.proposal.summary, /resume onboarding at Design/);
});

test('unconfigured without a brief still routes onboarding through Define', () => {
  const o = machineOrientation(repo());
  assert.equal(o.hasBrief, false);
  assert.match(o.proposal.summary, /Define/);
});

test('an invalid graph orients to repair, never an eligible set', () => {
  const graphText = graph(feat('a', 'designed', ['ghost']));
  const o = machineOrientation(repo({ graphText }));
  assert.equal(o.proposal.kind, 'repair');
  assert.ok(o.graphErrors.some((e) => e.code === 'dangling-dependency'));
  assert.ok(!('eligibleSet' in o));
});

// ── eligible-set semantics ──
test('eligible set = designed features whose deps are all validated/shipped', () => {
  const m = model(
    feat('done', 'shipped'),
    feat('landed', 'validated'),
    feat('ready', 'designed', ['done', 'landed']), // both DONE flavors satisfy
    feat('gated', 'designed', ['ready']),          // dep still designed → excluded
  );
  assert.deepEqual(eligibleSet(m).map((f) => f.id), ['ready']);
});

// ── proposal precedence ──
test('a drainable eligible set proposes advance-eligible-set with the ready ids', () => {
  const p = propose(model(feat('a', 'validated'), feat('b', 'designed', ['a'])));
  assert.equal(p.kind, 'advance-eligible-set');
  assert.deepEqual(p.features, ['b']);
});

test('all validated proposes release; all shipped proposes a new intake', () => {
  const shippable = model(feat('a', 'validated'), feat('b', 'shipped'));
  assert.equal(propose(shippable).kind, 'release');
  const allShipped = model(feat('a', 'shipped'));
  assert.equal(propose(allShipped).kind, 'new-intake');
});

test('an exhausted-but-unfinished graph is blocked (the repair safety net)', () => {
  const p = propose(model(feat('a', 'designed', ['b']), feat('b', 'designed', ['a'])));
  assert.equal(p.kind, 'blocked');
  assert.deepEqual(p.features, ['a', 'b']);
});

// ── proposed-status: eligible-set exclusion, and the `design` proposal ──
test('a designed feature depending on a proposed one is excluded from the eligible set; the machine orientation proposes kind design naming the blocking proposed id, direct or transitive', () => {
  const direct = repo({ graphText: graph(feat('backlog', 'proposed'), feat('blocked-feature', 'designed', ['backlog'])) });
  const o = machineOrientation(direct);
  assert.deepEqual(o.eligibleSet, []); // never enters the eligible set
  assert.equal(o.proposal.kind, 'design');
  assert.deepEqual(o.proposal.features, ['backlog']);

  // transitive: chained depends on gate, which depends on the proposed backlog item —
  // the proposal names only the proposed root cause, not the intermediate designed link.
  const chainedRoot = repo({
    graphText: graph(
      feat('backlog', 'proposed'),
      feat('gate', 'designed', ['backlog']),
      feat('chained', 'designed', ['gate']),
    ),
  });
  assert.deepEqual(machineOrientation(chainedRoot).proposal.features, ['backlog']);
});

test('on a graph whose only unshipped features are proposed, the machine orientation proposes kind design naming them, never new-intake', () => {
  const root = repo({ graphText: graph(feat('done', 'shipped'), feat('next-up', 'proposed'), feat('later', 'proposed')) });
  const o = machineOrientation(root);
  assert.equal(o.proposal.kind, 'design');
  assert.deepEqual(o.proposal.features, ['next-up', 'later']);
});
