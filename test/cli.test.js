// bin/the-loop.js — the v2 command surface, exercised as a user or an agent would:
// spawned as a real subprocess against throwaway fixture dirs (git repos where the
// command derives state from branches: prepare-execution-context, worktree-create).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const BIN = path.resolve('plugin/bin/the-loop.js');
const spine = (args, opts = {}) => execFileSync('node', [BIN, ...args], { encoding: 'utf8', ...opts });

function spineFails(args, opts = {}) {
  try { spine(args, opts); } catch (error) { assert.equal(error.status, 1); return error; }
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
const cleanup = (...dirs) => { for (const d of dirs) { rmSync(d, { recursive: true, force: true }); } };
const sorted = (xs) => xs.toSorted((a, b) => a.localeCompare(b));
// HOME-isolated runs — never read the real developer's ~/.claude/settings.json.
const emptyHome = () => mkdtempSync(path.join(tmpdir(), 'spine-home-'));
const withHome = (home, opts = {}) => ({ ...opts, env: { ...process.env, HOME: home } });
const loopSettings = (family, value) => JSON.stringify({ 'the-loop': { [family]: value } });

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

// Fixture bodies as single source lines so this file stays under max-lines (content matches the prior multi-line templates).
const GRAPH = `# Fixture — Feature graph\n\n## Feature graph\n\n\`\`\`yaml\ndesign_version: 1\nfeatures:\n  - id: widget\n    title: Widget\n    status: designed\n    depends_on: []\n    acceptance: [renders a widget, persists a widget]\n  - id: gadget\n    title: Gadget\n    status: designed\n    depends_on: [widget]\n    acceptance: renders a gadget\n  - id: base\n    title: Base\n    status: validated\n    depends_on: []\n    acceptance: base works\n\`\`\`\n`;
const DESIGN = `# Fixture — Architecture\n\nNarrative.\n\n## Validation procedure\n\nRun the fixture CLI and expect pong on stdout.\n\n## Release runbook\n\nTag it.\n`;
const PLAN = `# Plan — widget\n\n## Tasks\n\n\`\`\`yaml\nfeature: widget\ndesign_version: 1\ntasks:\n  - id: t1\n    title: Render pipeline\n    covers: [1]\n    acceptance: markup renders\n    footprint: [src/render.js]\n    size: s\n    judgment_level: standard\n    depends_on: []\n  - id: t2\n    title: Persistence\n    covers: [2]\n    acceptance: a widget persists\n    footprint: [src/save.js]\n    size: xs\n    judgment_level: standard\n    depends_on: [t1]\n\`\`\`\n`;

test('spine list prints the parsed model without internals; spine check reports OK/FAIL and sets the exit code', () => {
  const root = fixture({ 'docs/feature-graph.md': GRAPH, 'bad.md': GRAPH.replace('depends_on: [widget]', 'depends_on: [ghost]') });
  try {
    const model = JSON.parse(spine(['list'], { cwd: root }));
    assert.equal(model.designVersion, 1);
    assert.deepEqual(model.features.map((f) => f.id), ['widget', 'gadget', 'base']);
    assert.ok(!('_blocks' in model));
    assert.match(spine(['check'], { cwd: root }), /^OK +3 features/);
    const error = spineFails(['check', 'bad.md'], { cwd: root });
    assert.match(error.stdout, /ERROR dangling-dependency/); assert.match(error.stdout, /^FAIL/m);
  } finally { cleanup(root); }
});

test('spine set-status flips one feature in feature-graph.md and prints it as JSON; an unknown id or out-of-enum status exits 1 and writes nothing', () => {
  const root = fixture({ 'docs/feature-graph.md': GRAPH });
  try {
    const graphPath = path.join(root, 'docs/feature-graph.md');
    const node = JSON.parse(spine(['set-status', 'widget', 'validated'], { cwd: root }));
    assert.equal(node.id, 'widget'); assert.equal(node.status, 'validated');
    const written = readFileSync(graphPath, 'utf8');
    assert.equal(written, GRAPH.replace('status: designed', 'status: validated'));
    spineFails(['set-status', 'ghost', 'validated'], { cwd: root });
    spineFails(['set-status', 'widget', 'building'], { cwd: root });
    assert.equal(readFileSync(graphPath, 'utf8'), written);
  } finally { cleanup(root); }
});


// Default path (no graph-path) is byte-for-byte identical to pre-graph-path-arg behavior.
test('spine set-status and prepare-execution-context with no graph-path still read/write only docs/feature-graph.md', () => {
  const root = gitFixture({ 'docs/feature-graph.md': GRAPH, 'docs/architecture.md': DESIGN, 'docs/designs/widget/design.md': '# widget — design\n' });
  try {
    const defaultPath = path.join(root, 'docs/feature-graph.md');
    assert.equal(readFileSync(defaultPath, 'utf8'), GRAPH);
    assert.equal(JSON.parse(spine(['set-status', 'widget', 'validated'], { cwd: root })).status, 'validated');
    assert.equal(readFileSync(defaultPath, 'utf8'), GRAPH.replace('status: designed', 'status: validated'));
    writeFileSync(defaultPath, GRAPH); // restore designed so prepare-execution-context's scope gate passes
    const home = emptyHome();
    const ctx = JSON.parse(spine(['prepare-execution-context', '--features', 'widget', '--target-branch', 'main'], withHome(home, { cwd: root })));
    assert.deepEqual(ctx.scope, ['widget']);
    assert.equal(ctx.features.widget.designDoc, '# widget — design\n');
    assert.equal(readFileSync(defaultPath, 'utf8'), GRAPH);
  } finally { cleanup(root); }
});

// Supplied path is the sole read/write target — never docs/feature-graph.md.
test('spine set-status [graph-path] reads and writes only the supplied path; docs/feature-graph.md is never created', () => {
  const ALT = GRAPH.replace('title: Widget', 'title: Alt Widget');
  const root = fixture({ 'snapshot/feature-graph.md': ALT });
  try {
    const altPath = path.join(root, 'snapshot/feature-graph.md');
    const defaultPath = path.join(root, 'docs/feature-graph.md');
    assert.ok(!existsSync(defaultPath));
    const node = JSON.parse(spine(['set-status', 'widget', 'validated', 'snapshot/feature-graph.md'], { cwd: root }));
    assert.equal(node.id, 'widget'); assert.equal(node.status, 'validated'); assert.equal(node.title, 'Alt Widget');
    assert.equal(readFileSync(altPath, 'utf8'), ALT.replace('status: designed', 'status: validated'));
    assert.ok(!existsSync(defaultPath));
  } finally { cleanup(root); }
});

test('spine status prints the human-readable status summary to stdout and writes nothing', () => {
  const root = fixture({ 'docs/feature-graph.md': GRAPH });
  try {
    const before = sorted(readdirSync(root, { recursive: true }));
    const story = spine(['status'], { cwd: root });
    assert.match(story, /^# Status — projected from docs\/feature-graph\.md\n/);
    assert.match(story, /Total: 3 feature\(s\) at design_version 1/);
    assert.match(story, /- designed: 2\n- validated: 1\n- shipped: 0/);
    assert.match(story, /\*\*Next:\*\* `widget`/); assert.match(story, /\| gadget \| designed \| Gadget \|/);
    assert.deepEqual(sorted(readdirSync(root, { recursive: true })), before);
    assert.equal(readFileSync(path.join(root, 'docs/feature-graph.md'), 'utf8'), GRAPH);
  } finally { cleanup(root); }
});

test('spine status --json prints the machine orientation: mode, position, eligible set, proposal', () => {
  const root = fixture({ 'docs/feature-graph.md': GRAPH });
  try {
    const o = JSON.parse(spine(['status', '--json'], { cwd: root }));
    assert.equal(o.mode, 'configured'); assert.equal(o.position.total, 3);
    assert.deepEqual(o.eligibleSet, ['widget']); assert.equal(o.proposal.kind, 'advance-eligible-set');
  } finally { cleanup(root); }
});

test('spine plan parse/check/task work against working-tree artifacts; a feature-id mismatch fails the check', () => {
  const root = fixture({ 'docs/feature-graph.md': GRAPH, 'docs/plans/widget/plan.md': PLAN });
  try {
    const plan = JSON.parse(spine(['plan', 'parse', 'widget'], { cwd: root }));
    assert.equal(plan.feature, 'widget'); assert.deepEqual(plan.tasks.map((t) => t.id), ['t1', 't2']);
    assert.match(spine(['plan', 'check', 'widget'], { cwd: root }), /^OK +plan widget: 2 task\(s\)/);
    const brief = JSON.parse(spine(['plan', 'task', 'widget', 't2'], { cwd: root }));
    assert.equal(brief.feature, 'widget'); assert.equal(brief.design_version, 1); assert.equal(brief.task.id, 't2');
    assert.deepEqual(brief.covers_criteria, ['persists a widget']);
    assert.match(spineFails(['plan', 'check', 'gadget', 'docs/plans/widget/plan.md'], { cwd: root }).stdout, /feature-mismatch/);
  } finally { cleanup(root); }
});


test('spine prepare-execution-context refuses a bad scope — unknown id, not-designed, unsatisfied dep — with exit 1 and nothing on stdout', () => {
  const root = fixture({ 'docs/feature-graph.md': GRAPH, 'docs/architecture.md': DESIGN });
  try {
    for (const [features, re] of [['ghost', /unknown-feature/], ['base', /not-designed/], ['gadget', /unsatisfied-dependency/]]) {
      const error = spineFails(['prepare-execution-context', '--features', features, '--target-branch', 'main'], { cwd: root });
      assert.equal(error.stdout, '');
      assert.match(error.stderr, re);
    }
  } finally { cleanup(root); }
});

test('spine prepare-execution-context refuses a missing --target-branch — exit 1, nothing on stdout, usage on stderr', () => {
  const root = fixture({ 'docs/feature-graph.md': GRAPH, 'docs/architecture.md': DESIGN });
  try {
    const error = spineFails(['prepare-execution-context', '--features', 'widget'], { cwd: root });
    assert.equal(error.stdout, ''); assert.match(error.stderr, /--target-branch <ref>/);
  } finally { cleanup(root); }
});

test('spine prepare-execution-context emits the execution context: plan read from the feature branch, builtTasks derived from a task branch head subject', () => {
  const root = gitFixture({ 'docs/feature-graph.md': GRAPH, 'docs/architecture.md': DESIGN, 'docs/designs/widget/design.md': '# widget — design\n' });
  try {
    git(root, 'checkout', '-q', '-b', 'loop/widget');
    commitFile(root, 'docs/plans/widget/plan.md', { contents: PLAN, message: 'widget: plan cut' });
    git(root, 'checkout', '-q', '-b', 'loop/widget--t1');
    commitFile(root, 'src/render.js', { contents: 'export const x = 1;\n', message: 'widget/t1: render pipeline lands' });
    git(root, 'checkout', '-q', 'main');
    const ctx = JSON.parse(spine(['prepare-execution-context', '--features', 'widget,gadget', '--target-branch', 'main'], { cwd: root }));
    const w = ctx.features.widget;
    assert.equal(ctx.target, 'main'); assert.deepEqual(ctx.scope, ['widget', 'gadget']);
    assert.equal(ctx.probe, 'Run the fixture CLI and expect pong on stdout.');
    assert.equal(ctx.models.plan.model, 'session'); assert.match(ctx.cli, /bin\/the-loop\.js/);
    assert.equal(w.branch, 'loop/widget'); assert.equal(w.branchHead, 'widget: plan cut');
    assert.deepEqual(w.plan.tasks.map((t) => t.id), ['t1', 't2']);
    assert.ok(!existsSync(path.join(root, 'docs/plans/widget/plan.md')));
    assert.deepEqual(w.builtTasks, ['t1']); assert.equal(w.designDoc, '# widget — design\n');
    assert.deepEqual(w.acceptance, ['renders a widget', 'persists a widget']);
    assert.equal(ctx.features.gadget.plan, null); assert.equal(ctx.features.gadget.branchHead, null);
    assert.deepEqual(ctx.features.gadget.builtTasks, []);
  } finally { cleanup(root); }
});

test('spine prepare-execution-context falls back to docs/bugs/<id>.md for a fix\'s design doc when docs/designs/<id>/design.md is absent', () => {
  const FIX_GRAPH = `# Fixture — Feature graph\n\n## Feature graph\n\n\`\`\`yaml\ndesign_version: 1\nfeatures:\n  - id: fix-widget\n    title: Widget race fix\n    status: designed\n    depends_on: []\n    acceptance: the race no longer drops an update\n\`\`\`\n`;
  const root = gitFixture({ 'docs/feature-graph.md': FIX_GRAPH, 'docs/architecture.md': DESIGN, 'docs/bugs/fix-widget.md': '# fix-widget — race drops an update\n' });
  try {
    assert.ok(!existsSync(path.join(root, 'docs/designs/fix-widget/design.md')));
    const ctx = JSON.parse(spine(['prepare-execution-context', '--features', 'fix-widget', '--target-branch', 'main'], { cwd: root }));
    assert.equal(ctx.features['fix-widget'].designDoc, '# fix-widget — race drops an update\n');
  } finally { cleanup(root); }
});

// --graph-path is the sole feature-graph read; a different/absent default graph cannot be the source.
test('spine prepare-execution-context --graph-path reads only the supplied graph file, not docs/feature-graph.md', () => {
  const BAD_DEFAULT = GRAPH.replace('status: designed', 'status: proposed');
  const root = gitFixture({ 'docs/feature-graph.md': BAD_DEFAULT, 'snapshot/feature-graph.md': GRAPH, 'docs/architecture.md': DESIGN, 'docs/designs/widget/design.md': '# widget — design\n' });
  try {
    const home = emptyHome();
    const error = spineFails(['prepare-execution-context', '--features', 'widget', '--target-branch', 'main'], withHome(home, { cwd: root }));
    assert.equal(error.stdout, ''); assert.match(error.stderr, /not-designed/);
    const ctx = JSON.parse(spine(['prepare-execution-context', '--features', 'widget', '--target-branch', 'main', '--graph-path', 'snapshot/feature-graph.md'], withHome(home, { cwd: root })));
    assert.deepEqual(ctx.scope, ['widget']); assert.equal(ctx.features.widget.designDoc, '# widget — design\n');
    assert.equal(readFileSync(path.join(root, 'docs/feature-graph.md'), 'utf8'), BAD_DEFAULT);
    assert.equal(readFileSync(path.join(root, 'snapshot/feature-graph.md'), 'utf8'), GRAPH);
  } finally { cleanup(root); }
});

test('spine worktree-create adds .claude/worktrees/<branch> and prints {path, branch, created}; create-existing returns created:false; worktree-remove removes', () => {
  const root = gitFixture({ 'README.md': '# fixture\n' });
  try {
    const created = JSON.parse(spine(['worktree-create', 'loop/widget', '--base-branch', 'main'], { cwd: root }));
    assert.deepEqual(created, { path: path.join('.claude/worktrees', 'loop-widget'), branch: 'loop/widget', created: true });
    assert.ok(existsSync(path.join(root, created.path, 'README.md')));
    assert.deepEqual(JSON.parse(spine(['worktree-create', 'loop/widget'], { cwd: root })), { ...created, created: false });
    assert.deepEqual(JSON.parse(spine(['worktree-remove', created.path], { cwd: root })), { removed: created.path });
    assert.ok(!existsSync(path.join(root, created.path)));

  } finally { cleanup(root); }
});

test('spine worktree-remove also accepts the branch name; an unknown target exits 1 naming it', () => {
  const root = gitFixture({ 'README.md': '# fixture\n' });
  try {
    const created = JSON.parse(spine(['worktree-create', 'loop/widget', '--base-branch', 'main'], { cwd: root }));
    const removed = JSON.parse(spine(['worktree-remove', 'loop/widget'], { cwd: root }));
    assert.ok(removed.removed.endsWith(created.path), removed.removed);
    assert.ok(!existsSync(path.join(root, created.path)));
    assert.match(spineFails(['worktree-remove', 'loop/nonexistent'], { cwd: root }).stderr, /loop\/nonexistent/);
  } finally { cleanup(root); }
});

test('spine worktree-remove refuses when cwd is inside the target worktree, leaving it intact', () => {
  const root = gitFixture({ 'README.md': '# fixture\n' });
  try {
    const created = JSON.parse(spine(['worktree-create', 'loop/widget', '--base-branch', 'main'], { cwd: root }));
    assert.match(spineFails(['worktree-remove', 'loop/widget'], { cwd: path.join(root, created.path) }).stderr, /cd out/);
    assert.ok(existsSync(path.join(root, created.path, 'README.md')));
  } finally { cleanup(root); }
});

// worktreeSetup helpers (ADR-0052) — dense under max-lines.
const bindSetup = (root, value) => commitFile(root, '.claude/settings.json', { contents: loopSettings('worktreeSetup', value), message: 'bind' });
const wtHome = (root, home) => withHome(home, { cwd: root });
const wtCreate = (root, home, branch) => JSON.parse(spine(['worktree-create', branch, '--base-branch', 'main'], wtHome(root, home)));
const wtFails = (root, home, branch) => spineFails(['worktree-create', branch, '--base-branch', 'main'], wtHome(root, home));
const wtRel = (branch) => path.join('.claude/worktrees', branch.replaceAll('/', '-'));

test('spine worktree-create bound worktreeSetup runs via shell in the worktree; created:false never re-runs setup', () => {
  const home = emptyHome(); const root = gitFixture({ 'README.md': '# fixture\n' });
  try {
    bindSetup(root, { command: 'mkdir -p .setup && echo provisioned > .setup/marker && test -f README.md' });
    const created = wtCreate(root, home, 'loop/widget');
    assert.deepEqual(created, { path: wtRel('loop/widget'), branch: 'loop/widget', created: true });
    const marker = path.join(root, created.path, '.setup/marker');
    assert.equal(readFileSync(marker, 'utf8').trim(), 'provisioned');
    rmSync(marker);
    const again = JSON.parse(spine(['worktree-create', 'loop/widget'], wtHome(root, home)));
    assert.deepEqual(again, { ...created, created: false });
    assert.ok(!existsSync(marker));
  } finally { cleanup(root, home); }
});

test('spine worktree-create: non-zero setup tears down worktree (branch lives), exits 1 with details; re-run retries', () => {
  const home = emptyHome(); const root = gitFixture({ 'README.md': '# fixture\n' });
  try {
    bindSetup(root, { command: 'echo boom-stderr-tail >&2; exit 7' });
    const failErr = wtFails(root, home, 'loop/widget'); const failDir = path.join(root, wtRel('loop/widget'));
    assert.match(failErr.stderr, /worktree provisioning failed[\s\S]*echo boom-stderr-tail[\s\S]*loop-widget[\s\S]*project[\s\S]*7[\s\S]*boom-stderr-tail/);
    assert.ok(!existsSync(failDir));
    git(root, 'rev-parse', '--verify', '--quiet', 'refs/heads/loop/widget');
    writeFileSync(path.join(root, '.claude/settings.json'), loopSettings('worktreeSetup', { command: 'echo ok > .setup-retry' }));
    const retry = JSON.parse(spine(['worktree-create', 'loop/widget'], wtHome(root, home)));
    assert.deepEqual(retry, { path: wtRel('loop/widget'), branch: 'loop/widget', created: true });
    assert.equal(readFileSync(path.join(root, retry.path, '.setup-retry'), 'utf8').trim(), 'ok');
  } finally { cleanup(root, home); }
});

test("spine worktree-create: setup timeout is 'timed out after <n>ms' (never exit code); worktree removed", () => {
  const home = emptyHome(); const root = gitFixture({ 'README.md': '# fixture\n' });
  try {
    bindSetup(root, { command: 'sleep 30', timeout: 200 });
    const error = wtFails(root, home, 'loop/timeout'); const gone = path.join(root, wtRel('loop/timeout'));
    assert.match(error.stderr, /worktree provisioning failed[\s\S]*sleep 30[\s\S]*loop-timeout[\s\S]*project[\s\S]*timed out after 200ms/);
    assert.doesNotMatch(error.stderr, /exit code/); assert.ok(!existsSync(gone));
    git(root, 'rev-parse', '--verify', '--quiet', 'refs/heads/loop/timeout');
  } finally { cleanup(root, home); }
});

test('spine worktree-create: malformed worktreeSetup (missing/non-string command) exits 1; no worktree left', () => {
  const home = emptyHome(); const root = gitFixture({ 'README.md': '# fixture\n' });
  try {
    bindSetup(root, { timeout: 1000 });
    const m1 = path.join(root, wtRel('loop/malformed'));
    assert.match(wtFails(root, home, 'loop/malformed').stderr, /worktreeSetup[\s\S]*project[\s\S]*command/);
    assert.ok(!existsSync(m1));
    writeFileSync(path.join(root, '.claude/settings.json'), loopSettings('worktreeSetup', { command: 42 }));
    const m2 = path.join(root, wtRel('loop/malformed2'));
    assert.match(wtFails(root, home, 'loop/malformed2').stderr, /command/); assert.ok(!existsSync(m2));
  } finally { cleanup(root, home); }
});

test('spine worktree-create unbound: no node_modules symlink; fallback is {provisioning:none, provenance:fallback}', () => {
  const home = emptyHome();
  const root = gitFixture({ 'README.md': '# fixture\n', 'package.json': JSON.stringify({ name: 'fixture', private: true }) });
  try {
    mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    writeFileSync(path.join(root, 'node_modules', '.keep'), '');
    const listed = JSON.parse(spine(['hooks-list'], wtHome(root, home)));
    assert.deepEqual(listed.hooks.worktreeSetup, { provisioning: 'none', provenance: 'fallback' });
    const created = wtCreate(root, home, 'loop/unbound');
    assert.deepEqual(created, { path: wtRel('loop/unbound'), branch: 'loop/unbound', created: true });
    assert.ok(existsSync(path.join(root, created.path, 'package.json')));
    assert.ok(!existsSync(path.join(root, created.path, 'node_modules')));
  } finally { cleanup(root, home); }
});

test("spine models-list resolves the shipped plugin defaults relative to bin/the-loop.js's own location, never cwd, and succeeds with no project or local settings present", () => {
  const root = fixture({});
  try {
    const table = JSON.parse(spine(['models-list'], { cwd: root }));
    assert.deepEqual(table.plan, { model: 'session', provenance: 'default' });
  } finally { cleanup(root); }
});

test('spine models-list merges an overridden defaults file with project < local settings overrides (whole-entry replacement), stamping per-role provenance', () => {
  const root = fixture({ 'defaults.json': JSON.stringify({ build: { model: 'opus', effort: 'low' } }) });
  try {
    const defaultsOnly = JSON.parse(spine(['models-list', 'defaults.json'], { cwd: root }));
    assert.deepEqual(defaultsOnly.build, { model: 'opus', effort: 'low', provenance: 'default' });
    mkdirSync(path.join(root, '.claude'), { recursive: true });
    writeFileSync(path.join(root, '.claude/settings.json'), loopSettings('modelBindings', { build: { model: 'haiku' } }));
    assert.deepEqual(JSON.parse(spine(['models-list', 'defaults.json'], { cwd: root })).build, { model: 'haiku', provenance: 'project' });
    writeFileSync(path.join(root, '.claude/settings.local.json'), loopSettings('modelBindings', { build: { model: 'opus', effort: 'high', agent: 'my-builder' } }));
    assert.deepEqual(JSON.parse(spine(['models-list', 'defaults.json'], { cwd: root })).build, { model: 'opus', effort: 'high', agent: 'my-builder', provenance: 'local' });
  } finally { cleanup(root); }
});

test('spine models-list: a resolver rejection or unparseable settings JSON exits 1 naming the offender', () => {
  const badDefaultsRoot = fixture({ 'defaults.json': JSON.stringify({ build: { effort: 'low' } }) });
  try { assert.match(spineFails(['models-list', 'defaults.json'], { cwd: badDefaultsRoot }).stderr, /build.*default/); }
  finally { cleanup(badDefaultsRoot); }
  const badProjectRoot = fixture({ 'defaults.json': '{}' });
  try {
    mkdirSync(path.join(badProjectRoot, '.claude'), { recursive: true });
    writeFileSync(path.join(badProjectRoot, '.claude/settings.json'), '{ not json');
    assert.match(spineFails(['models-list', 'defaults.json'], { cwd: badProjectRoot }).stderr, /\.claude\/settings\.json/);
  } finally { cleanup(badProjectRoot); }
});

test('the spine usage string names the whole v2 command surface; an unknown command exits 1', () => {
  const usage = spine([]);
  for (const cmd of ['status [--json]', 'list', 'check', 'set-status <id> <status>', 'prepare-execution-context --features', '--target-branch <ref>', 'plan <parse|check|task>', 'worktree-create <branch> [--base-branch <ref>]', 'worktree-remove <path-or-branch>', 'executors-list [dir]', 'models-list [defaults.json] [executors-dir]', 'hooks-list', 'hooks-set <family> <layer> <json-value>']) { assert.ok(usage.includes(cmd), cmd); }
  spineFails(['bogus']);
});

test('spine models-list: user layer (HOME/.claude/settings.json) wins over defaults and loses to project/local', () => {
  const home = emptyHome(); const root = fixture({ 'defaults.json': JSON.stringify({ build: { model: 'opus', effort: 'low' } }) });
  try {
    mkdirSync(path.join(home, '.claude'), { recursive: true });
    writeFileSync(path.join(home, '.claude/settings.json'), loopSettings('modelBindings', { build: { model: 'haiku' } }));
    const userTable = JSON.parse(spine(['models-list', 'defaults.json'], withHome(home, { cwd: root })));
    assert.deepEqual(userTable.build, { model: 'haiku', provenance: 'user' });
    mkdirSync(path.join(root, '.claude'), { recursive: true });
    writeFileSync(path.join(root, '.claude/settings.json'), loopSettings('modelBindings', { build: { model: 'sonnet' } }));
    const projectTable = JSON.parse(spine(['models-list', 'defaults.json'], withHome(home, { cwd: root })));
    assert.deepEqual(projectTable.build, { model: 'sonnet', provenance: 'project' });
    writeFileSync(path.join(root, '.claude/settings.local.json'), loopSettings('modelBindings', { build: { model: 'opus', effort: 'high' } }));
    const localTable = JSON.parse(spine(['models-list', 'defaults.json'], withHome(home, { cwd: root })));
    assert.deepEqual(localTable.build, { model: 'opus', effort: 'high', provenance: 'local' });
  } finally { cleanup(root, home); }
});

test('spine models-list: unparseable user-layer JSON exits 1 naming the file', () => {
  const home = emptyHome(); const root = fixture({ 'defaults.json': '{}' });
  try {
    mkdirSync(path.join(home, '.claude'), { recursive: true });
    writeFileSync(path.join(home, '.claude/settings.json'), '{ not json');
    assert.match(spineFails(['models-list', 'defaults.json'], withHome(home, { cwd: root })).stderr, /settings\.json/);
  } finally { cleanup(root, home); }
});
