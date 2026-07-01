import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../src/parse.js';
import { STATUS } from '../src/schema.js';
import { resolve, resolveIn, extractIndex } from '../src/resolve.js';

const realModel = () => parse(readFileSync('docs/design/design.md', 'utf8'));

test('resolve("artifact-spine") returns the node + its two contracts (the acceptance test)', () => {
  const { node, contracts } = resolve('artifact-spine');
  assert.equal(node.id, 'artifact-spine');
  assert.deepEqual(contracts.map((c) => c.id).sort(), ['feature-node', 'injection-resolver']);
  assert.match(contracts.find((c) => c.id === 'feature-node').body, /depends_on/);
});

test('resolveIn throws on an unknown id', () => {
  const m = parse('## Feature graph\n\n```yaml\ndesign_version: 1\nfeatures: []\n```\n');
  assert.throws(() => resolveIn(m, 'nope'), /unknown feature id/);
});

test('plan-phase resolves to its sizing-gate contract', () => {
  const { node, contracts } = resolveIn(realModel(), 'plan-phase');
  assert.equal(node.id, 'plan-phase');
  assert.deepEqual(contracts.map((c) => c.id), ['sizing-gate']);
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
