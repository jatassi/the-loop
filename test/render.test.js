import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parse } from '../src/parse.js';
import { render } from '../src/render.js';

const DESIGN = 'docs/design/design.md';
const text = () => readFileSync(DESIGN, 'utf8');
const strip = ({ _blocks, ...rest }) => rest;

test('render(text, parse(text)) is byte-identical for the real design.md', () => {
  const t = text();
  assert.equal(render(t, parse(t)), t);
});

test('render is idempotent', () => {
  const t = text();
  const once = render(t, parse(t));
  assert.equal(render(once, parse(once)), once);
});

test('parse → render → parse round-trips semantically', () => {
  const t = text();
  const a = parse(t);
  const b = parse(render(t, a));
  assert.deepEqual(strip(b), strip(a));
});

test('render leaves narrative outside the structured blocks untouched', () => {
  const t = text();
  const r = render(t, parse(t));
  const head = t.slice(0, t.indexOf('## Feature graph'));
  assert.ok(r.startsWith(head));
});

test('render reflects a structured-block edit but nothing else', () => {
  // Mutate the feature-graph Document directly (the documented write seam) and confirm
  // the change lands while every byte outside the block is preserved.
  const t = text();
  const m = parse(t);
  m._blocks.featureGraph.doc.setIn(['features', 0, 'status'], 'building');
  const r = render(t, m);
  assert.notEqual(r, t);
  assert.equal(parse(r).features[0].status, 'building');
  const tail = t.slice(t.indexOf('## Key interface contracts'));
  assert.ok(r.includes(tail)); // the later narrative + contracts block are intact
});
