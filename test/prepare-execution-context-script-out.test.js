// run-presentation's --script-out leg on `spine prepare-execution-context`: with the
// flag, a launch-ready copy of the canonical workflow script is written, its meta
// description spliced to name the run's scope and target; without it, nothing is
// written, and stdout stays the unchanged execution context either way. A canonical
// script whose meta line doesn't carry the expected shape is a refusal — exit 1,
// nothing written, stdout included.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const BIN = path.resolve('bin/the-loop.js');

function spine(args, opts = {}) {
  return execFileSync('node', [BIN, ...args], { encoding: 'utf8', ...opts });
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

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

// A fixture that is also a git repo, everything committed on main.
function gitFixture(files) {
  const root = fixture(files);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@the-loop.local');
  git(root, 'config', 'user.name', 'spine test');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'seed');
  return root;
}

// A standalone `PLUGIN_ROOT` — a real copy of bin/ + src/ + config/ + docs/executors
// (node_modules symlinked in, the same trick worktree-create uses) plus a
// caller-supplied workflows/execution-pipeline.js — so a test can drive the real CLI
// against a canonical script it controls, without touching this repo's own copy.
function pluginRootFixture(workflowScript) {
  const root = mkdtempSync(path.join(tmpdir(), 'spine-plugin-'));
  for (const dir of ['bin', 'src', 'config', 'docs/executors']) {
    cpSync(dir, path.join(root, dir), { recursive: true });
  }
  symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  mkdirSync(path.join(root, 'workflows'), { recursive: true });
  writeFileSync(path.join(root, 'workflows/execution-pipeline.js'), workflowScript);
  return root;
}

const GRAPH = `# Fixture — Feature graph

## Feature graph

\`\`\`yaml
design_version: 1
features:
  - id: widget
    title: Widget
    status: designed
    depends_on: []
    acceptance: [renders a widget, persists a widget]
\`\`\`
`;

const DESIGN = `# Fixture — Architecture

Narrative.

## Validation runbook

Run the fixture CLI and expect pong on stdout.
`;

test("spine prepare-execution-context --script-out writes a spliced copy of the canonical workflow script naming this run's scope and target; without the flag nothing is written, and stdout stays the unchanged execution context either way", () => {
  const root = gitFixture({ 'docs/feature-graph.md': GRAPH, 'docs/architecture.md': DESIGN });
  try {
    const scriptOut = path.join(root, 'spliced-workflow.js');
    const withoutFlag = spine(['prepare-execution-context', '--features', 'widget', '--target-branch', 'main'], { cwd: root });
    assert.ok(!existsSync(scriptOut)); // no flag → nothing written

    const withFlag = spine(['prepare-execution-context', '--features', 'widget', '--target-branch', 'main', '--script-out', scriptOut], { cwd: root });
    assert.equal(withFlag, withoutFlag); // stdout is the unchanged execution context either way

    const canonical = readFileSync('workflows/execution-pipeline.js', 'utf8');
    const spliced = readFileSync(scriptOut, 'utf8');
    const metaLine = /^export const meta\b.*;$/m;
    assert.notEqual(spliced, canonical);
    assert.equal(spliced.replace(metaLine, ''), canonical.replace(metaLine, '')); // differs only in meta

    const meta = new Function(`${spliced.match(metaLine)[0].replace(/^export /, '')}\nreturn meta;`)();
    assert.equal(meta.description, 'widget → main'); // scope-derived: the one in-scope id, arrow, target
    assert.equal(meta.name, 'execution-pipeline'); // meta.name is left alone
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("spine prepare-execution-context --script-out exits 1 with nothing written — stdout included — when the canonical script's meta line doesn't carry the expected description shape", () => {
  const root = gitFixture({ 'docs/feature-graph.md': GRAPH, 'docs/architecture.md': DESIGN });
  const pluginRoot = pluginRootFixture([
    'export const meta = {',
    "  name: 'execution-pipeline',",
    "  description: 'a static description that never varies',",
    '};',
    'const x = 1;',
    '',
  ].join('\n')); // meta spans multiple lines — no one-line `description: '…'` shape to splice
  try {
    const scriptOut = path.join(root, 'spliced-workflow.js');
    const bin = path.join(pluginRoot, 'bin/the-loop.js');
    let failure;
    try {
      execFileSync('node', [bin, 'prepare-execution-context', '--features', 'widget', '--target-branch', 'main', '--script-out', scriptOut], { cwd: root, encoding: 'utf8' });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, 'expected the command to exit non-zero');
    assert.equal(failure.status, 1);
    assert.equal(failure.stdout, '');
    assert.match(failure.stderr, /description/);
    assert.ok(!existsSync(scriptOut));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(pluginRoot, { recursive: true, force: true });
  }
});
