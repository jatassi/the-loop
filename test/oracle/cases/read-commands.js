// Oracle corpus: read-only CLI commands plus --version, exercised against the
// Rust binary on JSON-artifact fixture repos (the regression suite since
// json-cutover).

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { HOME, REFUSE, repoSetup, tempSetup } from '../case-setup.js';
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

const alphaListFeature = {
  id: 'alpha',
  section: 'fixture skeleton',
  title: 'Alpha feature',
  status: 'designed',
  depends_on: [],
  acceptance: ['alpha criterion one', 'alpha criterion two'],
  notes: ['alpha design note'],
};

const betaListFeature = {
  id: 'beta', title: 'Beta feature', status: 'proposed', depends_on: ['alpha'],
};

/** Human status header names the graph file the binary reads. */
const STATUS_HUMAN_MATCH = new RegExp(
  String.raw`^# Status — projected from docs/feature-graph\.json`
    + String.raw`\n[\s\S]*Total: 2 feature\(s\) at design_version 1[\s\S]*\*\*Next:\*\* \`alpha\``,
);

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

const example = repoSetup(EXAMPLE_DEFINITION);
const wellFormedHome = repoSetup(WELL_FORMED, HOME);
const bareStringHome = repoSetup(EXAMPLE_DEFINITION, HOME);

export const cases = [
  {
    command: 'status',
    scenario: 'happy path human-readable',
    argv: ['status'],
    setup: example,
    expect: {
      exitCode: 0,
      stdoutMatch: STATUS_HUMAN_MATCH,
    },
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
    scenario: 'refusal: unparseable graph (broken JSON)',
    argv: ['status', '--json'],
    setup: malformedGraphSetup,
    expect: REFUSE,
  },
  {
    command: 'list',
    scenario: 'happy path',
    argv: ['list'],
    setup: example,
    expect: {
      exitCode: 0,
      stdout: {
        designVersion: 1,
        features: [alphaListFeature, betaListFeature],
      },
    },
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
    setup: repoSetup(DANGLING),
    expect: { exitCode: 1, stdoutMatch: /FAIL 2 features/ },
  },
  {
    command: 'check',
    scenario: 'refusal: malformed graph (broken JSON)',
    argv: ['check'],
    setup: malformedGraphSetup,
    expect: { exitCode: 1, stdoutMatch: /FAIL|malformed/i },
  },
  {
    command: 'check',
    scenario: 'refusal: catalog (bad status, missing acceptance, self/cycle, unknown key)',
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
          worktreeSetup: { provisioning: 'none', provenance: 'fallback' },
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
    command: 'hooks-list',
    scenario: 'happy path --compact line-per-family inventory order',
    argv: ['hooks-list', '--compact'],
    setup: wellFormedHome,
    // Byte-identical to the JS CLI: inventory order, insertion-order keys, trailing NL.
    expect: {
      exitCode: 0,
      stdoutBytes: [
        'interview: {"skill":"grilling","provenance":"default"}',
        'modelBindings: {"plan":{"model":"session","provenance":"default"},"build.rote":{"model":"grok-4.5","executor":"grok","provenance":"default"},"build.standard":{"model":"sonnet","provenance":"project"},"build.complex":{"model":"opus","provenance":"default"},"drive":{"model":"sonnet","provenance":"default"},"validate":{"model":"grok-4.5","executor":"grok","provenance":"default"},"record":{"model":"haiku","provenance":"default"}}',
        'testHarness: {"command":"npm test","provenance":"project"}',
        'lint: {"value":"detected-convention","provenance":"fallback"}',
        'precommit: {"system":"none","provenance":"default"}',
        'notification: {"channel":"chat","provenance":"default"}',
        'artifactStores: {"briefs":"local","designs":"local","features":"local","runbooks":"local","rcas":"local","calibration":"local","provenance":"default"}',
        'worktreeSetup: {"provisioning":"none","provenance":"fallback"}',
        'recordedBindings: {"validationProcedure":{"status":"present","gap":null},"releaseRunbook":{"status":"present","gap":null},"operationsToolkit":{"status":"absent","gap":"lazy retrofit (operate-tooling)"}}',
        '',
      ].join('\n'),
    },
  },
  {
    command: '--version',
    scenario: 'happy path version shape',
    argv: ['--version'],
    expect: { exitCode: 0, stdoutMatch: /^the-loop \d+\.\d+\.\d+\s*$/ },
  },
];
