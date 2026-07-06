import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse } from '../src/parse-feature-graph.js';
import { setStatus } from '../src/set-feature-status.js';
import { render } from '../src/write-feature-graph.js';

const TEXT = `## Feature graph

\`\`\`yaml
design_version: 2
features:
  - id: widget
    title: Widget
    status: designed
    depends_on: []
    acceptance: renders a widget
  - id: gadget
    title: Gadget
    status: designed
    depends_on: [widget]
    acceptance: renders a gadget
\`\`\`
`;

test('setStatus flips exactly that feature in the model and the round-tripped text', () => {
  const m = parse(TEXT);
  setStatus(m, 'widget', 'validated');
  assert.equal(m.features[0].status, 'validated');
  assert.equal(m.features[1].status, 'designed'); // sibling untouched

  const text = render(TEXT, m);
  assert.equal(text, TEXT.replace('status: designed', 'status: validated'));
  assert.equal(render(text, parse(text)), text); // still round-trips
});

test('setStatus refuses an unknown feature id or an out-of-enum status, leaving the model untouched', () => {
  const m = parse(TEXT);
  assert.throws(() => setStatus(m, 'ghost', 'validated'), /unknown feature id: ghost/);
  assert.throws(() => setStatus(m, 'widget', 'building'), /status must be one of/); // in-flight states live in git, not the graph
  assert.equal(m.features[0].status, 'designed');
  assert.equal(m.features[1].status, 'designed');
  assert.equal(render(TEXT, m), TEXT);
});
