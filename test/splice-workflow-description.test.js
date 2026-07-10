// The run-presentation splice's pure core (src/splice-workflow-description.js):
// scope-derived description shaping, the meta-line splice, and the embedded-context
// splice — all testable without a repo or a real workflow script.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeRun, spliceEmbeddedContext, spliceRunDescription } from '../plugin/src/splice-workflow-description.js';

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

// ── spliceEmbeddedContext ──
const WITH_EMBEDDED_TARGET = [
  "export const meta = { name: 'execution-pipeline', description: 'static' };",
  'const EMBEDDED_CONTEXT = null; // spliced to a literal by prepare-execution-context --script-out',
  'const executionContext = EMBEDDED_CONTEXT ?? args;',
  '',
].join('\n');

function evalEmbedded(scriptText) {
  const match = scriptText.match(/^const EMBEDDED_CONTEXT = .+;$/m);
  assert.ok(match, 'expected a spliced EMBEDDED_CONTEXT declaration');
  return new Function(`${match[0]}\nreturn EMBEDDED_CONTEXT;`)();
}

test('spliceEmbeddedContext replaces null with a JSON literal of the execution context, leaving the rest of the script untouched', () => {
  const ctx = { scope: ['widget'], target: 'main', features: { widget: { designDoc: 'plain' } } };
  const spliced = spliceEmbeddedContext(WITH_EMBEDDED_TARGET, ctx);
  assert.deepEqual(evalEmbedded(spliced), ctx);
  assert.ok(spliced.includes('const executionContext = EMBEDDED_CONTEXT ?? args;'));
  assert.ok(!spliced.includes('const EMBEDDED_CONTEXT = null'));
});

test('spliceEmbeddedContext is lossless for nested escaped quotes in designDoc', () => {
  // The bug class: design-doc prose carrying nested \" (e.g. data-audio=\"on\").
  const designDoc = String.raw`Accepts data-audio=\"on\" for audio.`;
  const ctx = { scope: ['live-session'], features: { 'live-session': { designDoc } } };
  const spliced = spliceEmbeddedContext(WITH_EMBEDDED_TARGET, ctx);
  assert.deepEqual(evalEmbedded(spliced).features['live-session'].designDoc, designDoc);
  assert.equal(spliced.match(/\n/g).length, WITH_EMBEDDED_TARGET.match(/\n/g).length);
});

test('spliceEmbeddedContext refuses — throws, nothing to write — when the EMBEDDED_CONTEXT target line is missing', () => {
  const noTarget = "export const meta = { name: 'x', description: 'y' };\nconst rest = 1;\n";
  assert.throws(() => spliceEmbeddedContext(noTarget, {}), /EMBEDDED_CONTEXT/);

  const alreadySpliced = "const EMBEDDED_CONTEXT = {\"a\":1};\n";
  assert.throws(() => spliceEmbeddedContext(alreadySpliced, {}), /EMBEDDED_CONTEXT/);
});
