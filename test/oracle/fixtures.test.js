// Dual-format fixture generator: one shared definition → disposable YAML + JSON
// temp git repos for the parity oracle. Isolation, dual emission, and parser
// equivalence (graph + plan) are the acceptance bar.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// These plugin/src imports are assertion-side only: the equivalence test's own
// acceptance mandates parsing the YAML variant "with the existing JS parsers" and
// deep-equalling it against the JSON variant. The oracle's never-import-in-process
// contract governs *driving* the binary under test (subprocess only, via the
// driver); computing expected values with the parsers does not touch that path.
import { parse } from '../../plugin/src/parse-feature-graph.js';
import { parsePlan } from '../../plugin/src/plan.js';
import { buildFixturePair, EXAMPLE_DEFINITION } from './fixtures.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function withPair(definition, fn) {
  const pair = buildFixturePair(definition);
  try {
    return fn(pair);
  } finally {
    rmSync(pair.yamlRepo, { recursive: true, force: true });
    rmSync(pair.jsonRepo, { recursive: true, force: true });
  }
}

function git(cwd, args) {
  return execSync(`git ${args}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function projectGraphFromJs(model) {
  return {
    designVersion: model.designVersion,
    features: model.features.map((f) => ({
      id: f.id,
      title: f.title,
      status: f.status,
      depends_on: f.depends_on,
      acceptance: f.acceptance,
      ...(f.notes != null && { notes: f.notes }),
    })),
  };
}

function projectGraphFromJson(obj) {
  return {
    designVersion: obj.design_version,
    features: (obj.features || []).map((f) => ({
      id: f.id,
      title: f.title,
      status: f.status,
      depends_on: f.depends_on || [],
      acceptance: f.acceptance,
      ...(f.notes != null && { notes: f.notes }),
    })),
  };
}

function projectPlanFromJs(model) {
  return {
    feature: model.feature,
    designVersion: model.designVersion,
    tasks: model.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      covers: (t.covers || []).map((k) => k - 1),
      acceptance: t.acceptance,
      footprint: t.footprint,
      size: t.size,
      depends_on: t.depends_on,
      ...(t.judgment_level != null && { judgment_level: t.judgment_level }),
      ...(t.wiring != null && { wiring: t.wiring }),
    })),
  };
}

function projectPlanFromJson(obj) {
  return {
    feature: obj.feature,
    designVersion: obj.design_version,
    tasks: (obj.tasks || []).map((t) => ({
      id: t.id,
      title: t.title,
      covers: t.covers || [],
      acceptance: t.acceptance,
      footprint: t.footprint || [],
      size: t.size,
      depends_on: t.depends_on || [],
      ...(t.judgment_level != null && { judgment_level: t.judgment_level }),
      ...(t.wiring != null && { wiring: t.wiring }),
    })),
  };
}

// ── AC1: disposable temp git repos from one shared definition ─────────────

test('AC1: builds disposable temp git repos with all six artifact kinds, seed committed, plans on feature branches — never this checkout', () => {
  withPair(EXAMPLE_DEFINITION, ({ yamlRepo, jsonRepo }) => {
    for (const root of [yamlRepo, jsonRepo]) {
      assert.ok(root.startsWith(tmpdir()), `repo must live under os.tmpdir(): ${root}`);
      assert.ok(!root.startsWith(REPO_ROOT), `repo must not live inside the-loop checkout: ${root}`);
      assert.ok(existsSync(path.join(root, '.git')));
      assert.equal(git(root, 'branch --show-current'), 'main');
      assert.equal(git(root, 'status --porcelain'), '');
      assert.ok(existsSync(path.join(root, 'docs/architecture.md')));
      assert.ok(existsSync(path.join(root, '.claude/settings.json')));
      assert.ok(existsSync(path.join(root, 'config/executors/fixture-exec.md')));
      assert.ok(
        existsSync(path.join(root, 'docs/architecture.md'))
          && (existsSync(path.join(root, 'docs/feature-graph.md'))
            || existsSync(path.join(root, 'docs/feature-graph.json'))),
      );
    }

    // Plans live on loop/<feature-id>, not on main.
    assert.equal(
      git(yamlRepo, 'show loop/alpha:docs/plans/alpha/plan.md').length > 0,
      true,
    );
    assert.equal(
      git(jsonRepo, 'show loop/alpha:docs/plans/alpha/plan.json').length > 0,
      true,
    );
    assert.ok(!existsSync(path.join(yamlRepo, 'docs/plans/alpha/plan.md')));
    assert.ok(!existsSync(path.join(jsonRepo, 'docs/plans/alpha/plan.json')));

    // Calibration present in each variant's format.
    assert.ok(existsSync(path.join(yamlRepo, 'docs/calibration/runs/2026-01-01-1.md')));
    assert.ok(existsSync(path.join(jsonRepo, 'docs/calibration/runs/2026-01-01-1.json')));
  });
});

// ── AC2: one definition → two format variants, never hand-maintained trees ─

test('AC2: one definition emits YAML-in-markdown and pure-JSON variants from the same data', () => {
  withPair(EXAMPLE_DEFINITION, ({ yamlRepo, jsonRepo }) => {
    assert.ok(existsSync(path.join(yamlRepo, 'docs/feature-graph.md')));
    assert.ok(!existsSync(path.join(yamlRepo, 'docs/feature-graph.json')));
    assert.ok(existsSync(path.join(jsonRepo, 'docs/feature-graph.json')));
    assert.ok(!existsSync(path.join(jsonRepo, 'docs/feature-graph.md')));

    const yamlGraph = readFileSync(path.join(yamlRepo, 'docs/feature-graph.md'), 'utf8');
    assert.match(yamlGraph, /## Feature graph/);
    assert.match(yamlGraph, /```ya?ml\b/);

    const jsonGraph = JSON.parse(readFileSync(path.join(jsonRepo, 'docs/feature-graph.json'), 'utf8'));
    assert.equal(jsonGraph.design_version, EXAMPLE_DEFINITION.design_version);
    assert.equal(jsonGraph.features.length, EXAMPLE_DEFINITION.features.length);

    // Executor: yaml fence vs json fence, same machine fields.
    const yamlExec = readFileSync(path.join(yamlRepo, 'config/executors/fixture-exec.md'), 'utf8');
    const jsonExec = readFileSync(path.join(jsonRepo, 'config/executors/fixture-exec.md'), 'utf8');
    assert.match(yamlExec, /## Machine block/);
    assert.match(yamlExec, /```ya?ml\b/);
    assert.match(jsonExec, /## Machine block/);
    assert.match(jsonExec, /```json\b/);

    // Settings are plain JSON and identical across variants.
    const settingsY = JSON.parse(readFileSync(path.join(yamlRepo, '.claude/settings.json'), 'utf8'));
    const settingsJ = JSON.parse(readFileSync(path.join(jsonRepo, '.claude/settings.json'), 'utf8'));
    assert.deepEqual(settingsY, settingsJ);
    assert.deepEqual(settingsY, EXAMPLE_DEFINITION.settings);

    // Plan covers: YAML side 1-based, JSON side 0-based, same criteria.
    const planMd = git(yamlRepo, 'show loop/alpha:docs/plans/alpha/plan.md');
    const planJson = JSON.parse(git(jsonRepo, 'show loop/alpha:docs/plans/alpha/plan.json'));
    const parsedYamlPlan = parsePlan(planMd);
    assert.deepEqual(parsedYamlPlan.tasks[0].covers, [1, 2]);
    assert.deepEqual(planJson.tasks[0].covers, [0, 1]);
  });
});

// ── AC3: parser-based semantic equivalence for graph + plan ───────────────

test('AC3: YAML variant parsed by JS parsers deep-equals JSON variant content (graph + plan)', () => {
  withPair(EXAMPLE_DEFINITION, ({ yamlRepo, jsonRepo }) => {
    const graphMd = readFileSync(path.join(yamlRepo, 'docs/feature-graph.md'), 'utf8');
    const graphJson = JSON.parse(
      readFileSync(path.join(jsonRepo, 'docs/feature-graph.json'), 'utf8'),
    );
    assert.deepEqual(projectGraphFromJs(parse(graphMd)), projectGraphFromJson(graphJson));

    const planMd = git(yamlRepo, 'show loop/alpha:docs/plans/alpha/plan.md');
    const planJson = JSON.parse(git(jsonRepo, 'show loop/alpha:docs/plans/alpha/plan.json'));
    assert.deepEqual(projectPlanFromJs(parsePlan(planMd)), projectPlanFromJson(planJson));
  });
});
