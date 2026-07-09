// The meta declaration's own source shape (ADR-0029): every workflow script's `meta`
// sits on a single physical line so the eslint processor (eslint.config.js) can rewrite
// it in place without a multi-line-aware parse. This test pins that shape independently
// of the lint processor — it extracts the `export const meta = { ... };` declaration
// straight from workflows/execution-pipeline.js's source text and evaluates only that line,
// never running the rest of the script, then asserts the declared `phases` in order and shape.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const SCRIPT = 'plugin/workflows/execution-pipeline.js';

// ── criteria 1 & 2: `phases` deep-equals the four title-only entries in order — the
// three SDLC phases plus the calibration `Record` phase (calibration-capture) — extracted
// from the meta declaration's single physical line. The regex has no `s` flag, so it can
// only match a declaration that ends in `;` before any newline, and a future meta spread
// across multiple lines leaves no match, failing the assert below rather than passing
// silently ──
test("the meta declaration's single line pins phases to the four title-only entries in order", () => {
  const source = readFileSync(SCRIPT, 'utf8');
  const match = source.match(/^export const meta\b.*;$/m);
  assert.ok(match, 'expected `export const meta = { ... };` on a single physical line ending in `;`');

  const meta = new Function(`${match[0].replace(/^export /, '')}\nreturn meta;`)();

  assert.deepEqual(meta.phases, [{ title: 'Plan' }, { title: 'Build' }, { title: 'Validate' }, { title: 'Record' }]);
});
