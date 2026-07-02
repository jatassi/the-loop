import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parse } from '../src/parse.js';
import { extractIndex,resolve, resolveIn } from '../src/resolve.js';
import { STATUS } from '../src/schema.js';

const realModel = () => parse(readFileSync('docs/design/design.md', 'utf8'));

test('resolve("artifact-spine") returns the node + its two contracts (the acceptance test)', () => {
  const { node, contracts } = resolve('artifact-spine');
  assert.equal(node.id, 'artifact-spine');
  assert.deepEqual(contracts.map((c) => c.id).toSorted((a, b) => a.localeCompare(b)), ['feature-node', 'injection-resolver']);
  assert.match(contracts.find((c) => c.id === 'feature-node').body, /depends_on/);
});

test('resolveIn throws on an unknown id', () => {
  const m = parse('## Feature graph\n\n```yaml\ndesign_version: 1\nfeatures: []\n```\n');
  assert.throws(() => resolveIn(m, 'nope'), /unknown feature id/);
});

test('plan resolves to the sizing-gate + handoff contracts', () => {
  const { node, contracts } = resolveIn(realModel(), 'plan');
  assert.equal(node.id, 'plan');
  assert.deepEqual(contracts.map((c) => c.id), ['sizing-gate', 'task-contract', 'completion-report']);
});

test('resolveIn tolerates a dangling interface ref (skips it, no throw)', () => {
  const m = parse(
    '## Feature graph\n\n```yaml\ndesign_version: 1\nfeatures:\n  - id: a\n    title: A\n    status: designed\n    acceptance: x\n    interfaces: [real, ghost]\n```\n\n' +
    '## Key interface contracts\n\n```yaml\ncontracts:\n  - id: real\n    body: |\n      { }\n```\n',
  );
  assert.deepEqual(resolveIn(m, 'a').contracts.map((c) => c.id), ['real']); // ghost skipped
});

test('extractIndex carries edges/status/acceptance but no contract bodies', () => {
  const idx = extractIndex(realModel());
  assert.equal(idx.designVersion, 1);
  const a = idx.features.find((f) => f.id === 'artifact-spine');
  assert.ok(STATUS.includes(a.status)); // carries status, without pinning the live doc's mutable value
  assert.deepEqual(a.interfaces, ['feature-node', 'injection-resolver']);
  assert.ok(typeof a.acceptance === 'string' && a.acceptance.length > 0);
  assert.ok(!('contracts' in idx)); // bodies live nowhere in the index
  assert.ok(idx.features.every((f) => !('body' in f)));
});
