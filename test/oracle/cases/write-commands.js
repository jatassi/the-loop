// Case corpus for artifact-writing CLI commands: set-status, hooks-set, and
// calibration-summarize. Each case shells out via the oracle driver against a
// per-case disposable fixture tree and asserts only observable outputs —
// stdout, exit code, stderr presence, and files written (or left unwritten).
// Fixtures are pure-JSON artifacts (the only era since json-cutover).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { bytesEqual } from '../compare.js';
import { renderCalibrationRecord, renderFeatureGraph } from '../fixtures.js';

// ── Shared definitions ──

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

// A malformed record: broken JSON.
const BAD_RECORD = {
  rel: 'docs/calibration/runs/2026-07-02-1.json',
  text: '{ "run": [this is not valid json\n',
};

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

/** Seed the shared graph definition. */
function graphSetup() {
  const { rel, text } = renderFeatureGraph(GRAPH_DEF);
  return fixture({ [rel]: text });
}

/** Seed calibration run records. */
function calibrationSetup(records) {
  return () => {
    const entries = records.map((r) => (r === 'BAD' ? BAD_RECORD : renderCalibrationRecord(r)));
    return fixture(Object.fromEntries(entries.map(({ rel, text }) => [rel, text])));
  };
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

/** @param {string} cwd @returns {object} */
function parseGraphArtifact(cwd) {
  return JSON.parse(readText(cwd, 'docs/feature-graph.json'));
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
  const { rel, text } = renderFeatureGraph(GRAPH_DEF);
  return assertUnchanged(cwd, rel, text);
}

// Byte-frozen regression snapshot of the index the binary emits for RECORD_A/B —
// captured at json-cutover from the release binary, which had just been proven
// byte-identical to the retired JS renderer over a paired corpus (run-commands-rust
// AC4). A renderer change that alters these bytes must be deliberate.
const EXPECTED_CALIBRATION_INDEX = "# Calibration memory\n\n## Digest\n\n_2 run(s), 2 feature(s) recorded._\n\n### Workflow paths\n| path | runs | median agents | median duration |\n| --- | --- | --- | --- |\n| small | 1 | 2 | — |\n| standard | 1 | 5 | 20 |\n\n### Re-slices\n1 of 2 feature(s) re-sliced (50%).\n\n### Footprint accuracy by size class\n| size | features | median planned files | median actual files |\n| --- | --- | --- | --- |\n| s | 1 | 2 | 3 |\n\n### Top block reasons\n- 1× dep conflict on parser\n\n### Token split (overhead vs build)\nLifetime: 32% overhead / 68% build.\nLast-10 median: 40% overhead / 60% build.\nAttribution: 1 of 2 run(s) overlapped — the overhead/build split is approximate.\n\n## Runs\n\n- 2026-07-01T10:00:00Z · target main · [f-a] · 1 validated · 100000 tokens · serial\n- 2026-07-02T09:00:00Z · target main · [f-b] · 1 blocked · 10000 tokens · overlapped\n";

/** @returns {string|void} */
function assertCalibrationIndex(cwd) {
  const indexPath = path.join(cwd, 'docs/calibration/index.md');
  if (!existsSync(indexPath)) {
    return 'docs/calibration/index.md was not written';
  }
  const text = readFileSync(indexPath, 'utf8');
  if (!bytesEqual(text, EXPECTED_CALIBRATION_INDEX)) {
    return 'docs/calibration/index.md drifted from the frozen regression snapshot';
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
