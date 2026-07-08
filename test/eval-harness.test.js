// Pure-logic coverage for the eval harness: cell planning/resume, integrity
// detection primitives, validate scoring, and the grok cost fallback. The
// process-spawning paths (fixture materialization, CLI adapters) are exercised by
// eval/selfcheck.js instead — they need a real git repo and real CLIs.
import assert from 'node:assert/strict';
import { appendFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { adapterOf, buildCells, loadDoneKeys, rowKey } from '../eval/lib/cells.js';
import { excursions, scanCanary, suppressionHits } from '../eval/lib/detect.js';
import { estimateGrokUsage, grokCostUsd } from '../eval/lib/pricing.js';
import { scoreFindings, verifyValidate } from '../eval/verify.js';

const unit = (id, leg) => ({ id, dir: `/x/${id}`, leg, manifest: { id, kind: leg === 'build' ? 'build' : 'validate' } });
const MATRIX = { legs: { build: { models: ['grok-4.5', 'sonnet'], reps: 2 }, validate: { models: ['opus'], reps: 1 } } };

test('buildCells expands units × models × reps per leg and honors filter/leg/reps overrides', () => {
  const units = [unit('u-build', 'build'), unit('u-val', 'validate')];
  const all = buildCells({ units, matrix: MATRIX, opts: {} });
  assert.equal(all.length, 5);
  assert.equal(buildCells({ units, matrix: MATRIX, opts: { leg: 'validate' } }).length, 1);
  assert.equal(buildCells({ units, matrix: MATRIX, opts: { filter: 'u-build', reps: 1 } }).length, 2);
  assert.equal(buildCells({ units, matrix: MATRIX, opts: { models: ['opus'], leg: 'build' } }).length, 2);
});

test('loadDoneKeys + buildCells resume: a completed (unit, model, rep) row is skipped, others remain', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-rows-'));
  const rowsPath = path.join(dir, 'rows.jsonl');
  await appendFile(rowsPath, `${JSON.stringify({ unit_id: 'u-build', model: 'sonnet', rep: 2 })}\n`);
  const doneKeys = await loadDoneKeys(rowsPath);
  const cells = buildCells({ units: [unit('u-build', 'build')], matrix: MATRIX, opts: { doneKeys } });
  assert.equal(cells.length, 3);
  assert.ok(cells.every((c) => rowKey(c) !== 'u-build::sonnet::r2'));
  await rm(dir, { recursive: true, force: true });
});

test('adapterOf routes grok-prefixed models to the grok CLI and everything else to claude', () => {
  assert.equal(adapterOf('grok-4.5'), 'grok');
  assert.equal(adapterOf('sonnet'), 'claude');
  assert.equal(adapterOf('claude-opus-4-8'), 'claude');
});

test('excursions honors exact-path leases and trailing-slash subtree leases', () => {
  const footprint = ['src/plan.js', 'test/'];
  assert.deepEqual(excursions(['src/plan.js', 'test/plan.test.js'], footprint), []);
  assert.deepEqual(excursions(['src/other.js', 'README.md'], footprint), ['src/other.js', 'README.md']);
});

test('suppressionHits flags eslint-disable in diff text and stays quiet on clean diffs', () => {
  assert.equal(suppressionHits('+ // eslint-disable-next-line complexity\n+ code').length, 1);
  assert.equal(suppressionHits('+ honest code\n- old code').length, 0);
});

test('scanCanary matches case-insensitively and returns only the phrases present', () => {
  const hits = scanCanary('The Task-Position Prefix landed', ['task-position prefix', 'absent-phrase']);
  assert.deepEqual(hits, ['task-position prefix']);
});

test('scoreFindings recall: each group matches on any alternative token, case-insensitive', () => {
  const groups = [['prefix', 'ordinal'], ['drive-path'], ['never-mentioned']];
  const score = scoreFindings(groups, 'The ORDINAL is off by one; the drive-path label regressed');
  assert.equal(score.matched, 2);
  assert.equal(score.recall, 0.667);
});

test('verifyValidate: false_pass only when ground-truth fail is judged validated; blocked is not a false-pass; clean judged non-validated is a false-fail', () => {
  const defected = { verdict: 'fail', expected_findings: [['gamed']] };
  assert.equal(verifyValidate({ manifest: defected, selfReport: { result: 'validated' } }).false_pass, true);
  assert.equal(verifyValidate({ manifest: defected, selfReport: { result: 'blocked' } }).false_pass, false);
  const clean = { verdict: 'validated', expected_findings: [] };
  const r = verifyValidate({ manifest: clean, selfReport: { result: 'fail', findings: ['noise'] } });
  assert.equal(r.false_fail, true);
  assert.equal(r.findings, null);
});

test('grok pricing fallback: token estimate from chars at $2/$6 per Mtok', () => {
  const usage = estimateGrokUsage({ promptChars: 4000, transcriptChars: 8000, outputChars: 4000 });
  assert.equal(usage.input_tokens, 2000);
  assert.equal(usage.output_tokens, 1000);
  assert.equal(grokCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }), 8);
});
