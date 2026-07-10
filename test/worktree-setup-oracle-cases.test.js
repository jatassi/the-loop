// End-to-end proof that test/oracle/cases/worktree-setup.js cases are real and green
// against the JS CLI on this branch (before the shared oracle corpus/driver exists).
// Do not import test/oracle/driver.js — it is not on this branch.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { cases } from './oracle/cases/worktree-setup.js';

// This file lives at test/ — one up reaches the repo root. Same derivation idea as
// the case module (import.meta.url → absolute plugin bin), independent copy.
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../plugin/bin/the-loop.js');

function runCase(c) {
  const { cwd, cleanup } = c.setup();
  try {
    const result = spawnSync('node', [CLI, ...c.argv], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    assertExpect(c, result, cwd);
  } finally {
    cleanup();
  }
}

function assertExpect(c, result, cwd) {
  const { expect } = c;
  if (expect.exitCode !== undefined) {
    assert.equal(result.status, expect.exitCode, `${c.scenario}: exitCode\nstderr: ${result.stderr}`);
  }
  if (expect.stdout !== undefined) {
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (error) {
      assert.fail(`${c.scenario}: stdout is not JSON: ${error.message}\n${result.stdout}`);
    }
    assert.deepEqual(parsed, expect.stdout, `${c.scenario}: stdout object`);
  }
  if (expect.stdoutBytes !== undefined) {
    assert.equal(result.stdout, expect.stdoutBytes, `${c.scenario}: stdoutBytes`);
  }
  if (expect.stderr === 'present') {
    assert.ok(result.stderr && result.stderr.length > 0, `${c.scenario}: expected non-empty stderr`);
  }
  if (typeof expect.effects === 'function') {
    const message = expect.effects(cwd);
    assert.equal(message, undefined, `${c.scenario}: effects — ${message}`);
  }
}

for (const c of cases) {
  test(`oracle case ${c.command}/${c.scenario}`, () => {
    runCase(c);
  });
}
