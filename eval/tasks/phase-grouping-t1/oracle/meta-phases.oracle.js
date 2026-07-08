// Oracle for phase-grouping-t1, criterion 2 — pins the meta declaration's shape the same
// way the criterion demands: extract the single-physical-line `export const meta = { … };`
// straight from workflows/inner-loop.js's source and evaluate only that line (never running
// the rest of the script), asserting `phases` deep-equals the three title-only SDLC entries
// in order. The regex has no `s` flag, so a meta spread across multiple lines leaves no
// match and fails here rather than passing silently. At the parent state meta carries no
// `phases` field, so this is red.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('criterion 2: the meta declaration pins phases to the three title-only SDLC entries, in order, on one physical line', () => {
  const source = readFileSync('workflows/inner-loop.js', 'utf8');
  const match = source.match(/^export const meta\b.*;$/m);
  assert.ok(match, 'expected `export const meta = { ... };` on a single physical line ending in `;`');

  const meta = new Function(`${match[0].replace(/^export /, '')}\nreturn meta;`)();
  assert.deepEqual(meta.phases, [{ title: 'Plan' }, { title: 'Build' }, { title: 'Validate' }]);
});
