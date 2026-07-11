// The fixture-repo probe's bringUp: the fixture must be a plausible target repository —
// the binary parses and validates its seeded feature-graph.json, `the-loop status --json`
// reads it as a configured project, and the empty variant reads as unconfigured.
// Subprocess-only: the binary on target/release is the one CLI (json-cutover).
import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The cargo workspace root owns target/: build with `cargo build --release` first.
const CLI = path.join(REPO_ROOT, 'target/release/the-loop');

const bringUp = (variant = '') => execSync(`node bin/create-sample-repo.js ${variant}`, { encoding: 'utf8' }).trim();
const statusJson = (cwd) => JSON.parse(execFileSync(CLI, ['status', '--json'], { cwd, encoding: 'utf8' }));

test('populated fixture: a committed repo on main whose feature-graph.json passes check and orients configured', () => {
  const root = bringUp();
  try {
    assert.ok(existsSync(path.join(root, '.git')));
    const check = execFileSync(CLI, ['check'], { cwd: root, encoding: 'utf8' });
    assert.match(check, /^OK +3 features/);

    const o = statusJson(root);
    assert.equal(o.mode, 'configured');
    assert.deepEqual(o.proposal, {
      kind: 'advance-eligible-set', features: ['greet-cli'],
      summary: '1 feature(s) are dependency-ready to advance',
    }); // greet-core validated, greet-cli designed behind it; greet-farewell (proposed) is unrelated backlog

    assert.ok(existsSync(path.join(root, 'docs/designs/greet-core/design.md')));
    assert.ok(existsSync(path.join(root, 'docs/designs/greet-cli/design.md')));
    assert.equal(execSync('git branch --show-current', { cwd: root, encoding: 'utf8' }).trim(), 'main');
    assert.equal(execSync('git status --porcelain', { cwd: root, encoding: 'utf8' }), ''); // fully committed
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('empty fixture: a bare repo that reads as unconfigured', () => {
  const root = bringUp('empty');
  try {
    assert.ok(existsSync(path.join(root, '.git')));
    assert.equal(statusJson(root).mode, 'unconfigured');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
