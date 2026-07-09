// bin/the-loop.js hooks-list / hooks-set — exercised as a subprocess, same posture as
// cli.test.js (its sibling; split out once the hook-inventory + settings-writer
// surface pushed cli.test.js over max-lines).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const BIN = path.resolve('plugin/bin/the-loop.js');
const spine = (args, opts = {}) => execFileSync('node', [BIN, ...args], { encoding: 'utf8', ...opts });

function spineFails(args, opts = {}) {
  try { spine(args, opts); } catch (error) {
    assert.equal(error.status, 1);
    return error;
  }
  assert.fail(`expected "the-loop ${args.join(' ')}" to exit 1`);
}

function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'spine-cli-'));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const cleanup = (...dirs) => { for (const d of dirs) { rmSync(d, { recursive: true, force: true }); } };
// HOME-isolated runs — never read the real developer's ~/.claude/settings.json.
const emptyHome = () => mkdtempSync(path.join(tmpdir(), 'spine-home-'));
const withHome = (home, opts = {}) => ({ ...opts, env: { ...process.env, HOME: home } });
const loopSettings = (family, value) => JSON.stringify({ 'the-loop': { [family]: value } });

test('spine hooks-set writes "the-loop".<family> into the named layer file, creating the file and .claude/ parent when absent', () => {
  const root = fixture({});
  const home = mkdtempSync(path.join(tmpdir(), 'spine-hooks-home-'));
  try {
    const projectOut = JSON.parse(spine(['hooks-set', 'testHarness', 'project', JSON.stringify({ command: 'npm test' })], { cwd: root }));
    assert.deepEqual(projectOut, { family: 'testHarness', layer: 'project', file: path.join('.claude', 'settings.json'), value: { command: 'npm test' } });
    assert.deepEqual(readJson(path.join(root, '.claude', 'settings.json'))['the-loop'].testHarness, { command: 'npm test' });

    spine(['hooks-set', 'lint', 'local', JSON.stringify({ command: 'npm run lint' })], { cwd: root });
    assert.deepEqual(readJson(path.join(root, '.claude', 'settings.local.json'))['the-loop'].lint, { command: 'npm run lint' });

    // user → ~/.claude/settings.json under a scoped HOME (never the real home)
    spine(['hooks-set', 'notification', 'user', JSON.stringify({ channel: 'desktop' })], { cwd: root, env: { ...process.env, HOME: home } });
    assert.deepEqual(readJson(path.join(home, '.claude', 'settings.json'))['the-loop'].notification, { channel: 'desktop' });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('spine hooks-set preserves unrelated keys byte-for-byte and re-reads the new family value from the layer file', () => {
  // Exact substrings that must survive the surgical write untouched (quirky formatting).
  const permissions = `"permissions": {\n    "allow": ["Bash"]\n  }`;
  const env = `"env": {\n    "FOO": "bar"\n  }`;
  const sibling = `"modelBindings": {\n      "build": {\n        "model": "opus"\n      }\n    }`;
  const siblingLint = `"lint": {\n      "command": "old-lint"\n    }`;
  const existing = `{\n  ${permissions},\n  ${env},\n  "the-loop": {\n    ${sibling},\n    ${siblingLint}\n  }\n}\n`;
  const root = fixture({ '.claude/settings.json': existing });
  try {
    spine(['hooks-set', 'testHarness', 'project', JSON.stringify({ command: 'npm test' })], { cwd: root });
    const after = readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8');
    for (const s of [permissions, env, sibling, siblingLint]) { assert.ok(after.includes(s), s); }
    // Re-read shape a resolver would use: new value under "the-loop".testHarness in this layer.
    const parsed = JSON.parse(after);
    assert.deepEqual(parsed['the-loop'].testHarness, { command: 'npm test' });
    assert.deepEqual(parsed['the-loop'].modelBindings, { build: { model: 'opus' } });
    assert.deepEqual(parsed['the-loop'].lint, { command: 'old-lint' });
    assert.deepEqual(parsed.permissions, { allow: ['Bash'] });
    assert.deepEqual(parsed.env, { FOO: 'bar' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine hooks-set refuses unknown family/layer, unparseable JSON, or too few args (exit 1, nothing written)', () => {
  const root = fixture({ '.claude/settings.json': JSON.stringify({ keep: true, 'the-loop': { lint: { command: 'x' } } }, null, 2) });
  const settingsPath = path.join(root, '.claude', 'settings.json');
  const before = readFileSync(settingsPath, 'utf8');
  try {
    for (const [args, re] of [
      [['hooks-set', 'notAFamily', 'project', '{}'], /unknown family.*notAFamily/i],
      [['hooks-set', 'lint', 'staging', '{}'], /unknown layer.*staging/i],
      [['hooks-set', 'lint', 'project', '{ not json'], /unparseable JSON value/i],
      [['hooks-set', 'lint', 'project'], /usage:.*hooks-set/],
    ]) {
      assert.match(spineFails(args, { cwd: root }).stderr, re);
      assert.equal(readFileSync(settingsPath, 'utf8'), before);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine hooks-list: fresh install resolves shipped defaults and visible fallbacks; no synthetic families', () => {
  const home = emptyHome();
  const root = fixture({});
  try {
    const result = spawnSync('node', [BIN, 'hooks-list'], withHome(home, { cwd: root, encoding: 'utf8' }));
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    const families = ['artifactStores', 'interview', 'lint', 'modelBindings', 'notification', 'precommit', 'testHarness'];
    assert.deepEqual(Object.keys(body.hooks).toSorted((a, b) => a.localeCompare(b)), families);
    assert.equal(body.hooks.exampleBlock, undefined);
    assert.deepEqual(body.hooks.interview, { skill: 'grilling', provenance: 'default' });
    assert.deepEqual(body.hooks.precommit, { system: 'none', provenance: 'default' });
    assert.deepEqual(body.hooks.notification, { channel: 'chat', provenance: 'default' });
    assert.equal(body.hooks.artifactStores.provenance, 'default');
    for (const key of ['briefs', 'designs', 'features', 'runbooks', 'rcas', 'calibration']) {
      assert.equal(body.hooks.artifactStores[key], 'local', key);
    }
    assert.deepEqual(body.hooks.testHarness, { value: 'detected-convention', provenance: 'fallback' });
    assert.deepEqual(body.hooks.lint, { value: 'detected-convention', provenance: 'fallback' });
    assert.equal(body.hooks.modelBindings.plan.provenance, 'default');
    assert.equal(body.hooks.modelBindings.plan.model, 'session');
    assert.match(result.stderr, /architecture\.md/);
    assert.deepEqual(body.recordedBindings.validationRunbook, { status: 'absent', gap: null });
    assert.deepEqual(body.recordedBindings.releaseRunbook, { status: 'absent', gap: 'blocked — no guessed deploys' });
    assert.deepEqual(body.recordedBindings.operationsToolkit, { status: 'absent', gap: 'lazy retrofit (operate-tooling)' });
  } finally { cleanup(root, home); }
});

test('spine hooks-list: artifactStores bound in project settings reads back with provenance project', () => {
  // Partial object: whole-entry replacement — unset keys must not leak from defaults.
  const home = emptyHome();
  const stores = { briefs: 's3', designs: 's3', features: 'local' };
  const root = fixture({ '.claude/settings.json': loopSettings('artifactStores', stores) });
  try {
    const body = JSON.parse(spine(['hooks-list'], withHome(home, { cwd: root })));
    assert.deepEqual(body.hooks.artifactStores, { ...stores, provenance: 'project' });
    assert.equal(body.hooks.artifactStores.runbooks, undefined);
  } finally { cleanup(root, home); }
});

test('spine hooks-list: recordedBindings reflect architecture.md present / opted-out / absent', () => {
  const home = emptyHome();
  const arch = '# Fixture\n\n## Validation runbook\n\nRun the suite.\n\n## Release runbook\n\nnone\n';
  const root = fixture({ 'docs/architecture.md': arch });
  try {
    const body = JSON.parse(spine(['hooks-list'], withHome(home, { cwd: root })));
    assert.deepEqual(body.recordedBindings.validationRunbook, { status: 'present', gap: null });
    assert.deepEqual(body.recordedBindings.releaseRunbook, { status: 'opted-out', gap: null });
    assert.deepEqual(body.recordedBindings.operationsToolkit, { status: 'absent', gap: 'lazy retrofit (operate-tooling)' });
  } finally { cleanup(root, home); }
});
