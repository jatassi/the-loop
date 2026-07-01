import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parse.js';
import { findBlocks, replaceBlock } from '../src/blocks.js';

const DOC = `# Title

intro narrative

## Feature graph

\`\`\`yaml
design_version: 1
features:
  - id: a
    title: Feature A
    status: designed
    depends_on: []
    interfaces: [shape-a]
    notes:
      - watch the hub files
    acceptance: does the thing
  - id: b
    title: Feature B
    status: planned
    depends_on: [a]
    interfaces: []
    acceptance: [one, two]
\`\`\`

## Key interface contracts

\`\`\`yaml
contracts:
  - id: shape-a
    body: |
      { x, y }
\`\`\`
`;

test('parse extracts design version, features, and contracts', () => {
  const m = parse(DOC);
  assert.equal(m.designVersion, 1);
  assert.deepEqual(m.features.map((f) => f.id), ['a', 'b']);
  assert.equal(m.features[0].status, 'designed');
  assert.deepEqual(m.features[0].interfaces, ['shape-a']);
  assert.deepEqual(m.features[1].depends_on, ['a']);
  assert.equal(m.features[0].acceptance, 'does the thing');
  assert.deepEqual(m.features[1].acceptance, ['one', 'two']); // string | string[] both preserved
  assert.deepEqual(m.features[0].notes, ['watch the hub files']); // baked-in design notes carried
  assert.ok(!('notes' in m.features[1])); // absent notes stay absent (faithful view)
  assert.equal(m.contracts.length, 1);
  assert.equal(m.contracts[0].id, 'shape-a');
  assert.match(m.contracts[0].body, /\{ x, y \}/);
});

test('parse defaults missing edge arrays to []', () => {
  const m = parse('## Feature graph\n\n```yaml\ndesign_version: 1\nfeatures:\n  - id: a\n    title: A\n    status: designed\n    acceptance: x\n```\n');
  assert.deepEqual(m.features[0].depends_on, []);
  assert.deepEqual(m.features[0].interfaces, []);
});

test('parse is lenient when blocks are absent', () => {
  const m = parse('# just narrative\n');
  assert.deepEqual(m.features, []);
  assert.deepEqual(m.contracts, []);
  assert.equal(m._blocks.featureGraph, null);
});

test('findBlocks locates both blocks; replaceBlock is surgical', () => {
  const b = findBlocks(DOC);
  assert.ok(b.featureGraph && b.contracts);
  const replaced = replaceBlock(DOC, b.contracts, 'contracts: []');
  assert.ok(replaced.includes('contracts: []'));
  assert.ok(replaced.startsWith('# Title\n')); // leading narrative preserved
  assert.ok(replaced.includes('## Feature graph')); // the earlier block is untouched
});
