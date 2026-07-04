// `spine validate scan` builds a git ref from its feature-id argument
// (branch = `loop/<id>`) and shells out to git. This is the regression guard that the
// ref reaches git as one literal argument — never a shell command line — so a feature
// id lifted from an untrusted repo's graph cannot inject a command. Spawned as a real
// subprocess (test/spine-cli.test.js conventions) against a throwaway git repo.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const BIN = path.resolve('bin/spine.js');

// A throwaway git repo with a real `main` and one commit, so `git merge-base main …`
// gets past target resolution and evaluates the attacker-controlled branch ref.
function gitFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'spine-scan-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init', '-b', 'main');
  git('config', 'user.email', 'probe@example.test');
  git('config', 'user.name', 'Probe');
  git('commit', '--allow-empty', '-m', 'root');
  return root;
}

test('spine validate scan treats a feature id carrying shell metacharacters as a literal git ref — the payload never executes', () => {
  const root = gitFixture();
  try {
    // Were the id interpolated into a shell string, `git merge-base main loop/x; touch
    // PWNED #` would run `touch PWNED`. With argv passed straight to git, the whole
    // thing is one unresolvable ref: git fails, spine exits non-zero, nothing runs.
    let exited = 0;
    try {
      execFileSync('node', [BIN, 'validate', 'scan', 'x; touch PWNED #'], { cwd: root, stdio: 'ignore' });
    } catch (error) {
      exited = error.status;
    }
    assert.notEqual(exited, 0, 'a bogus injected ref must fail the scan, not succeed');
    assert.equal(existsSync(path.join(root, 'PWNED')), false, 'the injected command must not have run');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine validate scan resolves a normal feature id against a real branch, exiting 0', () => {
  const root = gitFixture();
  try {
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
    git('branch', 'loop/greet-core'); // the ref `loop/<id>` the scan derives by default
    const out = execFileSync('node', [BIN, 'validate', 'scan', 'greet-core'], { cwd: root, encoding: 'utf8' });
    assert.equal(JSON.parse(out).feature, 'greet-core');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
