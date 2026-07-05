// bin/the-loop.js — the v2 command surface, exercised as a user or an agent would:
// spawned as a real subprocess against throwaway fixture dirs (git repos where the
// command derives state from branches: launch, worktree).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const BIN = path.resolve('bin/the-loop.js');

function spine(args, opts = {}) {
  return execFileSync('node', [BIN, ...args], { encoding: 'utf8', ...opts });
}

// Runs a command expected to exit 1; returns the caught error for stream inspection.
function spineFails(args, opts = {}) {
  try {
    spine(args, opts);
  } catch (error) {
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

function commitFile(root, rel, { contents, message }) {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, contents);
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', message);
}

const sorted = (xs) => xs.toSorted((a, b) => a.localeCompare(b));

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
  - id: gadget
    title: Gadget
    status: designed
    depends_on: [widget]
    acceptance: renders a gadget
  - id: base
    title: Base
    status: validated
    depends_on: []
    acceptance: base works
\`\`\`
`;

const DESIGN = `# Fixture — Design

Narrative.

## Runtime probe

Run the fixture CLI and expect pong on stdout.

## Ship recipe

Tag it.
`;

const PLAN = `# Plan — widget

## Tasks

\`\`\`yaml
feature: widget
design_version: 1
tasks:
  - id: t1
    title: Render pipeline
    covers: [1]
    acceptance: markup renders
    footprint: [src/render.js]
    size: s
    tier: standard
    depends_on: []
  - id: t2
    title: Persistence
    covers: [2]
    acceptance: a widget persists
    footprint: [src/save.js]
    size: xs
    tier: standard
    depends_on: [t1]
\`\`\`
`;

test('spine graph prints the parsed model without internals; spine check reports OK/FAIL and sets the exit code', () => {
  const root = fixture({
    'docs/design/graph.md': GRAPH,
    'bad.md': GRAPH.replace('depends_on: [widget]', 'depends_on: [ghost]'),
  });
  try {
    const model = JSON.parse(spine(['graph'], { cwd: root }));
    assert.equal(model.designVersion, 1);
    assert.deepEqual(model.features.map((f) => f.id), ['widget', 'gadget', 'base']);
    assert.ok(!('_blocks' in model));

    assert.match(spine(['check'], { cwd: root }), /^OK +3 features/);
    const error = spineFails(['check', 'bad.md'], { cwd: root });
    assert.match(error.stdout, /ERROR dangling-dependency/);
    assert.match(error.stdout, /^FAIL/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine set-status flips one feature in graph.md and prints it as JSON; an unknown id or out-of-enum status exits 1 and writes nothing', () => {
  const root = fixture({ 'docs/design/graph.md': GRAPH });
  try {
    const graphPath = path.join(root, 'docs/design/graph.md');
    const node = JSON.parse(spine(['set-status', 'widget', 'validated'], { cwd: root }));
    assert.equal(node.id, 'widget');
    assert.equal(node.status, 'validated');

    const written = readFileSync(graphPath, 'utf8');
    assert.equal(written, GRAPH.replace('status: designed', 'status: validated')); // sibling lines untouched

    spineFails(['set-status', 'ghost', 'validated'], { cwd: root });
    spineFails(['set-status', 'widget', 'building'], { cwd: root }); // in-flight states never land in the graph
    assert.equal(readFileSync(graphPath, 'utf8'), written); // the two refusals wrote nothing
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine ledger prints the status story to stdout and writes nothing', () => {
  const root = fixture({ 'docs/design/graph.md': GRAPH });
  try {
    const before = sorted(readdirSync(root, { recursive: true }));
    const story = spine(['ledger'], { cwd: root });
    assert.match(story, /^# Status — projected from docs\/design\/graph\.md\n/);
    assert.match(story, /Total: 3 feature\(s\) at design_version 1/);
    assert.match(story, /- designed: 2\n- validated: 1\n- shipped: 0/);
    assert.match(story, /\*\*Next:\*\* `widget`/); // gadget is dep-blocked, base already landed
    assert.match(story, /\| gadget \| designed \| Gadget \|/);

    assert.deepEqual(sorted(readdirSync(root, { recursive: true })), before); // no file appeared
    assert.equal(readFileSync(path.join(root, 'docs/design/graph.md'), 'utf8'), GRAPH); // none changed
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine plan parse/check/task work against working-tree artifacts; a feature-id mismatch fails the check', () => {
  const root = fixture({ 'docs/design/graph.md': GRAPH, 'docs/plans/widget.md': PLAN });
  try {
    const plan = JSON.parse(spine(['plan', 'parse', 'widget'], { cwd: root }));
    assert.equal(plan.feature, 'widget');
    assert.deepEqual(plan.tasks.map((t) => t.id), ['t1', 't2']);

    assert.match(spine(['plan', 'check', 'widget'], { cwd: root }), /^OK +plan widget: 2 task\(s\)/);

    const kernel = JSON.parse(spine(['plan', 'task', 'widget', 't2'], { cwd: root }));
    assert.equal(kernel.feature, 'widget');
    assert.equal(kernel.design_version, 1);
    assert.equal(kernel.task.id, 't2');
    assert.deepEqual(kernel.covers_criteria, ['persists a widget']);

    const error = spineFails(['plan', 'check', 'gadget', 'docs/plans/widget.md'], { cwd: root });
    assert.match(error.stdout, /feature-mismatch/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine launch refuses a bad scope — unknown id, not-designed, unsatisfied dep — with exit 1 and nothing on stdout', () => {
  const root = fixture({ 'docs/design/graph.md': GRAPH, 'docs/design/design.md': DESIGN });
  try {
    const cases = [
      ['ghost', /unknown-feature/],
      ['base', /not-designed/],       // validated — nothing to run
      ['gadget', /unsatisfied-dependency/], // widget is neither landed nor in scope
    ];
    for (const [scope, re] of cases) {
      const error = spineFails(['launch', '--scope', scope, '--target', 'main'], { cwd: root });
      assert.equal(error.stdout, '');
      assert.match(error.stderr, re);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine launch refuses a missing --target — exit 1, nothing on stdout, usage on stderr', () => {
  const root = fixture({ 'docs/design/graph.md': GRAPH, 'docs/design/design.md': DESIGN });
  try {
    const error = spineFails(['launch', '--scope', 'widget'], { cwd: root });
    assert.equal(error.stdout, '');
    assert.match(error.stderr, /--target <ref>/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine launch emits the snapshot: plan read from the feature branch, builtTasks derived from a task branch head subject', () => {
  const root = gitFixture({
    'docs/design/graph.md': GRAPH,
    'docs/design/design.md': DESIGN,
    'docs/design/features/widget.md': '# widget — design\n',
  });
  try {
    git(root, 'checkout', '-q', '-b', 'loop/widget');
    commitFile(root, 'docs/plans/widget.md', { contents: PLAN, message: 'widget: plan cut' });
    git(root, 'checkout', '-q', '-b', 'loop/widget--t1');
    commitFile(root, 'src/render.js', { contents: 'export const x = 1;\n', message: 'widget/t1: render pipeline lands' });
    git(root, 'checkout', '-q', 'main');

    const snap = JSON.parse(spine(['launch', '--scope', 'widget,gadget', '--target', 'main'], { cwd: root }));
    assert.equal(snap.target, 'main');
    assert.deepEqual(snap.scope, ['widget', 'gadget']);
    assert.equal(snap.probe, 'Run the fixture CLI and expect pong on stdout.'); // design.md's section, verbatim
    assert.equal(snap.models.plan.model, 'session'); // the plugin's shipped defaults resolved
    assert.match(snap.cli, /bin\/the-loop\.js/); // the CLI invocation workers should use

    const w = snap.features.widget;
    assert.equal(w.branch, 'loop/widget');
    assert.equal(w.branchHead, 'widget: plan cut');
    assert.deepEqual(w.plan.tasks.map((t) => t.id), ['t1', 't2']); // read from the branch —
    assert.ok(!existsSync(path.join(root, 'docs/plans/widget.md'))); // — the working tree has no plan file
    assert.deepEqual(w.builtTasks, ['t1']); // t1's head subject carries "widget/t1: "; t2 has no branch
    assert.equal(w.designDoc, '# widget — design\n');
    assert.deepEqual(w.acceptance, ['renders a widget', 'persists a widget']);

    const g = snap.features.gadget;
    assert.equal(g.plan, null); // not planned yet
    assert.equal(g.branchHead, null);
    assert.deepEqual(g.builtTasks, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine launch falls back to docs/rca/<id>.md for a fix node\'s design doc when docs/design/features/<id>.md is absent', () => {
  const FIX_GRAPH = `# Fixture — Feature graph

## Feature graph

\`\`\`yaml
design_version: 1
features:
  - id: fix-widget
    title: Widget race fix
    status: designed
    depends_on: []
    acceptance: the race no longer drops an update
\`\`\`
`;
  const root = gitFixture({
    'docs/design/graph.md': FIX_GRAPH,
    'docs/design/design.md': DESIGN,
    'docs/rca/fix-widget.md': '# fix-widget — race drops an update\n',
  });
  try {
    assert.ok(!existsSync(path.join(root, 'docs/design/features/fix-widget.md')));
    const snap = JSON.parse(spine(['launch', '--scope', 'fix-widget', '--target', 'main'], { cwd: root }));
    assert.equal(snap.features['fix-widget'].designDoc, '# fix-widget — race drops an update\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine worktree create adds .claude/worktrees/<branch> and prints {path, branch, created}; create-existing returns created:false; remove removes', () => {
  const root = gitFixture({ 'README.md': '# fixture\n' });
  try {
    const created = JSON.parse(spine(['worktree', 'create', 'loop/widget', '--from', 'main'], { cwd: root }));
    assert.deepEqual(created, { path: path.join('.claude/worktrees', 'loop-widget'), branch: 'loop/widget', created: true });
    assert.ok(existsSync(path.join(root, created.path, 'README.md'))); // a real checkout

    const again = JSON.parse(spine(['worktree', 'create', 'loop/widget'], { cwd: root }));
    assert.deepEqual(again, { ...created, created: false });

    const removed = JSON.parse(spine(['worktree', 'remove', created.path], { cwd: root }));
    assert.deepEqual(removed, { removed: created.path });
    assert.ok(!existsSync(path.join(root, created.path)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("spine models resolves the shipped plugin defaults relative to bin/the-loop.js's own location, never cwd, and succeeds with no project or local settings present", () => {
  const root = fixture({}); // no .claude/, no config/ — an empty target repo
  try {
    const table = JSON.parse(spine(['models'], { cwd: root }));
    assert.deepEqual(table.plan, { model: 'session', provenance: 'default' }); // one shipped row, not the whole table
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine models merges an overridden defaults file with project < local settings overrides (whole-entry replacement), stamping per-role provenance', () => {
  const root = fixture({ 'defaults.json': JSON.stringify({ build: { model: 'opus', effort: 'low' } }) });
  try {
    const defaultsOnly = JSON.parse(spine(['models', 'defaults.json'], { cwd: root }));
    assert.deepEqual(defaultsOnly.build, { model: 'opus', effort: 'low', provenance: 'default' });

    mkdirSync(path.join(root, '.claude'), { recursive: true });
    writeFileSync(path.join(root, '.claude/settings.json'), JSON.stringify({ 'the-loop': { modelBindings: { build: { model: 'haiku' } } } }));
    const withProject = JSON.parse(spine(['models', 'defaults.json'], { cwd: root }));
    assert.deepEqual(withProject.build, { model: 'haiku', provenance: 'project' }); // wholesale replacement — effort is gone

    writeFileSync(path.join(root, '.claude/settings.local.json'), JSON.stringify({ 'the-loop': { modelBindings: { build: { model: 'opus', effort: 'high' } } } }));
    const withLocal = JSON.parse(spine(['models', 'defaults.json'], { cwd: root }));
    assert.deepEqual(withLocal.build, { model: 'opus', effort: 'high', provenance: 'local' }); // local beats project too
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine models: a resolver rejection or unparseable settings JSON exits 1 naming the offender', () => {
  const badDefaultsRoot = fixture({ 'defaults.json': JSON.stringify({ build: { effort: 'low' } }) }); // missing model
  try {
    const error = spineFails(['models', 'defaults.json'], { cwd: badDefaultsRoot });
    assert.match(error.stderr, /build.*default/);
  } finally {
    rmSync(badDefaultsRoot, { recursive: true, force: true });
  }

  const badProjectRoot = fixture({ 'defaults.json': '{}' });
  try {
    mkdirSync(path.join(badProjectRoot, '.claude'), { recursive: true });
    writeFileSync(path.join(badProjectRoot, '.claude/settings.json'), '{ not json');
    const error = spineFails(['models', 'defaults.json'], { cwd: badProjectRoot });
    assert.match(error.stderr, /\.claude\/settings\.json/);
  } finally {
    rmSync(badProjectRoot, { recursive: true, force: true });
  }
});

test('the spine usage string names the whole v2 command surface; an unknown command exits 1', () => {
  const usage = spine([]);
  const surface = ['graph', 'check', 'set-status <id> <status>', 'ledger', 'launch --scope',
    'plan <parse|check|task>', 'worktree <create|remove>', 'executors [dir]', 'models [defaults.json] [executors-dir]'];
  for (const cmd of surface) {
    assert.ok(usage.includes(cmd), cmd);
  }
  spineFails(['bogus']);
});
