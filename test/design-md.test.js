// The dogfood: the artifact spine parses, validates, round-trips, and resolves the very
// document that specifies it. This is the executable form of the feature's acceptance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../src/parse.js';
import { render } from '../src/render.js';
import { validate } from '../src/schema.js';
import { resolveIn } from '../src/resolve.js';

const TEXT = readFileSync('docs/design/design.md', 'utf8');

test('the real design.md parses to the full feature graph', () => {
  const m = parse(TEXT);
  assert.equal(m.designVersion, 1);
  assert.equal(m.features.length, 20);
  assert.ok(m.contracts.length >= 6);
});

test('the real design.md validates with zero errors', () => {
  const v = validate(parse(TEXT));
  assert.deepEqual(v.errors, []);
  assert.equal(v.ok, true);
});

test('every referenced interface has a contract body (no dangling interfaces)', () => {
  const v = validate(parse(TEXT));
  assert.ok(!v.warnings.some((x) => x.code === 'dangling-interface'));
});

test('port-adapter remains defined-but-unreferenced (informational warning)', () => {
  const v = validate(parse(TEXT));
  assert.ok(v.warnings.some((x) => x.code === 'unreferenced-contract' && x.where === 'port-adapter'));
});

test('every depends_on edge resolves and the graph is acyclic', () => {
  const m = parse(TEXT);
  const ids = new Set(m.features.map((f) => f.id));
  for (const f of m.features) for (const d of f.depends_on) assert.ok(ids.has(d), `${f.id} → ${d}`);
  assert.ok(!validate(m).errors.some((e) => e.code === 'dependency-cycle'));
});

test('the real design.md round-trips byte-for-byte through parse/render', () => {
  assert.equal(render(TEXT, parse(TEXT)), TEXT);
});

test('artifact-spine resolves to its node + contracts in-model', () => {
  const { node, contracts } = resolveIn(parse(TEXT), 'artifact-spine');
  assert.ok(node.title.length > 0);
  assert.deepEqual(contracts.map((c) => c.id).sort(), ['feature-node', 'injection-resolver']);
});
