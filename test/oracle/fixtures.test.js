// Fixture generator: one shared definition → a disposable pure-JSON temp git repo
// for the oracle (the Rust binary's black-box regression suite). Isolation, all
// artifact kinds, plans on feature branches, and parseable emission are the bar.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildFixtureRepo, EXAMPLE_DEFINITION } from './fixtures.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function withRepo(definition, fn) {
  const root = buildFixtureRepo(definition);
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function git(cwd, args) {
  return execSync(`git ${args}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

test('builds a disposable temp git repo with all artifact kinds, seed committed, plans on feature branches — never this checkout', () => {
  withRepo(EXAMPLE_DEFINITION, (root) => {
    assert.ok(root.startsWith(tmpdir()), `repo must live under os.tmpdir(): ${root}`);
    assert.ok(!root.startsWith(REPO_ROOT), `repo must not live inside the-loop checkout: ${root}`);
    assert.ok(existsSync(path.join(root, '.git')));
    assert.equal(git(root, 'branch --show-current'), 'main');
    assert.equal(git(root, 'status --porcelain'), '');
    assert.ok(existsSync(path.join(root, 'docs/feature-graph.json')));
    assert.ok(existsSync(path.join(root, 'docs/architecture.md')));
    assert.ok(existsSync(path.join(root, '.claude/settings.json')));
    assert.ok(existsSync(path.join(root, 'config/executors/fixture-exec.md')));
    assert.ok(existsSync(path.join(root, 'docs/calibration/runs/2026-01-01-1.json')));

    // Plans live on loop/<feature-id>, not on main.
    assert.ok(git(root, 'show loop/alpha:docs/plans/alpha/plan.json').length > 0);
    assert.ok(!existsSync(path.join(root, 'docs/plans/alpha/plan.json')));
  });
});

test('emitted artifacts are canonical JSON the schema consumers can parse', () => {
  withRepo(EXAMPLE_DEFINITION, (root) => {
    const graph = JSON.parse(readFileSync(path.join(root, 'docs/feature-graph.json'), 'utf8'));
    assert.equal(graph.design_version, EXAMPLE_DEFINITION.design_version);
    const alpha = graph.features.find((f) => f.id === 'alpha');
    assert.equal(alpha.section, 'fixture skeleton');
    assert.deepEqual(alpha.acceptance, ['alpha criterion one', 'alpha criterion two']);

    const plan = JSON.parse(git(root, 'show loop/alpha:docs/plans/alpha/plan.json'));
    assert.equal(plan.feature, 'alpha');
    assert.deepEqual(plan.tasks[0].covers, [0, 1]);

    const record = JSON.parse(readFileSync(path.join(root, 'docs/calibration/runs/2026-01-01-1.json'), 'utf8'));
    assert.ok(record.run);
    assert.ok(Array.isArray(record.features));

    const executor = readFileSync(path.join(root, 'config/executors/fixture-exec.md'), 'utf8');
    const block = executor.match(/```json\n([\s\S]*?)```/);
    assert.ok(block, 'executor playbook carries a fenced json machine block');
    assert.equal(JSON.parse(block[1]).id, 'fixture-exec');
  });
});
