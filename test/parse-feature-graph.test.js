import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse } from '../plugin/src/parse-feature-graph.js';
import { findBlocks, replaceBlock, sectionAfter } from '../plugin/src/replace-fenced-block.js';

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
    notes:
      - watch the hub files
    acceptance: does the thing
  - id: b
    title: Feature B
    status: validated
    depends_on: [a]
    acceptance: [one, two]
\`\`\`

## Closing narrative

outro prose
`;

test('parse extracts design version and features', () => {
  const m = parse(DOC);
  assert.equal(m.designVersion, 1);
  assert.deepEqual(m.features.map((f) => f.id), ['a', 'b']);
  assert.equal(m.features[0].status, 'designed');
  assert.deepEqual(m.features[1].depends_on, ['a']);
  assert.equal(m.features[0].acceptance, 'does the thing');
  assert.deepEqual(m.features[1].acceptance, ['one', 'two']); // string | string[] both preserved
  assert.deepEqual(m.features[0].notes, ['watch the hub files']); // baked-in design notes carried
  assert.ok(!('notes' in m.features[1])); // absent notes stay absent (faithful view)
});

test('parse defaults missing edge arrays to []', () => {
  const m = parse('## Feature graph\n\n```yaml\ndesign_version: 1\nfeatures:\n  - id: a\n    title: A\n    status: designed\n    acceptance: x\n```\n');
  assert.deepEqual(m.features[0].depends_on, []);
});

test('parse is lenient when the block is absent', () => {
  const m = parse('# just narrative\n');
  assert.deepEqual(m.features, []);
  assert.equal(m._blocks.featureGraph, null);
});

test('findBlocks locates the feature-graph block; replaceBlock is surgical', () => {
  const b = findBlocks(DOC);
  assert.ok(b.featureGraph);
  const replaced = replaceBlock(DOC, b.featureGraph, 'design_version: 2\nfeatures: []');
  assert.ok(replaced.includes('design_version: 2\nfeatures: []'));
  assert.ok(replaced.startsWith('# Title\n')); // leading narrative preserved
  assert.ok(replaced.endsWith('## Closing narrative\n\noutro prose\n')); // trailing narrative too
});

const DESIGN = `# Design

System narrative.

## Validation procedure

Run \`node bin/app.js ping\` and expect \`pong\` on stdout.
A second probe line.

## Release runbook

Tag the release.
`;

test('sectionAfter excerpts the prose under a heading up to the next "## " heading, trimmed', () => {
  assert.equal(
    sectionAfter(DESIGN, '## Validation procedure'),
    'Run `node bin/app.js ping` and expect `pong` on stdout.\nA second probe line.',
  );
});

test('sectionAfter returns null for an absent heading', () => {
  assert.equal(sectionAfter(DESIGN, '## Rollback drill'), null);
});

test('sectionAfter on the last section runs to end of text', () => {
  assert.equal(sectionAfter(DESIGN, '## Release runbook'), 'Tag the release.');
});
