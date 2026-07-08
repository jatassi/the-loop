// bin/the-loop.js's executor-registry CLI surface (`the-loop executors-list`, and
// `the-loop models-list`'s binding-validation pass), exercised as an agent would —
// spawned as a real subprocess against throwaway fixture dirs and, for the
// real-registry case, against this plugin's own shipped docs/executors/ dir.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const BIN = path.resolve('bin/the-loop.js');

function spine(args, opts = {}) {
  return execFileSync('node', [BIN, ...args], { encoding: 'utf8', ...opts });
}

// Runs a command expected to exit 1; returns the caught error for stdout/stderr inspection.
function spineFails(args, opts = {}) {
  try {
    spine(args, opts);
  } catch (error) {
    assert.equal(error.status, 1);
    return error;
  }
  assert.fail(`expected "spine ${args.join(' ')}" to exit 1`);
}

// Runs a command expected to exit 0, returning both streams — execFileSync only
// surfaces stdout on success, but the warn-case behavior below needs both at once.
function spineOk(args, opts = {}) {
  const result = spawnSync('node', [BIN, ...args], { encoding: 'utf8', ...opts });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'executors-cli-'));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
}

// A minimal, valid playbook — one fenced yaml machine block under the pinned heading,
// with a little narrative lore around it (a bare block with no surrounding prose would
// never occur in a real playbook).
function playbook(id, { models = ['model-a', 'model-b'], concurrency = 1 } = {}) {
  return [
    `# ${id}`,
    '',
    `Narrative lore about the ${id} executor.`,
    '',
    '## Machine block',
    '',
    '```yaml',
    `id: ${id}`,
    `command: ${id}`,
    `models: [${models.join(', ')}]`,
    'worktree: driver-made',
    // A plain string (not a template literal): the invocation's own placeholder
    // syntax uses literal {model}/{prompt}/{worktree}, which ${}-interpolation would
    // flag as a forgotten dollar sign. The id needn't appear here — no test inspects it.
    'invocation: run -m {model} --prompt-file {prompt} --cwd {worktree}',
    `availability: ${id} --version`,
    'auth_smoke:',
    `  run: ${id} -p "ping"`,
    '  expect: pong',
    `concurrency: ${concurrency}`,
    '```',
    '',
  ].join('\n');
}

test('spine executors-list with no dir argument reads the real plugin docs/executors/ dir: grok appears with worktree driver-made and the pinned models list', () => {
  const registry = JSON.parse(spine(['executors-list']));
  assert.equal(registry.grok.worktree, 'driver-made');
  assert.deepEqual(registry.grok.models, ['grok-4.5', 'grok-composer-2.5-fast']);
});

test('spine executors-list with an explicit dir argument reads a fixture dir, printing the registry keyed by id', () => {
  const root = fixture({ 'playbooks/widget.md': playbook('widget') });
  try {
    const registry = JSON.parse(spine(['executors-list', path.join(root, 'playbooks')]));
    assert.deepEqual(Object.keys(registry), ['widget']);
    assert.equal(registry.widget.command, 'widget');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine executors-list against a malformed fixture playbook exits 1 with stderr naming the file and the offending field', () => {
  const root = fixture({ 'playbooks/widget.md': playbook('widget').replace('command: widget\n', '') });
  try {
    const error = spineFails(['executors-list', path.join(root, 'playbooks')]);
    assert.match(error.stderr, /widget\.md/);
    assert.match(error.stderr, /"command"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine executors-list against an absent dir prints {}', () => {
  const root = fixture({});
  try {
    assert.equal(spine(['executors-list', path.join(root, 'nonexistent')]).trim(), '{}');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine models-list hard-fails an executor naming an unregistered executor, or a model outside its playbook, exiting 1 with every error on stderr and no table on stdout', () => {
  const root = fixture({
    'playbooks/custom.md': playbook('custom', { models: ['model-a'] }),
    'defaults.json': JSON.stringify({
      'build.rote': { model: 'session', executor: 'ghost' }, // no registry id "ghost"
      'build.standard': { model: 'model-z', executor: 'custom' }, // model-z not in custom's models list
    }),
  });
  try {
    const error = spineFails(['models-list', 'defaults.json', path.join(root, 'playbooks')], { cwd: root });
    assert.match(error.stderr, /unregistered-executor.*\(build\.rote\)/);
    assert.match(error.stderr, /model-outside-playbook.*\(build\.standard\)/);
    assert.equal(error.stdout, ''); // no table
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// One test per warn case: each prints exactly the pinned stderr line, and the table
// still prints to stdout with exit 0.
const WARN_CASES = [
  ['no-routing-surface', { 'design.reader': { model: 'model-a', executor: 'custom' } }],
  ['off-rubric-tier', { 'build.standard': { model: 'model-a', executor: 'custom' } }],
  ['ignored-effort', { 'build.rote': { model: 'model-a', executor: 'custom', effort: 'high' } }],
];

for (const [code, bindings] of WARN_CASES) {
  test(`spine models-list warns ${code} in the pinned format to stderr, never failing — the table still prints to stdout and the exit stays 0`, () => {
    const [role] = Object.keys(bindings);
    const root = fixture({
      'playbooks/custom.md': playbook('custom', { models: ['model-a'] }),
      'defaults.json': JSON.stringify(bindings),
    });
    try {
      const { stdout, stderr } = spineOk(['models-list', 'defaults.json', path.join(root, 'playbooks')], { cwd: root });
      assert.equal(JSON.parse(stdout)[role].model, 'model-a');
      assert.match(stderr, new RegExp(String.raw`^warn ${code}: .+\(${role}\)\n$`));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('the usage string names both new command forms: "executors-list [dir]" and "models-list [defaults.json] [executors-dir]"', () => {
  const usage = spine([]);
  assert.match(usage, /executors-list \[dir]/);
  assert.match(usage, /models-list \[defaults\.json] \[executors-dir]/);
});
