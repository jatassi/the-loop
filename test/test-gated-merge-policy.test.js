// ADR-0042's test-gated merge policy (agents/build.md, agents/validate.md) is
// judgment carried out by a merging agent, not code, so it can't be unit-tested
// directly. This fixture proves the mechanism that judgment leans on is real: git
// names the conflicting path(s) on a textual conflict; writing one resolution that
// serves both sides' stated intents and proving it against the merged suite lands
// both edits when the intents are compatible; the same recipe correctly refuses to
// compose — returning blocked and naming the path — when the intents are genuinely
// contradictory and no resolution can satisfy both suites at once.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

function writeFileAt(root, rel, contents) {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

function commit(root, message) {
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', message);
}

const toyTest = (name, assertion) => `${[
  "const assert = require('node:assert/strict');",
  "const { test } = require('node:test');",
  "const registry = require('../lib/registry.js');",
  `test('${name}', () => { assert.equal(${assertion}); });`,
].join('\n')}\n`;

// A base repo plus two branches (the shape a build agent's sibling merge produces)
// that each redefine the same line of a shared registration file — the hub-file
// shape ADR-0042 targets — and add their own test proving their own edit landed.
function twoBranchFixture({ entryA, entryB, testA, testB }) {
  const root = mkdtempSync(path.join(tmpdir(), 'test-gated-merge-policy-fixture-'));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'fixture@the-loop.local');
  git(root, 'config', 'user.name', 'test-gated-merge-policy fixture');
  writeFileAt(root, 'lib/registry.js', 'module.exports = {\n  // ENTRIES\n};\n');
  writeFileAt(root, 'test/base.test.js', toyTest('base sanity', 'true, Boolean(registry)'));
  commit(root, 'seed');

  git(root, 'checkout', '-qb', 'task-a');
  writeFileAt(root, 'lib/registry.js', `module.exports = {\n  ${entryA}\n};\n`);
  writeFileAt(root, 'test/a.test.js', testA);
  commit(root, 'a: register');

  git(root, 'checkout', '-qb', 'task-b', 'main');
  writeFileAt(root, 'lib/registry.js', `module.exports = {\n  ${entryB}\n};\n`);
  writeFileAt(root, 'test/b.test.js', testB);
  commit(root, 'b: register');

  return root;
}

// Runs node's own test runner as "the merged suite" — the oracle a resolution must
// satisfy before it counts as composed. Named test files are passed explicitly
// (node:test's directory discovery isn't reliable across a nested invocation) and
// the outer runner's own child-process markers are stripped so this nested run isn't
// mistaken for a recursive call of the suite already in progress and skipped.
function suiteGoesGreen(root) {
  const testDir = path.join(root, 'test');
  const files = readdirSync(testDir).map((f) => path.join('test', f));
  const { NODE_TEST_CONTEXT: _ctx, NODE_TEST_WORKER_ID: _worker, ...env } = process.env;
  try {
    execFileSync('node', ['--test', ...files], { cwd: root, encoding: 'utf8', env });
    return true;
  } catch {
    return false;
  }
}

function tryMerge(root, sibling) {
  try {
    git(root, 'merge', '--no-commit', '--no-ff', sibling);
    return false; // merged clean — no textual conflict
  } catch (error) {
    if (error.status === 1) { return true; } // conflicted, as the fixture expects
    throw error;
  }
}

// The test-gated merge policy's recipe (ADR-0042), enacted mechanically for one
// candidate resolution: merge the sibling branch onto the base; on a textual
// conflict, write the candidate resolution over the conflicting path(s) and prove it
// against the suite; commit only if it goes green, otherwise abandon and name the
// path(s).
function applyTestGatedMergePolicy(root, { base, sibling, resolution }) {
  git(root, 'checkout', '-q', base);
  const conflicted = tryMerge(root, sibling);
  assert.ok(conflicted, 'fixture setup expected a textual conflict on the shared file');
  const conflicting = git(root, 'diff', '--name-only', '--diff-filter=U').trim().split('\n').filter(Boolean);

  for (const rel of conflicting) { writeFileAt(root, rel, resolution); }
  git(root, 'add', ...conflicting);
  if (suiteGoesGreen(root)) {
    commit(root, `merge ${sibling} (composed)`);
    return { result: 'composed', paths: conflicting };
  }
  git(root, 'merge', '--abort');
  return { result: 'blocked', kind: 'feature', detail: `semantic conflict — cannot compose ${conflicting.join(', ')}` };
}

test('a composable conflict — two branches add distinct entries to a shared registration file — lands both edits with the suite green', () => {
  const root = twoBranchFixture({
    entryA: 'alpha: 1,',
    entryB: 'beta: 2,',
    testA: toyTest('alpha lands', 'registry.alpha, 1'),
    testB: toyTest('beta lands', 'registry.beta, 2'),
  });
  try {
    const outcome = applyTestGatedMergePolicy(root, {
      base: 'task-a', sibling: 'task-b',
      resolution: 'module.exports = {\n  alpha: 1,\n  beta: 2,\n};\n',
    });
    assert.deepEqual(outcome, { result: 'composed', paths: ['lib/registry.js'] });
    assert.equal(readFileSync(path.join(root, 'lib/registry.js'), 'utf8'), 'module.exports = {\n  alpha: 1,\n  beta: 2,\n};\n');
    assert.ok(suiteGoesGreen(root)); // base + a.test.js + b.test.js all ride the merged tree, green
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a non-composable conflict — two branches redefine the same field to contradictory values — returns blocked naming the conflicting path', () => {
  const root = twoBranchFixture({
    entryA: "value: 'x',",
    entryB: "value: 'y',",
    testA: toyTest('x lands', "registry.value, 'x'"),
    testB: toyTest('y lands', "registry.value, 'y'"),
  });
  try {
    const outcome = applyTestGatedMergePolicy(root, {
      base: 'task-a', sibling: 'task-b',
      resolution: "module.exports = {\n  value: 'x',\n};\n", // the best single candidate — still fails the other side
    });
    assert.equal(outcome.result, 'blocked');
    assert.equal(outcome.kind, 'feature');
    assert.match(outcome.detail, /lib\/registry\.js/);
    assert.equal(git(root, 'status', '--porcelain').trim(), ''); // the abort left no partial state
    assert.equal(readFileSync(path.join(root, 'lib/registry.js'), 'utf8'), "module.exports = {\n  value: 'x',\n};\n"); // task-a's own content, untouched
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
