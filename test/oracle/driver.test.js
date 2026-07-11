// Driver unit tests: the driver is exercised over a stub binary (a throwaway CJS
// script in a temp dir) so no real implementation is imported in-process — the same
// black-box discipline the corpus uses. Each test drives argv/cwd/env into the stub
// and asserts the verdict the compare module renders.
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { formatSummary, loadCases, loadPending, resolveTarget, runCase, summarize } from './driver.js';

// A tiny CommonJS stub binary; its behavior is selected by argv[2] (the "mode").
const STUB_SRC = `const fs = require('node:fs');
const p = require('node:path');
const out = (o) => process.stdout.write(JSON.stringify(o));
const mode = process.argv[2];
switch (mode) {
  case 'echo': out({ args: process.argv.slice(3), cwd: process.cwd(), foo: process.env.FOO, home: process.env.HOME }); break;
  case 'json': out({ b: 2, a: 1 }); break;
  case 'refuse': process.stderr.write('refused'); process.exit(1); break;
  case 'writefile': fs.writeFileSync(p.join(process.cwd(), 'out.json'), JSON.stringify({ n: 1 })); out({ ok: true }); break;
  case 'prepared': out({ preparedAt: '2026-07-09T12:00:00.000Z', ctx: { cli: 'node x' } }); break;
  default: process.stderr.write('unknown'); process.exit(2);
}
`;

const STUB_DIR = mkdtempSync(path.join(tmpdir(), 'oracle-stub-'));
const STUB = path.join(STUB_DIR, 'stub.js');
writeFileSync(STUB, STUB_SRC);
const stubBin = { command: 'node', prefixArgs: [STUB] };

const run = (caseSpec, opts = {}) => runCase(caseSpec, { bin: stubBin, target: 'js', pendingCommands: [], ...opts });
const tempCwd = () => mkdtempSync(path.join(tmpdir(), 'oracle-cwd-'));

test('driver spawns the binary and passes argv, cwd, and per-case env through as a subprocess', () => {
  const cwd = tempCwd();
  try {
    const home = tempCwd();
    const verdict = run({
      command: 'echo',
      scenario: 'passes argv/cwd/env',
      argv: ['echo', 'a', 'b'],
      env: { FOO: 'bar', HOME: home },
      setup: () => ({ cwd }),
      // process.cwd() inside the child resolves symlinks (macOS /var → /private/var).
      expect: { exitCode: 0, stdout: { args: ['a', 'b'], cwd: realpathSync(cwd), foo: 'bar', home } },
    });
    assert.equal(verdict.status, 'pass');
    rmSync(home, { recursive: true, force: true });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('driver renders pass on key-order-insensitive stdout and fail on a JSON mismatch', () => {
  const passing = run({ command: 'json', scenario: 'reordered keys', argv: ['json'], expect: { stdout: { a: 1, b: 2 } } });
  assert.equal(passing.status, 'pass');

  const failing = run({ command: 'json', scenario: 'wrong value', argv: ['json'], expect: { stdout: { a: 1, b: 3 } } });
  assert.equal(failing.status, 'fail');
  assert.match(failing.reason, /stdout JSON/);
});

test('pending mechanics: a Rust failure on an allowlisted command is pending, stays a fail otherwise', () => {
  const failingCase = { command: 'json', scenario: 'wrong exit', argv: ['json'], expect: { exitCode: 1 } };

  const rustAllowlisted = run(failingCase, { target: 'rust', pendingCommands: ['json'] });
  assert.equal(rustAllowlisted.status, 'pending');

  const rustNotListed = run(failingCase, { target: 'rust', pendingCommands: [] });
  assert.equal(rustNotListed.status, 'fail');

});

test('summarize + formatSummary yield one pass/fail/pending count line naming the target', () => {
  const counts = summarize([{ status: 'pass' }, { status: 'pass' }, { status: 'fail' }, { status: 'pending' }]);
  assert.deepEqual(counts, { pass: 2, fail: 1, pending: 1 });
  const line = formatSummary(counts, 'rust');
  assert.match(line, /rust/);
  assert.match(line, /2 pass, 1 fail, 1 pending/);
});

test('resolveTarget defaults to the release binary and honors ORACLE_BIN', () => {
  const dflt = resolveTarget({});
  assert.equal(dflt.target, 'rust');
  assert.ok(dflt.bin.command.endsWith('target/release/the-loop'));
  assert.deepEqual(dflt.bin.prefixArgs, []);

  const override = resolveTarget({ ORACLE_BIN: 'foo bar baz' });
  assert.deepEqual(override.bin, { command: 'foo', prefixArgs: ['bar', 'baz'] });
});

test('loadPending lists remaining allowlisted commands and excludes live graph/plan commands and --version', () => {
  const pending = loadPending();
  assert.ok(Array.isArray(pending));
  assert.ok(!pending.includes('plan parse'));
  assert.ok(!pending.includes('plan check'));
  assert.ok(!pending.includes('plan task'));
  assert.ok(!pending.includes('status'));
  assert.ok(!pending.includes('list'));
  assert.ok(!pending.includes('check'));
  assert.ok(!pending.includes('set-status'));
  assert.ok(!pending.includes('--version'));
  // prepare-execution-context is now ported to Rust — it left the allowlist.
  assert.ok(!pending.includes('prepare-execution-context'));
  // worktree-create/worktree-remove and calibration-summarize are also ported —
  // the full run-commands-rust slice landed together, so the allowlist is empty.
  assert.ok(!pending.includes('worktree-create'));
  assert.ok(!pending.includes('worktree-remove'));
  assert.ok(!pending.includes('calibration-summarize'));
  assert.deepEqual(pending, []);
});

test('loadCases discovers case modules from a directory and returns [] when absent', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'oracle-cases-'));
  try {
    writeFileSync(path.join(dir, 'sample.js'), 'export const cases = [{ command: "x", scenario: "y", argv: [], expect: {} }];\n');
    const found = await loadCases(dir);
    assert.equal(found.length, 1);
    assert.equal(found[0].command, 'x');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const missing = await loadCases(path.join(tmpdir(), 'oracle-does-not-exist-xyz'));
  assert.deepEqual(missing, []);
});

test('driver asserts filesystem effects, ISO-8601 shape, and the per-binary cli field', () => {
  const cwd = tempCwd();
  try {
    const wrote = run({
      command: 'writefile',
      scenario: 'writes an artifact',
      argv: ['writefile'],
      setup: () => ({ cwd }),
      expect: { exitCode: 0, stdout: { ok: true }, files: { 'out.json': { n: 1 } } },
    });
    assert.equal(wrote.status, 'pass');

    const badEffect = run({
      command: 'writefile',
      scenario: 'wrong artifact',
      argv: ['writefile'],
      setup: () => ({ cwd }),
      expect: { files: { 'out.json': { n: 2 } } },
    });
    assert.equal(badEffect.status, 'fail');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }

  const prepared = run({
    command: 'prepare-execution-context',
    scenario: 'normalized fields',
    argv: ['prepared'],
    expect: { iso8601: ['preparedAt'], cli: { path: 'ctx.cli', value: 'node x' } },
  });
  assert.equal(prepared.status, 'pass');
});

test('driver asserts refusal-path stderr presence', () => {
  const present = run({ command: 'refuse', scenario: 'refuses loudly', argv: ['refuse'], expect: { exitCode: 1, stderr: 'present' } });
  assert.equal(present.status, 'pass');

  const wronglyAbsent = run({ command: 'refuse', scenario: 'expected quiet', argv: ['refuse'], expect: { stderr: 'absent' } });
  assert.equal(wronglyAbsent.status, 'fail');
});
