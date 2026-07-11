// Case corpus for artifact-writing CLI commands: set-status, hooks-set, and
// calibration-summarize. Each case shells out via the oracle driver against a
// per-case disposable fixture tree and asserts only observable outputs —
// stdout, exit code, stderr presence, and files written (or left unwritten).
// Format-sensitive fixtures (the feature graph, calibration records) are emitted
// per target from one shared definition via the fixtures.js emitters — YAML for
// the JS CLI, pure JSON for the Rust binary; settings files are format-neutral.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import YAML from 'yaml';

import { renderIndex } from '../../../plugin/src/calibration-summarize.js';
import { bytesEqual } from '../compare.js';
import { renderCalibrationRecord, renderFeatureGraph } from '../fixtures.js';

// ── Shared definitions (one source; per-target emission picks the format) ──

const GRAPH_DEF = {
  design_version: 1,
  features: [
    { id: 'widget', title: 'Widget', status: 'designed', depends_on: [], acceptance: ['renders a widget', 'persists a widget'] },
    { id: 'gadget', title: 'Gadget', status: 'designed', depends_on: ['widget'], acceptance: ['renders a gadget'] },
    { id: 'base', title: 'Base', status: 'validated', depends_on: [], acceptance: ['base works'] },
  ],
};

const RECORD_A = {
  stamp: '2026-07-01-1',
  run: {
    prepared_at: '2026-07-01T10:00:00Z',
    target: 'main',
    scope: ['f-a'],
    tokens: { spent: 100_000, by_role: { plan: 20_000, build: 70_000, validate: 10_000 }, attribution: 'serial' },
    halted: null,
  },
  features: [
    {
      id: 'f-a',
      workflow_path: 'standard',
      outcome: 'validated',
      reason: null,
      reslice: null,
      agents: { plan: 1, build: 3, drive: 0, validate: 1 },
      tasks: [{ id: 't1', size: 's', judgment_level: 'standard', footprint: ['a.js', 'a.test.js'] }],
      actual: { files_touched: 3, insertions: 50, deletions: 5, commits: 2, duration_minutes: 20 },
    },
  ],
};

const RECORD_B = {
  stamp: '2026-07-02-1',
  run: {
    prepared_at: '2026-07-02T09:00:00Z',
    target: 'main',
    scope: ['f-b'],
    tokens: { spent: 10_000, by_role: { plan: 5000, build: 5000 }, attribution: 'overlapped' },
    halted: null,
  },
  features: [
    {
      id: 'f-b',
      workflow_path: 'small',
      outcome: 'blocked',
      reason: 'dep conflict on parser',
      reslice: 't1 split into two',
      agents: { plan: 1, build: 1 },
      tasks: [{ id: 't1', size: 's', judgment_level: 'standard', footprint: ['b.js'] }],
      actual: null,
    },
  ],
};

// A malformed record is malformed *in the target's own format* — a broken YAML
// fence for the JS CLI, broken JSON for the Rust binary.
const BAD_RECORD_BY_FORMAT = {
  yaml: {
    rel: 'docs/calibration/runs/2026-07-02-1.md',
    text: ['# broken', '', '```yaml', 'run: [this: is, : not valid', '```', ''].join('\n'),
  },
  json: {
    rel: 'docs/calibration/runs/2026-07-02-1.json',
    text: '{ "run": [this is not valid json\n',
  },
};

/** @param {'js' | 'rust'} target @returns {'yaml' | 'json'} */
const formatFor = (target) => (target === 'rust' ? 'json' : 'yaml');

// Exact pre-seed used by cli-hooks unrelated-keys-survive (quirky formatting).
const SETTINGS_WITH_UNRELATED = `{
  "permissions": {
    "allow": ["Bash"]
  },
  "env": {
    "FOO": "bar"
  },
  "the-loop": {
    "modelBindings": {
      "build": {
        "model": "opus"
      }
    },
    "lint": {
      "command": "old-lint"
    }
  }
}
`;

const SETTINGS_SEEDED = `${JSON.stringify({ keep: true, 'the-loop': { lint: { command: 'x' } } }, null, 2)}\n`;

// ── Fixture helpers ──

/**
 * Build a disposable temp dir seeded with relative-path → contents, cleaned up
 * by the driver after the case (pass or fail).
 * @param {Record<string, string>} files
 * @returns {{ cwd: string, cleanup: () => void }}
 */
function fixture(files) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'oracle-write-'));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(cwd, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return {
    cwd,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

/** Seed the shared graph definition in the target's own format. */
function graphSetup({ target }) {
  const { rel, text } = renderFeatureGraph(GRAPH_DEF, formatFor(target));
  return fixture({ [rel]: text });
}

/** Seed calibration run records in the target's own format. */
function calibrationSetup(records) {
  return ({ target }) => {
    const entries = records.map((r) => renderRecordEntry(r, formatFor(target)));
    return fixture(Object.fromEntries(entries.map(({ rel, text }) => [rel, text])));
  };
}

/** @param {object} recOrRaw @param {'yaml' | 'json'} format */
function renderRecordEntry(recOrRaw, format) {
  return recOrRaw === 'BAD' ? BAD_RECORD_BY_FORMAT[format] : renderCalibrationRecord(recOrRaw, format);
}

/** @param {string} cwd @param {string} rel */
function readText(cwd, rel) {
  return readFileSync(path.join(cwd, rel), 'utf8');
}

/** Fail when a relative path's bytes differ from a known seed. @returns {string|void} */
function assertUnchanged(cwd, rel, seed) {
  if (!existsSync(path.join(cwd, rel))) {
    return `${rel} missing after refusal (expected unchanged seed)`;
  }
  if (!bytesEqual(readText(cwd, rel), seed)) {
    return `${rel} was modified on refusal`;
  }
}

/** Fail when a relative path exists. @returns {string|void} */
function assertAbsent(cwd, rel) {
  if (existsSync(path.join(cwd, rel))) {
    return `${rel} should not exist after refusal`;
  }
}

/**
 * Parse the graph artifact under cwd in whichever format was seeded — the
 * fenced-yaml markdown for the JS variant, pure JSON for the Rust variant.
 * @param {string} cwd
 * @returns {object}
 */
function parseGraphArtifact(cwd) {
  if (existsSync(path.join(cwd, 'docs/feature-graph.json'))) {
    return JSON.parse(readText(cwd, 'docs/feature-graph.json'));
  }
  const text = readText(cwd, 'docs/feature-graph.md');
  const match = text.match(/```yaml\n([\s\S]*?)\n```/);
  if (!match) {
    throw new Error('no fenced yaml block in feature-graph.md');
  }
  return YAML.parse(match[1]);
}

/** The graph artifact's seeded bytes for whichever variant is on the tree. */
function seededGraph(cwd) {
  const format = existsSync(path.join(cwd, 'docs/feature-graph.json')) ? 'json' : 'yaml';
  return renderFeatureGraph(GRAPH_DEF, format);
}

/** @param {object} byId @param {string} id @param {string} want @returns {string|void} */
function assertFeatureStatus(byId, id, want) {
  const got = byId[id]?.status;
  if (got !== want) {
    return `${id}.status is ${got}, expected ${want}`;
  }
}

/** @returns {string|void} */
function assertWidgetValidated(cwd) {
  const model = parseGraphArtifact(cwd);
  const byId = Object.fromEntries((model.features || []).map((f) => [f.id, f]));
  if (model.design_version !== 1) {
    return `design_version changed to ${model.design_version}`;
  }
  return assertFeatureStatus(byId, 'widget', 'validated')
    || assertFeatureStatus(byId, 'gadget', 'designed')
    || assertFeatureStatus(byId, 'base', 'validated');
}

/** @returns {string|void} */
function assertGraphUnwritten(cwd) {
  const { rel, text } = seededGraph(cwd);
  return assertUnchanged(cwd, rel, text);
}

/**
 * Expected index.md bytes from the JS renderer over RECORD_A/B in yaml form —
 * what the JS CLI itself would emit for this corpus, used as a cross-target oracle.
 */
function expectedCalibrationIndex() {
  const records = [RECORD_A, RECORD_B].map((rec) => {
    const { rel, text } = renderCalibrationRecord(rec, 'yaml');
    return { file: rel, text };
  });
  return renderIndex(records);
}

/** @returns {string|void} */
function assertCalibrationIndex(cwd) {
  const indexPath = path.join(cwd, 'docs/calibration/index.md');
  if (!existsSync(indexPath)) {
    return 'docs/calibration/index.md was not written';
  }
  const text = readFileSync(indexPath, 'utf8');
  if (!bytesEqual(text, expectedCalibrationIndex())) {
    return 'docs/calibration/index.md is not byte-identical to JS renderIndex output';
  }
}

// ── Expected JSON values ──

const WIDGET_VALIDATED = {
  id: 'widget',
  title: 'Widget',
  status: 'validated',
  depends_on: [],
  acceptance: ['renders a widget', 'persists a widget'],
};

const HOOKS_SET_STDOUT = {
  family: 'testHarness',
  layer: 'project',
  file: path.join('.claude', 'settings.json'),
  value: { command: 'npm test' },
};

const HOOKS_SET_FILE = {
  'the-loop': { testHarness: { command: 'npm test' } },
};

const HOOKS_SET_SURVIVE_FILE = {
  permissions: { allow: ['Bash'] },
  env: { FOO: 'bar' },
  'the-loop': {
    modelBindings: { build: { model: 'opus' } },
    lint: { command: 'old-lint' },
    testHarness: { command: 'npm test' },
  },
};

// ── Case table ──

export const cases = [
  // ── set-status ──
  {
    command: 'set-status',
    scenario: 'happy path: flip widget designed → validated and print the node',
    argv: ['set-status', 'widget', 'validated'],
    setup: graphSetup,
    expect: {
      exitCode: 0,
      stdout: WIDGET_VALIDATED,
      stderr: 'absent',
      effects: assertWidgetValidated,
    },
  },
  {
    command: 'set-status',
    scenario: 'refusal: unknown feature id leaves the graph unwritten',
    argv: ['set-status', 'ghost', 'validated'],
    setup: graphSetup,
    expect: {
      exitCode: 1,
      stderr: 'present',
      effects: assertGraphUnwritten,
    },
  },
  {
    command: 'set-status',
    scenario: 'refusal: out-of-enum status leaves the graph unwritten',
    argv: ['set-status', 'widget', 'building'],
    setup: graphSetup,
    expect: {
      exitCode: 1,
      stderr: 'present',
      effects: assertGraphUnwritten,
    },
  },

  // ── hooks-set ──
  {
    command: 'hooks-set',
    scenario: 'happy path: create .claude/settings.json with the named family',
    argv: ['hooks-set', 'testHarness', 'project', '{"command":"npm test"}'],
    setup: () => fixture({}),
    expect: {
      exitCode: 0,
      stdout: HOOKS_SET_STDOUT,
      stderr: 'absent',
      files: { '.claude/settings.json': HOOKS_SET_FILE },
    },
  },
  {
    command: 'hooks-set',
    scenario: 'unrelated top-level keys and sibling the-loop families survive the write',
    argv: ['hooks-set', 'testHarness', 'project', '{"command":"npm test"}'],
    setup: () => fixture({ '.claude/settings.json': SETTINGS_WITH_UNRELATED }),
    expect: {
      exitCode: 0,
      stdout: HOOKS_SET_STDOUT,
      files: { '.claude/settings.json': HOOKS_SET_SURVIVE_FILE },
    },
  },
  {
    command: 'hooks-set',
    scenario: 'refusal: unknown family leaves settings unwritten',
    argv: ['hooks-set', 'notAFamily', 'project', '{}'],
    setup: () => fixture({ '.claude/settings.json': SETTINGS_SEEDED }),
    expect: {
      exitCode: 1,
      stderr: 'present',
      effects: (cwd) => assertUnchanged(cwd, '.claude/settings.json', SETTINGS_SEEDED),
    },
  },
  {
    command: 'hooks-set',
    scenario: 'refusal: unknown layer leaves settings unwritten',
    argv: ['hooks-set', 'lint', 'staging', '{}'],
    setup: () => fixture({ '.claude/settings.json': SETTINGS_SEEDED }),
    expect: {
      exitCode: 1,
      stderr: 'present',
      effects: (cwd) => assertUnchanged(cwd, '.claude/settings.json', SETTINGS_SEEDED),
    },
  },
  {
    command: 'hooks-set',
    scenario: 'refusal: unparseable JSON value leaves settings unwritten',
    argv: ['hooks-set', 'lint', 'project', '{ not json'],
    setup: () => fixture({ '.claude/settings.json': SETTINGS_SEEDED }),
    expect: {
      exitCode: 1,
      stderr: 'present',
      effects: (cwd) => assertUnchanged(cwd, '.claude/settings.json', SETTINGS_SEEDED),
    },
  },
  {
    command: 'hooks-set',
    scenario: 'refusal: too few args leaves settings unwritten',
    argv: ['hooks-set', 'lint', 'project'],
    setup: () => fixture({ '.claude/settings.json': SETTINGS_SEEDED }),
    expect: {
      exitCode: 1,
      stderr: 'present',
      effects: (cwd) => assertUnchanged(cwd, '.claude/settings.json', SETTINGS_SEEDED),
    },
  },
  {
    command: 'hooks-set',
    scenario: 'refusal on empty tree: unknown family writes no settings file',
    argv: ['hooks-set', 'notAFamily', 'project', '{}'],
    setup: () => fixture({}),
    expect: {
      exitCode: 1,
      stderr: 'present',
      effects: (cwd) => assertAbsent(cwd, '.claude/settings.json'),
    },
  },

  // ── calibration-summarize ──
  {
    command: 'calibration-summarize',
    scenario: 'happy path: write index.md digest from two run records',
    argv: ['calibration-summarize'],
    setup: calibrationSetup([RECORD_A, RECORD_B]),
    expect: {
      exitCode: 0,
      stdout: { written: 'docs/calibration/index.md', runs: 2 },
      stderr: 'absent',
      effects: assertCalibrationIndex,
    },
  },
  {
    command: 'calibration-summarize',
    scenario: 'refusal: malformed record exits 1 and writes no index',
    argv: ['calibration-summarize'],
    setup: calibrationSetup([RECORD_A, 'BAD']),
    expect: {
      exitCode: 1,
      stderr: 'present',
      effects: (cwd) => assertAbsent(cwd, 'docs/calibration/index.md'),
    },
  },
];
