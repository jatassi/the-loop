// Contamination-free fixture materialization. `git archive` emits exactly the
// tracked tree at a ref — no .git, so no future history for a model to mine — and
// a fresh `git init` + seed commit(s) is the only ancestry a fixture ever has.
// node_modules comes from an npm-ci template cached per package-lock hash.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { run } from './exec.js';

const sh = (script, opts = {}) => run('sh', ['-c', script], { ...opts, timeoutMs: opts.timeoutMs ?? 300_000 });
const git = (dir, args) => run('git', ['-C', dir, ...args], { timeoutMs: 120_000 });

async function must(promise, label) {
  const r = await promise;
  if (r.code !== 0) { throw new Error(`${label} failed (exit ${r.code}): ${r.stderr.slice(0, 2000)}`); }
  return r;
}

export async function extractTree({ repoRoot, sha, dir }) {
  await mkdir(dir, { recursive: true });
  await must(sh(`git -C "${repoRoot}" archive ${sha} | tar -x -C "${dir}"`), `extract ${sha}`);
}

// Replace every tracked file with the tree at `sha`, leaving untracked content
// (node_modules) alone — used to stack a landing tree on top of a target commit.
export async function overlayTree({ repoRoot, sha, dir }) {
  await must(sh(`git -C "${dir}" ls-files -z | xargs -0 rm -f`), 'clear tracked files');
  await must(sh(`git -C "${repoRoot}" archive ${sha} | tar -x -C "${dir}"`), `overlay ${sha}`);
}

export async function ensureNodeModules({ repoRoot, cacheDir, sha }) {
  const lock = await must(git(repoRoot, ['show', `${sha}:package-lock.json`]), 'read package-lock');
  const pkg = await must(git(repoRoot, ['show', `${sha}:package.json`]), 'read package.json');
  const hash = createHash('sha256').update(lock.stdout).digest('hex').slice(0, 12);
  const template = path.join(cacheDir, `nm-${hash}`);
  try {
    await readFile(path.join(template, '.ready'), 'utf8');
    return template;
  } catch {
    // cache miss — build the template below
  }
  const staging = path.join(tmpdir(), `the-loop-nm-${hash}-${process.pid}`);
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  await writeFile(path.join(staging, 'package.json'), pkg.stdout);
  await writeFile(path.join(staging, 'package-lock.json'), lock.stdout);
  await must(run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: staging, timeoutMs: 600_000 }), 'npm ci');
  await mkdir(cacheDir, { recursive: true });
  await rm(template, { recursive: true, force: true });
  await rename(staging, template);
  await writeFile(path.join(template, '.ready'), hash);
  return template;
}

export async function linkNodeModules({ template, dir }) {
  const src = path.join(template, 'node_modules');
  const dest = path.join(dir, 'node_modules');
  const clone = await run('cp', ['-Rc', src, dest], { timeoutMs: 300_000 });
  if (clone.code !== 0) { await must(run('cp', ['-R', src, dest], { timeoutMs: 300_000 }), 'copy node_modules'); }
}

export async function commitAll({ dir, message }) {
  await must(git(dir, ['add', '-A']), 'git add');
  const identity = ['-c', 'user.name=eval-harness', '-c', 'user.email=eval@the-loop.local'];
  await must(run('git', ['-C', dir, ...identity, 'commit', '-q', '--no-verify', '-m', message], { timeoutMs: 120_000 }), 'git commit');
  const head = await must(git(dir, ['rev-parse', 'HEAD']), 'git rev-parse');
  return head.stdout.trim();
}

export async function initRepo(dir) {
  await must(git(dir, ['init', '-q', '-b', 'main']), 'git init');
}

export async function runPlant({ dir, script }) {
  await must(run('bash', [script], { cwd: dir, timeoutMs: 120_000 }), `plant ${path.basename(script)}`);
}
