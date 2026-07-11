// Fixture generator for the oracle — the Rust binary's black-box regression suite
// since json-cutover: one shared JS definition emits a disposable temp git repo of
// pure-JSON artifacts (ADR-0051). Extends the create-sample-repo seeding idiom
// (mkdtemp + git init + throwaway user + committed seed).

import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Example definition covering all six artifact kinds criterion 1 lists.
 * Task `covers` are canonical 0-based acceptance indices.
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
 * Emit one definition's feature graph as a single artifact — the same emitter
 * buildFixtureRepo uses, exposed so corpus cases can seed a file from a shared
 * definition without a full git repo.
 * @param {{ design_version: number, features: object[] }} def
 * @returns {{ rel: string, text: string }}
 */
export function renderFeatureGraph(def) {
  return { rel: 'docs/feature-graph.json', text: renderGraphJson(def) };
}

/**
 * Malformed graph bytes (broken JSON). Used by check / status --json refusal cases.
 * @returns {{ rel: string, text: string }}
 */
export function renderMalformedGraph() {
  return {
    rel: 'docs/feature-graph.json',
    text: '{ "design_version": 1, features: [\n',
  };
}

/**
 * Shared refusal-catalog graph: bad status, missing acceptance on a non-proposed
 * feature, self-edge, a two-node cycle, and an unknown key (unknown-key refusal).
 * @returns {{ design_version: number, features: object[] }}
 */
export function refusalCatalogDefinition() {
  return {
    design_version: 1,
    features: [
      {
        id: 'bad-status',
        title: 'Bad status',
        status: 'building',
        depends_on: [],
        acceptance: ['has acceptance so only status fails'],
        extra_unknown: true,
      },
      { id: 'no-acc', title: 'Missing acceptance', status: 'designed', depends_on: [] },
      { id: 'self', title: 'Self edge', status: 'proposed', depends_on: ['self'] },
      { id: 'cyc-a', title: 'Cycle A', status: 'proposed', depends_on: ['cyc-b'] },
      { id: 'cyc-b', title: 'Cycle B', status: 'proposed', depends_on: ['cyc-a'] },
    ],
  };
}

/** Disposable cwd with one relative file; cleaned up by the oracle driver. */
function seedFile(rel, text) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'oracle-graph-'));
  const full = path.join(cwd, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text);
  return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

/** Seed a malformed graph (broken JSON). */
export function malformedGraphSetup() {
  const { rel, text } = renderMalformedGraph();
  return seedFile(rel, text);
}

/** Refusal-catalog graph (raw JSON keeps the unknown key renderFeatureGraph would strip). */
export function refusalCatalogSetup() {
  const def = refusalCatalogDefinition();
  return seedFile('docs/feature-graph.json', `${JSON.stringify(def, null, 2)}\n`);
}

/**
 * Emit one calibration run record as a single artifact.
 * @param {{ stamp: string, run: object, features: object[] }} rec
 * @returns {{ rel: string, text: string }}
 */
export function renderCalibrationRecord(rec) {
  return { rel: `docs/calibration/runs/${rec.stamp}.json`, text: renderCalibrationJson(rec) };
}

/**
 * Build a disposable temp git repo from one shared definition.
 * @param {typeof EXAMPLE_DEFINITION} definition
 * @returns {string} repo root
 */
export function buildFixtureRepo(definition) {
  const root = mkdtempSync(path.join(tmpdir(), 'loop-oracle-'));
  const git = (cmd) => execSync(cmd, { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  git('git init -q -b main');
  git('git config user.email oracle@the-loop.local');
  git('git config user.name "loop oracle"');

  writeMainArtifacts(root, definition);
  git('git add -A');
  git('git commit -qm "fixture: seeded target repository"');

  commitPlansOnFeatureBranches({ root, def: definition, git });
  return root;
}

/** @param {string} root @param {typeof EXAMPLE_DEFINITION} def */
function writeMainArtifacts(root, def) {
  writeText(root, 'docs/feature-graph.json', renderGraphJson(def));
  writeText(root, 'docs/architecture.md', renderArchitecture(def.architecture));
  writeText(root, '.claude/settings.json', `${JSON.stringify(def.settings, null, 2)}\n`);
  const executors = Object.entries(def.executors || {});
  for (const [id, playbook] of executors) {
    writeText(root, `config/executors/${id}.md`, renderExecutor(playbook));
  }
  const records = def.calibration || [];
  for (const rec of records) {
    writeText(root, `docs/calibration/runs/${rec.stamp}.json`, renderCalibrationJson(rec));
  }
}

/**
 * @param {{ root: string, def: typeof EXAMPLE_DEFINITION, git: (cmd: string) => void }} ctx
 */
function commitPlansOnFeatureBranches({ root, def, git }) {
  const entries = Object.entries(def.plans || {});
  for (const [featureId, plan] of entries) {
    git(`git checkout -q -b loop/${featureId}`);
    writeText(root, `docs/plans/${featureId}/plan.json`, renderPlanJson(featureId, plan));
    git('git add -A');
    git(`git commit -qm "fixture: plan for ${featureId}"`);
    git('git checkout -q main');
  }
}

// ── emitters ──────────────────────────────────────────────────────────────

/** @param {typeof EXAMPLE_DEFINITION} def */
function renderGraphJson(def) {
  const payload = {
    design_version: def.design_version,
    features: def.features.map((f) => featureForEmit(f)),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** @param {object} f */
function featureForEmit(f) {
  return omitUndefined({
    id: f.id,
    ...(f.section != null && { section: f.section }),
    title: f.title,
    status: f.status,
    depends_on: f.depends_on ?? [],
    acceptance: f.acceptance,
    notes: f.notes,
  });
}

/** @param {string} featureId @param {object} plan */
export function renderPlanJson(featureId, plan) {
  const payload = {
    feature: featureId,
    design_version: plan.design_version,
    tasks: (plan.tasks || []).map((t) => taskForEmit(t)),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** @param {object} t */
function taskForEmit(t) {
  return omitUndefined({
    id: t.id,
    title: t.title,
    covers: [...(t.covers || [])],
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

/** @param {object} playbook */
function renderExecutor(playbook) {
  return `# ${playbook.machine.id}

${playbook.prose || 'Fixture executor.'}

## Machine block

\`\`\`json
${JSON.stringify(playbook.machine, null, 2)}
\`\`\`
`;
}

/** @param {object} rec */
function renderCalibrationJson(rec) {
  return `${JSON.stringify({ run: rec.run, features: rec.features }, null, 2)}\n`;
}

// ── small helpers ─────────────────────────────────────────────────────────

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
