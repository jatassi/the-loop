// The parse → render round-trip over a feature-graph.md-shaped hybrid doc: narrative prose
// around one machine-parseable yaml block, with comments and key order that must
// survive re-rendering byte-for-byte.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse } from '../plugin/src/parse-feature-graph.js';
import { render } from '../plugin/src/write-feature-graph.js';

const TEXT = `# Fixture — Feature graph

Narrative the renderer must never touch.

## Feature graph

\`\`\`yaml
design_version: 4
features:
  # a retained comment inside the block
  - id: widget
    title: Widget
    status: designed
    depends_on: []
    acceptance: [renders a widget, persists a widget]
  - id: gadget
    title: Gadget
    status: validated
    depends_on: [widget]
    acceptance: renders a gadget
\`\`\`

## Closing narrative

Trailing prose, also untouchable.
`;

const strip = ({ _blocks, ...rest }) => rest;

test('render(text, parse(text)) is byte-identical, comments and flow style included', () => {
  assert.equal(render(TEXT, parse(TEXT)), TEXT);
});

test('render is idempotent', () => {
  const once = render(TEXT, parse(TEXT));
  assert.equal(render(once, parse(once)), once);
});

test('parse → render → parse round-trips semantically', () => {
  const a = parse(TEXT);
  const b = parse(render(TEXT, a));
  assert.deepEqual(strip(b), strip(a));
});

test('render reflects a structured-block edit but nothing else', () => {
  // Mutate the feature-graph Document directly (the documented write seam) and confirm
  // the change lands while every byte outside the block is preserved.
  const m = parse(TEXT);
  m._blocks.featureGraph.doc.setIn(['features', 0, 'status'], 'validated');
  const r = render(TEXT, m);
  assert.notEqual(r, TEXT);
  assert.equal(parse(r).features[0].status, 'validated');
  const head = TEXT.slice(0, TEXT.indexOf('## Feature graph'));
  assert.ok(r.startsWith(head)); // leading narrative intact
  assert.ok(r.endsWith('## Closing narrative\n\nTrailing prose, also untouchable.\n'));
  assert.ok(r.includes('# a retained comment inside the block'));
});
