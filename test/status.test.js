import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse } from '../src/parse.js';
import { render } from '../src/render.js';
import { setStatus } from '../src/status.js';

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
    status: planned
    depends_on: [widget]
    acceptance: renders a gadget
\`\`\`
`;

test('setStatus flips exactly that feature in the model and the round-tripped text', () => {
  const m = parse(TEXT);
  setStatus(m, 'widget', 'building');
  assert.equal(m.features[0].status, 'building');
  assert.equal(m.features[1].status, 'planned'); // sibling untouched

  const text = render(TEXT, m);
  assert.equal(text, TEXT.replace('status: designed', 'status: building'));
  assert.equal(render(text, parse(text)), text); // still round-trips
});

test('setStatus refuses an unknown feature id or an out-of-enum status, leaving the model untouched', () => {
  const m = parse(TEXT);
  assert.throws(() => setStatus(m, 'ghost', 'building'), /unknown feature id: ghost/);
  assert.throws(() => setStatus(m, 'widget', 'launched'), /status must be one of/);
  assert.equal(m.features[0].status, 'designed');
  assert.equal(m.features[1].status, 'planned');
  assert.equal(render(TEXT, m), TEXT);
});
