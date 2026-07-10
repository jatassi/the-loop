// Parity-oracle corpus: read-only CLI commands plus --version.
// Each dual-format case selects its fixture half by target — yamlRepo for the JS
// CLI, jsonRepo for the Rust binary — so both binaries read their own format of
// the same shared definition.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { HOME, pairSetup, REFUSE, tempSetup } from '../case-setup.js';
import {
  EXAMPLE_DEFINITION,
  malformedGraphSetup,
  refusalCatalogSetup,
} from '../fixtures.js';

const WELL_FORMED = {
  ...EXAMPLE_DEFINITION,
  settings: {
    'the-loop': {
      modelBindings: { 'build.standard': { model: 'sonnet' } },
      testHarness: { command: 'npm test' },
    },
  },
};

const DANGLING = {
  ...EXAMPLE_DEFINITION,
  features: EXAMPLE_DEFINITION.features.map((f) => (
    f.id === 'beta' ? { ...f, depends_on: ['ghost'] } : f
  )),
};

/** Alpha list node — Rust JSON fixtures carry optional `section`; YAML does not. */
const alphaListFeature = (target) => ({
  id: 'alpha',
  ...(target === 'rust' && { section: 'fixture skeleton' }),
  title: 'Alpha feature',
  status: 'designed',
  depends_on: [],
  acceptance: ['alpha criterion one', 'alpha criterion two'],
  notes: ['alpha design note'],
});

const betaListFeature = {
  id: 'beta', title: 'Beta feature', status: 'proposed', depends_on: ['alpha'],
};

/** Human status header names the graph file each binary actually reads. */
const statusHumanMatch = (target) => {
  const ext = target === 'rust' ? 'json' : 'md';
  return new RegExp(
    String.raw`^# Status — projected from docs/feature-graph\.` + ext
      + String.raw`\n[\s\S]*Total: 2 feature\(s\) at design_version 1[\s\S]*\*\*Next:\*\* \`alpha\``,
  );
};

const ROLE_TABLE = {
  plan: { model: 'session', provenance: 'default' },
  'build.rote': { model: 'grok-4.5', executor: 'grok', provenance: 'default' },
  'build.standard': { model: 'sonnet', provenance: 'project' },
  'build.complex': { model: 'opus', provenance: 'default' },
  drive: { model: 'sonnet', provenance: 'default' },
  validate: { model: 'grok-4.5', executor: 'grok', provenance: 'default' },
  record: { model: 'haiku', provenance: 'default' },
};

const emptyDir = tempSetup('oracle-empty-');

const playbook = (id) => [
  `# ${id}`, '', `Narrative lore about the ${id} executor.`, '',
  '## Machine block', '', '```yaml',
  `id: ${id}`, `command: ${id}`, `models: [model-a, model-b]`,
  'worktree: driver-made',
  'invocation: run -m {model} --prompt-file {prompt} --cwd {worktree}',
  `availability: ${id} --version`,
  'auth_smoke:', `  run: ${id} -p "ping"`, '  expect: pong',
  'concurrency: 1', '```', '',
].join('\n');

const badPlaybook = tempSetup('oracle-playbook-', (cwd) => {
  mkdirSync(path.join(cwd, 'playbooks'), { recursive: true });
  writeFileSync(
    path.join(cwd, 'playbooks/widget.md'),
    playbook('widget').replace('command: widget\n', ''),
  );
});

const example = pairSetup(EXAMPLE_DEFINITION);
const wellFormedHome = pairSetup(WELL_FORMED, HOME);
const bareStringHome = pairSetup(EXAMPLE_DEFINITION, HOME);

export const cases = [
  {
    command: 'status',
    scenario: 'happy path human-readable',
    argv: ['status'],
    setup: example,
    expect: ({ target }) => ({
      exitCode: 0,
      stdoutMatch: statusHumanMatch(target),
    }),
  },
  {
    command: 'status',
    scenario: 'refusal: missing feature graph',
    argv: ['status'],
    setup: emptyDir,
    expect: REFUSE,
  },
  {
    command: 'status',
    scenario: 'happy path --json',
    argv: ['status', '--json'],
    setup: example,
    expect: {
      exitCode: 0,
      stdout: {
        mode: 'configured',
        hasDesign: true,
        hasGraph: true,
        hasBrief: false,
        position: {
          designVersion: 1,
          total: 2,
          byStatus: { proposed: 1, designed: 1, validated: 0, shipped: 0 },
        },
        eligibleSet: ['alpha'],
        proposal: {
          kind: 'advance-eligible-set',
          features: ['alpha'],
          summary: '1 feature(s) are dependency-ready to advance',
        },
      },
    },
  },
  {
    command: 'status',
    scenario: 'refusal: unparseable graph (broken YAML fence vs broken JSON)',
    argv: ['status', '--json'],
    setup: malformedGraphSetup,
    expect: REFUSE,
  },
  {
    command: 'list',
    scenario: 'happy path',
    argv: ['list'],
    setup: example,
    expect: ({ target }) => ({
      exitCode: 0,
      stdout: {
        designVersion: 1,
        features: [alphaListFeature(target), betaListFeature],
      },
    }),
  },
  {
    command: 'list',
    scenario: 'refusal: missing feature graph',
    argv: ['list'],
    setup: emptyDir,
    expect: REFUSE,
  },
  {
    command: 'check',
    scenario: 'happy path OK',
    argv: ['check'],
    setup: example,
    expect: { exitCode: 0, stdoutMatch: /^OK\s+2 features/ },
  },
  {
    command: 'check',
    scenario: 'refusal: dangling dependency FAIL',
    argv: ['check'],
    setup: pairSetup(DANGLING),
    expect: { exitCode: 1, stdoutMatch: /FAIL 2 features/ },
  },
  {
    command: 'check',
    scenario: 'refusal: malformed graph (broken YAML fence vs broken JSON)',
    argv: ['check'],
    setup: malformedGraphSetup,
    // JS puts parse errors on stderr with empty stdout; Rust prints FAIL on stdout.
    expect: ({ target }) => (target === 'rust'
      ? { exitCode: 1, stdoutMatch: /FAIL|malformed/i }
      : { exitCode: 1, stderr: 'present', stdoutBytes: '' }),
  },
  {
    command: 'check',
    scenario: 'refusal: catalog (bad status, missing acceptance, self/cycle, unknown key on JSON)',
    argv: ['check'],
    setup: refusalCatalogSetup,
    expect: { exitCode: 1, stdoutMatch: /FAIL/ },
  },
  {
    command: 'executors-list',
    scenario: 'happy path',
    argv: ['executors-list', 'config/executors'],
    setup: example,
    expect: {
      exitCode: 0,
      stdout: {
        'fixture-exec': {
          id: 'fixture-exec', command: 'fixture-exec', models: ['fixture-model'],
          worktree: 'driver-made',
          invocation: 'fixture-exec -m {model} --prompt-file {prompt} --cwd {worktree}',
          availability: 'fixture-exec --version',
          auth_smoke: { run: 'fixture-exec ping', expect: 'PONG' },
          concurrency: 1,
        },
      },
    },
  },
  {
    command: 'executors-list',
    scenario: 'refusal: malformed playbook missing command',
    argv: ['executors-list', 'playbooks'],
    setup: badPlaybook,
    expect: REFUSE,
  },
  {
    command: 'models-list',
    scenario: 'happy path well-formed settings',
    argv: ['models-list'],
    setup: wellFormedHome,
    expect: { exitCode: 0, stdout: ROLE_TABLE },
  },
  {
    command: 'models-list',
    scenario: 'refusal: malformed modelBindings bare string',
    argv: ['models-list'],
    setup: bareStringHome,
    expect: REFUSE,
  },
  {
    command: 'hooks-list',
    scenario: 'happy path well-formed settings',
    argv: ['hooks-list'],
    setup: wellFormedHome,
    expect: {
      exitCode: 0,
      stdout: {
        hooks: {
          interview: { skill: 'grilling', provenance: 'default' },
          modelBindings: ROLE_TABLE,
          testHarness: { command: 'npm test', provenance: 'project' },
          lint: { value: 'detected-convention', provenance: 'fallback' },
          precommit: { system: 'none', provenance: 'default' },
          notification: { channel: 'chat', provenance: 'default' },
          artifactStores: {
            briefs: 'local', designs: 'local', features: 'local', runbooks: 'local',
            rcas: 'local', calibration: 'local', provenance: 'default',
          },
        },
        recordedBindings: {
          validationProcedure: { status: 'present', gap: null },
          releaseRunbook: { status: 'present', gap: null },
          operationsToolkit: { status: 'absent', gap: 'lazy retrofit (operate-tooling)' },
        },
      },
    },
  },
  {
    command: 'hooks-list',
    scenario: 'refusal: malformed modelBindings bare string',
    argv: ['hooks-list'],
    setup: bareStringHome,
    expect: REFUSE,
  },
  {
    command: '--version',
    scenario: 'happy path version shape',
    argv: ['--version'],
    expect: { exitCode: 0, stdoutMatch: /^the-loop \d+\.\d+\.\d+\s*$/ },
  },
];
