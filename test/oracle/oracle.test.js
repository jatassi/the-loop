// The oracle entry: discovers every case module under test/oracle/cases/, runs each
// case through the subprocess driver against the Rust binary (build first:
// `cargo build --release`), and prints one pass/fail/pending summary line. Corpus
// tasks add case files here with no edit to this entry.
//
//   npm test          runs this entry (must be all-green, zero pending)
//   ORACLE_BIN=…      select an explicit binary by hand
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
  // Since json-cutover the corpus must be 100% green: zero pending is the standing
  // bar (the allowlist emptied before the flip and only a regression refills it).
  assert.equal(counts.fail, 0, 'oracle must have zero failures');
  assert.equal(counts.pending, 0, 'oracle must have zero pending cases');
});
