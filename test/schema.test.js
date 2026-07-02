import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse } from '../src/parse.js';
import { STATUS,validate } from '../src/schema.js';

// Build a model from a feature-graph body + optional contracts body.
function model(featuresYaml, contractsYaml = 'contracts: []') {
  return parse(
    `## Feature graph\n\n\`\`\`yaml\n${featuresYaml}\n\`\`\`\n\n` +
    `## Key interface contracts\n\n\`\`\`yaml\n${contractsYaml}\n\`\`\`\n`,
  );
}
const codes = (issues) => issues.map((i) => i.code);

test('STATUS holds the seven lifecycle states', () => {
  assert.deepEqual(STATUS, ['designed', 'planned', 'building', 'validated', 'shipped', 'parked', 'drifted']);
});

test('a clean model validates ok', () => {
  const v = validate(model('design_version: 1\nfeatures:\n  - id: a\n    title: A\n    status: designed\n    depends_on: []\n    interfaces: []\n    acceptance: x'));
  assert.equal(v.ok, true);
  assert.deepEqual(v.errors, []);
});

test('bad status, duplicate id, and missing acceptance are errors', () => {
  const v = validate(model('design_version: 1\nfeatures:\n  - id: a\n    title: A\n    status: nope\n    acceptance: x\n  - id: a\n    title: A2\n    status: designed'));
  assert.ok(codes(v.errors).includes('bad-status'));
  assert.ok(codes(v.errors).includes('duplicate-id'));
  assert.ok(codes(v.errors).includes('missing-acceptance')); // the second 'a' has none
  assert.equal(v.ok, false);
});

test('self and dangling dependencies are errors', () => {
  const v = validate(model('design_version: 1\nfeatures:\n  - id: a\n    title: A\n    status: designed\n    acceptance: x\n    depends_on: [a, ghost]'));
  assert.ok(codes(v.errors).includes('self-dependency'));
  assert.ok(codes(v.errors).includes('dangling-dependency'));
});

test('a dependency cycle is an error', () => {
  const v = validate(model('design_version: 1\nfeatures:\n  - id: a\n    title: A\n    status: designed\n    acceptance: x\n    depends_on: [b]\n  - id: b\n    title: B\n    status: designed\n    acceptance: x\n    depends_on: [a]'));
  assert.ok(codes(v.errors).includes('dependency-cycle'));
});

test('dangling interface + unreferenced contract are warnings, not errors', () => {
  const v = validate(model(
    'design_version: 1\nfeatures:\n  - id: a\n    title: A\n    status: designed\n    acceptance: x\n    interfaces: [ghost]',
    'contracts:\n  - id: unused\n    body: |\n      { }',
  ));
  assert.equal(v.ok, true); // warnings don't block
  assert.ok(codes(v.warnings).includes('dangling-interface'));
  assert.ok(codes(v.warnings).includes('unreferenced-contract'));
});

test('a non-integer top-level design_version is an error', () => {
  const v = validate(model('design_version: nope\nfeatures:\n  - id: a\n    title: A\n    status: designed\n    acceptance: x'));
  assert.ok(codes(v.errors).includes('bad-doc-design-version'));
});
