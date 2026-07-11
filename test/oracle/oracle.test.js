// The parity-oracle entry: discovers every case module under test/oracle/cases/,
// runs each case through the subprocess driver against the configured target, and
// prints one pass/fail/pending summary line. Corpus tasks add case files here with
// no edit to this entry.
//
//   npm test                            runs this entry against the JS CLI (must be all-green)
//   npm run oracle:rust                 runs it against the Rust binary (pending allowed)
//   ORACLE_BIN=… ORACLE_TARGET=rust     select an explicit binary / target by hand
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatSummary, loadCases, loadPending, resolveTarget, runCase, summarize } from './driver.js';

test('parity oracle corpus', async (t) => {
  const { target, bin } = resolveTarget(process.env);
  const pendingCommands = loadPending();
  const cases = await loadCases();
  const verdicts = [];

  for (const caseSpec of cases) {
    await t.test(`${caseSpec.command} — ${caseSpec.scenario}`, () => {
      const verdict = runCase(caseSpec, { bin, target, pendingCommands });
      verdicts.push(verdict);
      if (verdict.status === 'fail') {
        assert.fail(verdict.reason ?? 'case failed');
      }
    });
  }

  const counts = summarize(verdicts);
  process.stdout.write(`${formatSummary(counts, target)}\n`);
  // The corpus must be 100% green against the JS CLI (no fails, no pendings).
  if (target === 'js') {
    assert.equal(counts.fail, 0, 'JS-target oracle must have zero failures');
    assert.equal(counts.pending, 0, 'the pending allowlist never applies to the JS target');
  }
});
