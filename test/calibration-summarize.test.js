// calibration-summarize — the pure src/ index renderer over the record corpus plus the
// thin CLI verb. The renderer is exercised directly for determinism and the digest
// working set; the verb is spawned as a real subprocess against throwaway fixture dirs
// to prove it reads runs/*.md, writes index.md in the cwd repo only, and exits 1 naming
// a malformed record without writing anything.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { renderIndex } from '../plugin/src/calibration-summarize.js';

const BIN = path.resolve('plugin/bin/the-loop.js');
const spine = (args, opts = {}) => execFileSync('node', [BIN, ...args], { encoding: 'utf8', ...opts });

// A standard-path run: one validated feature (5 agents, 20 min, 2 planned files vs 3
// touched), 70k build / 30k overhead tokens, serial attribution.
const RECORD_A = [
  '# Run 2026-07-01', '',
  '- f-a · standard · validated', '',
  '```yaml',
  'run:',
  '  prepared_at: 2026-07-01T10:00:00Z',
  '  target: main',
  '  scope: [f-a]',
  '  tokens:',
  '    spent: 100000',
  '    by_role: { plan: 20000, build: 70000, validate: 10000 }',
  '    attribution: serial',
  '  halted: ~',
  'features:',
  '  - id: f-a',
  '    workflow_path: standard',
  '    outcome: validated',
  '    reason: ~',
  '    reslice: ~',
  '    agents: { plan: 1, build: 3, drive: 0, validate: 1 }',
  '    tasks:',
  '      - { id: t1, size: s, judgment_level: standard, footprint: [a.js, a.test.js] }',
  '    actual:',
  '      files_touched: 3',
  '      insertions: 50',
  '      deletions: 5',
  '      commits: 2',
  '      duration_minutes: 20',
  '```', '',
].join('\n');

// A small-path run: one blocked feature (2 agents, no actual), re-sliced, overlapped
// attribution, 5k build / 5k overhead tokens.
const RECORD_B = [
  '# Run 2026-07-02', '',
  '- f-b · small · blocked', '',
  '```yaml',
  'run:',
  '  prepared_at: 2026-07-02T09:00:00Z',
  '  target: main',
  '  scope: [f-b]',
  '  tokens:',
  '    spent: 10000',
  '    by_role: { plan: 5000, build: 5000 }',
  '    attribution: overlapped',
  '  halted: ~',
  'features:',
  '  - id: f-b',
  '    workflow_path: small',
  '    outcome: blocked',
  '    reason: dep conflict on parser',
  '    reslice: t1 split into two',
  '    agents: { plan: 1, build: 1 }',
  '    tasks:',
  '      - { id: t1, size: s, judgment_level: standard, footprint: [b.js] }',
  '    actual: ~',
  '```', '',
].join('\n');

const corpus = () => [
  { file: 'docs/calibration/runs/2026-07-01-1.md', text: RECORD_A },
  { file: 'docs/calibration/runs/2026-07-02-1.md', text: RECORD_B },
];

// The digest section: from `## Digest` up to (not including) `## Runs`.
function digestSection(index) {
  const lines = index.split('\n');
  const start = lines.indexOf('## Digest');
  const end = lines.indexOf('## Runs');
  return lines.slice(start, end);
}

test('renderIndex is byte-identical regardless of input order and keeps the digest ≤ 40 lines with one Runs line per record', () => {
  const forward = renderIndex(corpus());
  const reversed = renderIndex(corpus().toReversed());
  assert.equal(forward, reversed, 'same corpus in any order must be byte-identical');
  assert.ok(forward.includes('## Digest'));
  assert.ok(forward.includes('## Runs'));
  assert.ok(digestSection(forward).length <= 40, 'the digest section must stay within 40 lines');
  const runLines = forward.split('\n').slice(forward.split('\n').indexOf('## Runs')).filter((l) => l.startsWith('- '));
  assert.equal(runLines.length, 2, 'one Runs line per record');
  // Records ordered by prepared_at ascending, verbatim record scalars only.
  assert.ok(runLines[0].startsWith('- 2026-07-01T10:00:00Z · target main · [f-a] · 1 validated · 100000 tokens · serial'));
  assert.ok(runLines[1].startsWith('- 2026-07-02T09:00:00Z · target main · [f-b] · 1 blocked · 10000 tokens · overlapped'));
});

test('the digest working set is fully CLI-derived: workflow paths, re-slice rate, footprint accuracy, block reasons, and the token split with attribution caveat', () => {
  const index = renderIndex(corpus());
  const digest = digestSection(index).join('\n');
  // Per-workflow-path count / median agents / median duration.
  assert.ok(digest.includes('| small | 1 | 2 | — |'), 'small path: 1 run, 2 agents, no duration');
  assert.ok(digest.includes('| standard | 1 | 5 | 20 |'), 'standard path: 1 run, 5 agents, 20 min');
  // Re-slice count and rate (1 of 2).
  assert.ok(digest.includes('1 of 2 feature(s) re-sliced (50%).'));
  // Planned-vs-actual footprint accuracy by size class (only the validated feature).
  assert.ok(digest.includes('| s | 1 | 2 | 3 |'), 'size s: 1 feature, 2 planned files, 3 touched');
  // Top recurring block reasons, verbatim and count-grouped.
  assert.ok(digest.includes('- 1× dep conflict on parser'));
  // Overhead-vs-build split: lifetime 35k/110k ≈ 32%, last-10 median of {0.3, 0.5} = 40%.
  assert.ok(digest.includes('Lifetime: 32% overhead / 68% build.'));
  assert.ok(digest.includes('Last-10 median: 40% overhead / 60% build.'));
  assert.ok(digest.includes('Attribution: 1 of 2 run(s) overlapped'), 'the attribution caveat is surfaced');
});

test('the-loop calibration-summarize reads runs/*.md and writes index.md within the cwd repo', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'calib-'));
  try {
    mkdirSync(path.join(root, 'docs/calibration/runs'), { recursive: true });
    writeFileSync(path.join(root, 'docs/calibration/runs/2026-07-01-1.md'), RECORD_A);
    writeFileSync(path.join(root, 'docs/calibration/runs/2026-07-02-1.md'), RECORD_B);
    const stdout = spine(['calibration-summarize'], { cwd: root });
    assert.match(stdout, /"runs": 2/);
    const index = readFileSync(path.join(root, 'docs/calibration/index.md'), 'utf8');
    assert.equal(index, renderIndex(corpus()), 'the CLI writes exactly what the renderer produces');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a record whose yaml block fails to parse exits 1 naming the offending file and writes no index', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'calib-bad-'));
  try {
    mkdirSync(path.join(root, 'docs/calibration/runs'), { recursive: true });
    writeFileSync(path.join(root, 'docs/calibration/runs/2026-07-01-1.md'), RECORD_A);
    writeFileSync(path.join(root, 'docs/calibration/runs/2026-07-02-1.md'),
      ['# broken', '', '```yaml', 'run: [this: is, : not valid', '```', ''].join('\n'));
    let err;
    try { spine(['calibration-summarize'], { cwd: root }); } catch (error) { err = error; }
    assert.ok(err, 'a malformed record must fail the command');
    assert.equal(err.status, 1);
    assert.match(err.stderr, /2026-07-02-1\.md/, 'the error names the offending file');
    assert.ok(!existsSync(path.join(root, 'docs/calibration/index.md')), 'no index is written on failure');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
