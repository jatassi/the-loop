// `spine ship corridor` — the bin edge driving src/corridor.js one step at a time
// against test/fixtures/deploy-target.js, a scripted deploy target with injectable
// outcomes (journal + control file). Exercised as a real subprocess (test/spine-cli.test.js
// conventions); the real plugin CLI never enters this suite.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const BIN = path.resolve('bin/spine.js');
const FIXTURE = path.resolve('test/fixtures/deploy-target.js');

function spine(args, opts = {}) {
  return execFileSync('node', [BIN, ...args], { encoding: 'utf8', ...opts });
}

function spineFails(args, opts = {}) {
  try {
    spine(args, opts);
  } catch (error) {
    assert.equal(error.status, 1);
    return error;
  }
  assert.fail(`expected "spine ${args.join(' ')}" to exit 1`);
}

// A throwaway journal (+ optional control) file pair, torn down after each test.
function corridorFixture(control) {
  const root = mkdtempSync(path.join(tmpdir(), 'spine-corridor-'));
  const journal = path.join(root, 'journal');
  const controlFile = path.join(root, 'control.json');
  if (control) { writeFileSync(controlFile, JSON.stringify(control)); }
  return { root, journal, controlFile: control ? controlFile : undefined };
}

function journalLines(journal) {
  return existsSync(journal) ? readFileSync(journal, 'utf8').split('\n').filter(Boolean) : [];
}

const step = (name) => `node ${FIXTURE} ${name}`;

function runCorridor(binding, { journal, controlFile }) {
  return JSON.parse(spine(['ship', 'corridor', '-'], {
    input: JSON.stringify(binding),
    env: { ...process.env, JOURNAL_FILE: journal, ...(controlFile && { CONTROL_FILE: controlFile }) },
  }));
}

test('all steps green concludes deployed, journal deploy then smoke', () => {
  const { root, journal } = corridorFixture();
  try {
    const binding = { deploy: step('deploy'), rollback: step('rollback'), smoke: step('smoke') };
    const result = runCorridor(binding, { journal });
    assert.equal(result.outcome, 'deployed');
    assert.equal(result.health_signal, true);
    assert.deepEqual(journalLines(journal), ['deploy', 'smoke']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('smoke fail + rollback ok + verify ok concludes rolled-back with rollback_verified true', () => {
  const { root, journal, controlFile } = corridorFixture({ smoke: [false, true] });
  try {
    const binding = { deploy: step('deploy'), rollback: step('rollback'), smoke: step('smoke') };
    const result = runCorridor(binding, { journal, controlFile });
    assert.equal(result.outcome, 'rolled-back');
    assert.equal(result.rollback_verified, true);
    assert.deepEqual(journalLines(journal), ['deploy', 'smoke', 'rollback', 'smoke']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('smoke fail + rollback ok + verify fail concludes rolled-back with rollback_verified false present in the JSON', () => {
  const { root, journal, controlFile } = corridorFixture({ smoke: false });
  try {
    const binding = { deploy: step('deploy'), rollback: step('rollback'), smoke: step('smoke') };
    const result = runCorridor(binding, { journal, controlFile });
    assert.equal(result.outcome, 'rolled-back');
    assert.equal('rollback_verified' in result, true);
    assert.equal(result.rollback_verified, false);
    assert.deepEqual(journalLines(journal), ['deploy', 'smoke', 'rollback', 'smoke']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('deploy fail shows rollback still invoked and concludes deploy-failed', () => {
  const { root, journal, controlFile } = corridorFixture({ deploy: false });
  try {
    const binding = { deploy: step('deploy'), rollback: step('rollback') };
    const result = runCorridor(binding, { journal, controlFile });
    assert.equal(result.outcome, 'deploy-failed');
    assert.deepEqual(journalLines(journal), ['deploy', 'rollback']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('input without smoke concludes deployed with health_signal false, journal deploy only', () => {
  const { root, journal } = corridorFixture();
  try {
    const binding = { deploy: step('deploy'), rollback: step('rollback') };
    const result = runCorridor(binding, { journal });
    assert.equal(result.outcome, 'deployed');
    assert.equal(result.health_signal, false);
    assert.deepEqual(journalLines(journal), ['deploy']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine ship corridor exits 1 running nothing when deploy or rollback is missing from the input', () => {
  const { root, journal } = corridorFixture();
  try {
    spineFails(['ship', 'corridor', '-'], {
      input: JSON.stringify({ smoke: step('smoke') }),
      env: { ...process.env, JOURNAL_FILE: journal },
    });
    assert.deepEqual(journalLines(journal), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
