import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appendNote } from '../src/note.js';
import { parse } from '../src/parse.js';
import { render } from '../src/render.js';

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

test('appendNote creates the notes key when absent, appends on a second call, and round-trips the text', () => {
  const m = parse(TEXT);
  appendNote(m, 'widget', 'first note');
  assert.deepEqual(m.features[0].notes, ['first note']);
  assert.equal(m.features[1].notes, undefined); // sibling untouched

  const text = render(TEXT, m);
  assert.equal(render(text, parse(text)), text); // round-trips

  appendNote(m, 'widget', 'second note');
  assert.deepEqual(m.features[0].notes, ['first note', 'second note']);
  const text2 = render(TEXT, m);
  assert.equal(render(text2, parse(text2)), text2); // still round-trips
});

test('appendNote refuses an unknown feature id or empty text, leaving the model untouched', () => {
  const m = parse(TEXT);
  assert.throws(() => appendNote(m, 'ghost', 'a note'), /unknown feature id: ghost/);
  assert.throws(() => appendNote(m, 'widget', ''), /note text must be a non-empty string/);
  assert.equal(m.features[0].notes, undefined);
  assert.equal(render(TEXT, m), TEXT);
});
