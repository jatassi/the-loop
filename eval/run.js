// Eval runner — the Grok 4.5 / Sonnet 5 / Opus 4.8 bakeoff (see eval/README.md).
//   node eval/run.js [--leg build|validate|all] [--filter <substr>] [--reps N]
//                    [--models m1,m2] [--results <dir>] [--dry]
// Resumable: pass --results <existing dir> and completed (unit, model, rep) cells
// are skipped. Concurrency respects per-adapter caps (grok's playbook caps it at 2).
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { adapterOf, buildCells, loadDoneKeys, loadUnits, rowKey } from './lib/cells.js';
import { run } from './lib/exec.js';
import { runCell } from './lib/run-cell.js';

const evalRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(evalRoot, '..');

function parseArgs(argv) {
  const opts = { leg: 'all', dry: false };
  const setters = {
    '--leg': (v) => { opts.leg = v; },
    '--filter': (v) => { opts.filter = v; },
    '--reps': (v) => { opts.reps = Number(v); },
    '--models': (v) => { opts.models = v.split(','); },
    '--results': (v) => { opts.results = v; },
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry') { opts.dry = true; continue; }
    const setter = setters[argv[i]];
    if (setter) { setter(argv[++i]); }
  }
  return opts;
}

async function writeRunMeta(resultsDir, matrix) {
  const harness = await run('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { timeoutMs: 30_000 });
  const grok = await run('grok', ['--version'], { timeoutMs: 30_000 });
  const claude = await run('claude', ['--version'], { timeoutMs: 30_000 });
  const meta = {
    started_at: new Date().toISOString(),
    harness_sha: harness.stdout.trim(),
    grok_version: grok.stdout.trim(),
    claude_version: claude.stdout.trim(),
    billing_mode: process.env.ANTHROPIC_API_KEY ? 'api-key' : 'subscription',
    matrix,
  };
  await writeFile(path.join(resultsDir, 'run.json'), JSON.stringify(meta, null, 2));
}

async function launchEligible({ pending, counts, caps, launch }) {
  const i = pending.findIndex((cell) => {
    const adapter = adapterOf(cell.model);
    return counts[adapter] < caps[adapter] && counts.total < caps.total;
  });
  if (i === -1) { return false; }
  const [cell] = pending.splice(i, 1);
  launch(cell);
  return true;
}

async function runPool({ cells, caps, ctx }) {
  const pending = [...cells];
  const counts = { grok: 0, claude: 0, total: 0 };
  const inflight = new Set();
  const launch = (cell) => {
    const adapter = adapterOf(cell.model);
    counts[adapter] += 1;
    counts.total += 1;
    const p = (async () => {
      try {
        await executeCell(cell, ctx);
      } finally {
        counts[adapter] -= 1;
        counts.total -= 1;
        inflight.delete(p);
      }
    })();
    inflight.add(p);
  };
  while (pending.length > 0 || inflight.size > 0) {
    let isMore = pending.length > 0;
    while (isMore) { isMore = await launchEligible({ pending, counts, caps, launch }); }
    if (inflight.size > 0) { await Promise.race(inflight); }
  }
}

async function executeCell(cell, ctx) {
  const key = rowKey(cell);
  console.log(`▶ ${key}`);
  try {
    const row = await runCell(cell, ctx);
    const outcome = row.verify?.verdict ?? (row.validate_score?.verdict_match ? 'match' : 'mismatch');
    console.log(`✔ ${key} — ${outcome}${row.canary_leak.length > 0 ? ' ⚠ CANARY LEAK' : ''}`);
  } catch (error) {
    console.log(`✖ ${key} — harness error: ${error.message}`);
    await appendFile(path.join(ctx.resultsDir, 'errors.log'), `${new Date().toISOString()} ${key} ${error.stack}\n`);
  }
}

const opts = parseArgs(process.argv.slice(2));
const matrix = JSON.parse(await readFile(path.join(evalRoot, 'matrix.json'), 'utf8'));
const units = await loadUnits(evalRoot);
const resultsDir = opts.results ?? path.join(evalRoot, 'results', new Date().toISOString().replaceAll(':', '-').slice(0, 19));
const rowsPath = path.join(resultsDir, 'rows.jsonl');
await mkdir(path.join(resultsDir, 'work'), { recursive: true });
const doneKeys = await loadDoneKeys(rowsPath);
const cells = buildCells({ units, matrix, opts: { ...opts, doneKeys } });

console.log(`units: ${units.length} · cells to run: ${cells.length} (${doneKeys.size} already done) · results: ${resultsDir}`);
if (opts.dry) {
  for (const cell of cells) { console.log(`  ${rowKey(cell)}`); }
  process.exit(0);
}
await writeRunMeta(resultsDir, { ...matrix, opts });
const ctx = { evalRoot, repoRoot, resultsDir, rowsPath, matrix, cacheDir: path.join(evalRoot, 'fixtures-cache') };
await runPool({ cells, caps: matrix.concurrency, ctx });
console.log(`done — rows at ${rowsPath}`);
