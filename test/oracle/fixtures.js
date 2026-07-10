// Dual-format fixture generator for the parity oracle: one shared JS definition
// emits two disposable temp git repos — YAML-in-markdown for the JS CLI target,
// pure-JSON (ADR-0051) for the Rust target. Extends the create-sample-repo
// seeding idiom (mkdtemp + git init + throwaway user + committed seed).

import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import YAML from 'yaml';

/** @typedef {'yaml' | 'json'} FixtureFormat */

/**
 * Example definition covering all six artifact kinds criterion 1 lists.
 * Task `covers` are canonical 0-based acceptance indices; YAML emission adds 1.
 */
export const EXAMPLE_DEFINITION = {
  design_version: 1,
  features: [
    {
      id: 'alpha',
      section: 'fixture skeleton',
      title: 'Alpha feature',
      status: 'designed',
      depends_on: [],
      acceptance: ['alpha criterion one', 'alpha criterion two'],
      notes: ['alpha design note'],
    },
    {
      id: 'beta',
      title: 'Beta feature',
      status: 'proposed',
      depends_on: ['alpha'],
    },
  ],
  plans: {
    alpha: {
      design_version: 1,
      tasks: [
        {
          id: 'alpha-core',
          title: 'Implement alpha core',
          covers: [0, 1],
          acceptance: 'alpha core satisfies both feature criteria',
          footprint: ['src/alpha.js', 'test/alpha.test.js'],
          size: 's',
          judgment_level: 'standard',
          depends_on: [],
          wiring: 'foundational module the rest of the feature hangs on',
        },
      ],
    },
  },
  settings: {
    'the-loop': {
      modelBindings: { 'build.standard': 'sonnet' },
      testHarness: { command: 'npm test' },
    },
  },
  executors: {
    'fixture-exec': {
      prose: 'Fixture executor playbook for oracle repos.',
      machine: {
        id: 'fixture-exec',
        command: 'fixture-exec',
        models: ['fixture-model'],
        worktree: 'driver-made',
        invocation: 'fixture-exec -m {model} --prompt-file {prompt} --cwd {worktree}',
        availability: 'fixture-exec --version',
        auth_smoke: { run: 'fixture-exec ping', expect: 'PONG' },
        concurrency: 1,
      },
    },
  },
  calibration: [
    {
      stamp: '2026-01-01-1',
      run: {
        prepared_at: '2026-01-01T00:00:00.000Z',
        target: 'main',
        scope: ['alpha'],
        tokens: {
          spent: 1000,
          by_role: { plan: 100, build: 900 },
          attribution: 'sequential',
        },
        halted: null,
      },
      features: [
        {
          id: 'alpha',
          workflow_path: 'small',
          outcome: 'validated',
          reason: null,
          reslice: null,
          agents: { plan: 1, build: 1, drive: 1, validate: 1 },
          tasks: [
            {
              id: 'alpha-core',
              size: 's',
              judgment_level: 'standard',
              footprint: ['src/alpha.js'],
            },
          ],
          actual: {
            files_touched: 2,
            insertions: 50,
            deletions: 0,
            commits: 1,
            duration_minutes: 10,
          },
        },
      ],
    },
  ],
  architecture: {
    title: 'Fixture project',
    validation_procedure: 'Run `npm test` and expect all green.',
    release_runbook: 'Tag the repo and push main; there is no deploy target.',
  },
};

/**
 * Emit one definition's feature graph as a single artifact in the named format —
 * the same emitters buildFixturePair uses, exposed so corpus cases can seed a
 * format-correct file from a shared definition without a full git pair.
 * @param {{ design_version: number, features: object[] }} def
 * @param {FixtureFormat} format
 * @returns {{ rel: string, text: string }}
 */
export function renderFeatureGraph(def, format) {
  return format === 'yaml'
    ? { rel: 'docs/feature-graph.md', text: renderGraphMd(def) }
    : { rel: 'docs/feature-graph.json', text: renderGraphJson(def) };
}

/**
 * Malformed graph bytes in the target's own format — broken YAML fence (unresolved
 * alias) for the JS CLI, broken JSON for the Rust binary. Used by paired check /
 * status --json refusal cases.
 * @param {FixtureFormat} format
 * @returns {{ rel: string, text: string }}
 */
export function renderMalformedGraph(format) {
  if (format === 'yaml') {
    return {
      rel: 'docs/feature-graph.md',
      text: '# Fixture\n\n## Feature graph\n\n```yaml\ndesign_version: 1\nfeatures: *undefinedAlias\n```\n',
    };
  }
  return {
    rel: 'docs/feature-graph.json',
    text: '{ "design_version": 1, features: [\n',
  };
}

/**
 * Shared refusal-catalog graph: bad status, missing acceptance on a non-proposed
 * feature, self-edge, and a two-node cycle. The JSON half also carries an unknown
 * key so Rust's unknown-key refusal is exercised; YAML omits it (JS schema ignores
 * unknown feature keys).
 * @param {FixtureFormat} format
 * @returns {{ design_version: number, features: object[] }}
 */
export function refusalCatalogDefinition(format) {
  return {
    design_version: 1,
    features: [
      {
        id: 'bad-status',
        title: 'Bad status',
        status: 'building',
        depends_on: [],
        acceptance: ['has acceptance so only status fails'],
        ...(format === 'json' && { extra_unknown: true }),
      },
      { id: 'no-acc', title: 'Missing acceptance', status: 'designed', depends_on: [] },
      { id: 'self', title: 'Self edge', status: 'proposed', depends_on: ['self'] },
      { id: 'cyc-a', title: 'Cycle A', status: 'proposed', depends_on: ['cyc-b'] },
      { id: 'cyc-b', title: 'Cycle B', status: 'proposed', depends_on: ['cyc-a'] },
    ],
  };
}

/** @param {'js' | 'rust'} target @returns {FixtureFormat} */
const formatForTarget = (target) => (target === 'rust' ? 'json' : 'yaml');

/** Disposable cwd with one relative file; cleaned up by the oracle driver. */
function seedFile(rel, text) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'oracle-graph-'));
  const full = path.join(cwd, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text);
  return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

/** Seed a malformed graph in the target's own format (broken YAML vs broken JSON). */
export function malformedGraphSetup({ target }) {
  const { rel, text } = renderMalformedGraph(formatForTarget(target));
  return seedFile(rel, text);
}

/**
 * Refusal-catalog graph per target: shared offenses on both halves; unknown key
 * only on the JSON half (raw JSON keeps the key renderFeatureGraph would strip).
 */
export function refusalCatalogSetup({ target }) {
  const format = formatForTarget(target);
  const def = refusalCatalogDefinition(format);
  if (format === 'json') {
    return seedFile('docs/feature-graph.json', `${JSON.stringify(def, null, 2)}\n`);
  }
  const { rel, text } = renderFeatureGraph(def, 'yaml');
  return seedFile(rel, text);
}

/**
 * Emit one calibration run record as a single artifact in the named format.
 * @param {{ stamp: string, run: object, features: object[] }} rec
 * @param {FixtureFormat} format
 * @returns {{ rel: string, text: string }}
 */
export function renderCalibrationRecord(rec, format) {
  return format === 'yaml'
    ? { rel: `docs/calibration/runs/${rec.stamp}.md`, text: renderCalibrationMd(rec) }
    : { rel: `docs/calibration/runs/${rec.stamp}.json`, text: renderCalibrationJson(rec) };
}

/**
 * Build a pair of disposable temp git repos from one shared definition.
 * @param {typeof EXAMPLE_DEFINITION} definition
 * @returns {{ yamlRepo: string, jsonRepo: string }}
 */
export function buildFixturePair(definition) {
  return {
    yamlRepo: buildRepo(definition, 'yaml'),
    jsonRepo: buildRepo(definition, 'json'),
  };
}

/** @param {typeof EXAMPLE_DEFINITION} definition @param {FixtureFormat} format */
function buildRepo(definition, format) {
  const root = mkdtempSync(path.join(tmpdir(), `loop-oracle-${format}-`));
  const git = (cmd) => execSync(cmd, { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  git('git init -q -b main');
  git('git config user.email oracle@the-loop.local');
  git('git config user.name "loop oracle"');

  writeMainArtifacts(root, definition, format);
  git('git add -A');
  git('git commit -qm "fixture: seeded target repository"');

  commitPlansOnFeatureBranches({ root, def: definition, format, git });
  return root;
}

/** @param {string} root @param {typeof EXAMPLE_DEFINITION} def @param {FixtureFormat} format */
function writeMainArtifacts(root, def, format) {
  writeText(root, format === 'yaml' ? 'docs/feature-graph.md' : 'docs/feature-graph.json',
    format === 'yaml' ? renderGraphMd(def) : renderGraphJson(def));
  writeText(root, 'docs/architecture.md', renderArchitecture(def.architecture));
  writeText(root, '.claude/settings.json', `${JSON.stringify(def.settings, null, 2)}\n`);
  writeExecutors(root, def.executors, format);
  writeCalibration(root, def.calibration, format);
}

/** @param {string} root @param {object} executors @param {FixtureFormat} format */
function writeExecutors(root, executors, format) {
  const entries = Object.entries(executors || {});
  for (const [id, playbook] of entries) {
    writeText(root, `config/executors/${id}.md`, renderExecutor(playbook, format));
  }
}

/** @param {string} root @param {object[]} records @param {FixtureFormat} format */
function writeCalibration(root, records, format) {
  const list = records || [];
  for (const rec of list) {
    if (format === 'yaml') {
      writeText(root, `docs/calibration/runs/${rec.stamp}.md`, renderCalibrationMd(rec));
    } else {
      writeText(root, `docs/calibration/runs/${rec.stamp}.json`, renderCalibrationJson(rec));
    }
  }
}

/**
 * @param {{ root: string, def: typeof EXAMPLE_DEFINITION, format: FixtureFormat, git: (cmd: string) => void }} ctx
 */
function commitPlansOnFeatureBranches({ root, def, format, git }) {
  const entries = Object.entries(def.plans || {});
  for (const [featureId, plan] of entries) {
    git(`git checkout -q -b loop/${featureId}`);
    const rel = format === 'yaml'
      ? `docs/plans/${featureId}/plan.md`
      : `docs/plans/${featureId}/plan.json`;
    writeText(root, rel, format === 'yaml' ? renderPlanMd(featureId, plan) : renderPlanJson(featureId, plan));
    git('git add -A');
    git(`git commit -qm "fixture: plan for ${featureId}"`);
    git('git checkout -q main');
  }
}

// ── emitters ──────────────────────────────────────────────────────────────

/** @param {typeof EXAMPLE_DEFINITION} def */
function renderGraphMd(def) {
  const payload = {
    design_version: def.design_version,
    features: def.features.map((f) => featureForEmit(f, false)),
  };
  return `# Fixture — Feature graph

## Feature graph

\`\`\`yaml
${toYaml(payload)}
\`\`\`
`;
}

/** @param {typeof EXAMPLE_DEFINITION} def */
function renderGraphJson(def) {
  const payload = {
    design_version: def.design_version,
    features: def.features.map((f) => featureForEmit(f, true)),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** @param {object} f @param {boolean} includeSection */
function featureForEmit(f, includeSection) {
  return omitUndefined({
    id: f.id,
    ...(includeSection && f.section != null && { section: f.section }),
    title: f.title,
    status: f.status,
    depends_on: f.depends_on ?? [],
    acceptance: f.acceptance,
    notes: f.notes,
  });
}

/** @param {string} featureId @param {object} plan */
function renderPlanMd(featureId, plan) {
  const payload = {
    feature: featureId,
    design_version: plan.design_version,
    tasks: (plan.tasks || []).map((t) => taskForEmit(t, true)),
  };
  return `# ${featureId} — plan

## Tasks

\`\`\`yaml
${toYaml(payload)}
\`\`\`
`;
}

/** @param {string} featureId @param {object} plan */
function renderPlanJson(featureId, plan) {
  const payload = {
    feature: featureId,
    design_version: plan.design_version,
    tasks: (plan.tasks || []).map((t) => taskForEmit(t, false)),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** @param {object} t @param {boolean} oneBasedCovers */
function taskForEmit(t, oneBasedCovers) {
  const covers = t.covers || [];
  return omitUndefined({
    id: t.id,
    title: t.title,
    covers: oneBasedCovers ? covers.map((k) => k + 1) : [...covers],
    acceptance: t.acceptance,
    footprint: t.footprint ?? [],
    size: t.size,
    judgment_level: t.judgment_level,
    depends_on: t.depends_on ?? [],
    wiring: t.wiring,
  });
}

/** @param {object} arch */
function renderArchitecture(arch) {
  const title = arch?.title || 'Fixture project';
  return `# ${title} — Architecture

## Validation procedure

${arch?.validation_procedure || ''}

## Release runbook

${arch?.release_runbook || ''}
`;
}

/** @param {object} playbook @param {FixtureFormat} format */
function renderExecutor(playbook, format) {
  const lang = format === 'yaml' ? 'yaml' : 'json';
  const body = format === 'yaml'
    ? toYaml(playbook.machine)
    : JSON.stringify(playbook.machine, null, 2);
  return `# ${playbook.machine.id}

${playbook.prose || 'Fixture executor.'}

## Machine block

\`\`\`${lang}
${body}
\`\`\`
`;
}

/** @param {object} rec */
function renderCalibrationMd(rec) {
  return `# Calibration run ${rec.stamp}

\`\`\`yaml
${toYaml({ run: rec.run, features: rec.features })}
\`\`\`
`;
}

/** @param {object} rec */
function renderCalibrationJson(rec) {
  return `${JSON.stringify({ run: rec.run, features: rec.features }, null, 2)}\n`;
}

// ── small helpers ─────────────────────────────────────────────────────────

function toYaml(data) {
  return YAML.stringify(data, { lineWidth: 0 }).trimEnd();
}

function omitUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

/** @param {string} root @param {string} rel @param {string} text */
function writeText(root, rel, text) {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text);
}
