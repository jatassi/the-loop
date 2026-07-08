// Oracle for proposed-status-t2-routing — exercises the machine orientation (the public
// entry the criteria name, behind `the-loop status --json`) over temp graph repos. It
// asserts the observable proposal (kind + named ids) and the eligible-set exclusion,
// independent of how the routing is structured internally. At the parent state a proposed
// feature fails graph validation, so machineOrientation returns a `repair` proposal and no
// eligibleSet — every assertion below is red until proposed becomes a first-class status.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { machineOrientation } from '../src/propose-next-action.js';

// A proposed record carries no acceptance; every other status does.
const feat = (id, status, deps = []) =>
  `  - id: ${id}\n    title: ${id}\n    status: ${status}\n    depends_on: [${deps.join(', ')}]${status === 'proposed' ? '' : '\n    acceptance: [does a thing]'}`;

function repo(...features) {
  const root = mkdtempSync(path.join(tmpdir(), 'ps-routing-'));
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  writeFileSync(path.join(root, 'docs/feature-graph.md'),
    `# Fixture — Feature graph\n\n## Feature graph\n\n\`\`\`yaml\ndesign_version: 1\nfeatures:\n${features.join('\n')}\n\`\`\`\n`);
  writeFileSync(path.join(root, 'docs/architecture.md'), '# Fixture — Architecture\n');
  return root;
}

test('criterion 1 (direct): a designed feature blocked by a proposed dep is out of the eligible set, and the orientation proposes design naming the proposed id', () => {
  const root = repo(feat('backlog', 'proposed'), feat('blocked-feature', 'designed', ['backlog']));
  try {
    const o = machineOrientation(root);
    assert.deepEqual(o.eligibleSet, [], 'the blocked designed feature never enters the eligible set');
    assert.equal(o.proposal.kind, 'design');
    assert.deepEqual(o.proposal.features, ['backlog']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('criterion 1 (transitive): the proposal names only the proposed root cause, not the intermediate designed link', () => {
  const root = repo(feat('backlog', 'proposed'), feat('gate', 'designed', ['backlog']), feat('chained', 'designed', ['gate']));
  try {
    const o = machineOrientation(root);
    assert.equal(o.proposal.kind, 'design');
    assert.deepEqual(o.proposal.features, ['backlog']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('criterion 2: on a graph whose only unshipped features are proposed, the orientation proposes design naming them, never new-intake', () => {
  const root = repo(feat('done', 'shipped'), feat('next-up', 'proposed'), feat('later', 'proposed'));
  try {
    const o = machineOrientation(root);
    assert.equal(o.proposal.kind, 'design');
    assert.notEqual(o.proposal.kind, 'new-intake');
    assert.deepEqual(o.proposal.features, ['next-up', 'later']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
