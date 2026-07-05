import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse } from '../src/parse.js';
import { STATUS, validate } from '../src/schema.js';

// Build a model from a feature-graph body.
function model(featuresYaml) {
  return parse(`## Feature graph\n\n\`\`\`yaml\n${featuresYaml}\n\`\`\`\n`);
}
const codes = (issues) => issues.map((i) => i.code);

test('STATUS holds the three durable lifecycle states', () => {
  assert.deepEqual(STATUS, ['designed', 'validated', 'shipped']);
});

test('a clean model validates ok', () => {
  const v = validate(model('design_version: 1\nfeatures:\n  - id: a\n    title: A\n    status: designed\n    depends_on: []\n    acceptance: x'));
  assert.equal(v.ok, true);
  assert.deepEqual(v.errors, []);
});

test('bad status, duplicate id, and missing acceptance are errors', () => {
  const v = validate(model('design_version: 1\nfeatures:\n  - id: a\n    title: A\n    status: building\n    acceptance: x\n  - id: a\n    title: A2\n    status: designed'));
  assert.ok(codes(v.errors).includes('bad-status')); // in-flight states are git-derived, never stored
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

test('a non-integer top-level design_version is an error', () => {
  const v = validate(model('design_version: nope\nfeatures:\n  - id: a\n    title: A\n    status: designed\n    acceptance: x'));
  assert.ok(codes(v.errors).includes('bad-doc-design-version'));
});

test('a doc with no feature-graph block is a missing-feature-graph error', () => {
  const v = validate(parse('# just narrative\n'));
  assert.ok(codes(v.errors).includes('missing-feature-graph'));
  assert.equal(v.ok, false);
});

test('a feature id outside the lowercase-slug charset is a malformed-id error', () => {
  // An id carrying shell metacharacters — the shape a hostile graph would use to reach
  // a git ref or file path downstream. It must be rejected as a contract violation.
  const evil = validate(model('design_version: 1\nfeatures:\n  - id: "evil; touch PWNED #"\n    title: E\n    status: designed\n    acceptance: x'));
  assert.ok(codes(evil.errors).includes('malformed-id'));
  assert.equal(evil.ok, false);

  // The real slug forms — lowercase, digits, internal hyphens — stay clean.
  const ok = validate(model('design_version: 1\nfeatures:\n  - id: inner-loop-workflow2\n    title: T\n    status: designed\n    acceptance: x'));
  assert.equal(codes(ok.errors).includes('malformed-id'), false);
});
