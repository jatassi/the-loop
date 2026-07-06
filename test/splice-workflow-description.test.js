// The run-presentation splice's pure core (src/splice-workflow-description.js):
// scope-derived description shaping and the meta-line splice, both testable without a
// repo or a real workflow script.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeRun, spliceRunDescription } from '../src/splice-workflow-description.js';

// ── describeRun ──
test('describeRun lists every in-scope id, in scope order, arrow-joined to the target', () => {
  assert.equal(describeRun(['alpha', 'beta'], 'main'), 'alpha, beta → main');
  assert.equal(describeRun(['solo'], 'release/1.0'), 'solo → release/1.0');
});

test('describeRun past 5 ids collapses to the first 5 plus a +<k> more count', () => {
  const scope = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  assert.equal(describeRun(scope, 'main'), 'a, b, c, d, e, +2 more → main');
});

// ── spliceRunDescription ──
const CANONICAL = "export const meta = { name: 'execution-pipeline', description: 'One autonomous pass over the scoped feature graph', whenToUse: 'x', phases: [{ title: 'Plan' }] };\nconst rest = 1;\n";

function evalMeta(scriptText) {
  const match = scriptText.match(/^export const meta\b.*;$/m);
  assert.ok(match, 'expected a spliced one-line meta declaration');
  return new Function(`${match[0].replace(/^export /, '')}\nreturn meta;`)();
}

test('spliceRunDescription replaces only the description value, JSON-stringified, leaving the rest of the meta line and the script untouched', () => {
  const spliced = spliceRunDescription(CANONICAL, 'alpha, beta → main');
  assert.equal(evalMeta(spliced).description, 'alpha, beta → main');
  assert.equal(evalMeta(spliced).name, 'execution-pipeline'); // sibling fields untouched
  assert.ok(spliced.endsWith("\nconst rest = 1;\n")); // everything after the meta line is untouched
  assert.equal(spliced.match(/^export const meta\b.*$/gm).length, 1); // meta still one physical line
});

test('spliceRunDescription is quote-safe: a description carrying quotes and backslashes round-trips exactly, and the meta line stays one physical line', () => {
  const description = String.raw`weird's target "branch" \with\ backslashes → main`;
  const spliced = spliceRunDescription(CANONICAL, description);
  assert.equal(evalMeta(spliced).description, description);
  assert.equal(spliced.match(/\n/g).length, (CANONICAL.match(/\n/g).length)); // no new physical lines introduced
});

test('spliceRunDescription refuses — throws, nothing to write — when the meta line lacks the expected description shape', () => {
  const multiLineMeta = "export const meta = {\n  name: 'x',\n  description: 'y',\n};\n";
  assert.throws(() => spliceRunDescription(multiLineMeta, 'z'), /description/);

  const doubleQuoted = 'export const meta = { name: \'x\', description: "y" };\n';
  assert.throws(() => spliceRunDescription(doubleQuoted, 'z'), /description/);

  const noDescription = "export const meta = { name: 'x' };\n";
  assert.throws(() => spliceRunDescription(noDescription, 'z'), /description/);
});
