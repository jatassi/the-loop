import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseExecutor, parseExecutors, validateBindings } from '../src/executor-registry.js';

// Plain string (not a template literal): the machine block's own invocation syntax
// uses literal {model}/{prompt}/{worktree} placeholders, which a template literal's
// ${} interpolation would read as a forgotten dollar sign.
const GROK_TEXT = [
  '# grok',
  '',
  'Narrative lore about the grok CLI executor: it commits last, so truncation always',
  'manifests as stopped-without-committing; the CLI default model is Composer, so',
  '-m is always passed explicitly.',
  '',
  '## Machine block',
  '',
  '```yaml',
  'id: grok',
  'command: grok',
  'models: [grok-build, grok-composer-2.5-fast]',
  'worktree: driver-made',
  'invocation: grok -m {model} --prompt-file {prompt} --cwd {worktree} --always-approve --no-subagents --max-turns 500 --output-format plain',
  'availability: grok --version',
  'auth_smoke:',
  '  run: grok -p "say PONG" --max-turns 1',
  '  expect: PONG',
  'concurrency: 2',
  '```',
  '',
  'More narrative lore below the block: a benign AuthorizationRequired log line',
  'appears even when auth is fine.',
  '',
].join('\n');

test('parseExecutor reads a realistic playbook\'s machine block into the full record shape', () => {
  assert.deepEqual(parseExecutor(GROK_TEXT, 'docs/executors/grok.md'), {
    id: 'grok',
    command: 'grok',
    models: ['grok-build', 'grok-composer-2.5-fast'],
    worktree: 'driver-made',
    invocation: 'grok -m {model} --prompt-file {prompt} --cwd {worktree} --always-approve --no-subagents --max-turns 500 --output-format plain',
    availability: 'grok --version',
    auth_smoke: { run: 'grok -p "say PONG" --max-turns 1', expect: 'PONG' },
    concurrency: 2,
  });
});

test('effort_flag rides the record only when the playbook carries it', () => {
  const withEffort = GROK_TEXT.replace('concurrency: 2', 'concurrency: 2\neffort_flag: --effort {effort}');
  assert.equal(parseExecutor(withEffort, 'docs/executors/grok.md').effort_flag, '--effort {effort}');
});

test('a missing heading, or a heading with no fenced yaml block, throws naming the file', () => {
  assert.throws(() => parseExecutor('# grok\n\nJust prose, no heading at all.\n', 'docs/executors/grok.md'), /executors\/grok\.md/);
  assert.throws(() => parseExecutor('# grok\n\n## Machine block\n\nNo fenced block under the heading.\n', 'docs/executors/grok.md'), /executors\/grok\.md/);
});

test('a missing or mistyped required field throws naming the file and that field', () => {
  assert.throws(() => parseExecutor(GROK_TEXT.replace('command: grok\n', ''), 'docs/executors/grok.md'), /executors\/grok\.md.*"command"/);
  assert.throws(() => parseExecutor(GROK_TEXT.replace('availability: grok --version', 'availability: 42'), 'docs/executors/grok.md'), /executors\/grok\.md.*"availability"/);
});

test('a worktree outside native|driver-made throws naming the file and "worktree"', () => {
  assert.throws(() => parseExecutor(GROK_TEXT.replace('worktree: driver-made', 'worktree: sandboxed'), 'docs/executors/grok.md'), /executors\/grok\.md.*"worktree"/);
});

test('empty or non-array models throws naming the file and "models"', () => {
  assert.throws(() => parseExecutor(GROK_TEXT.replace('models: [grok-build, grok-composer-2.5-fast]', 'models: []'), 'docs/executors/grok.md'), /executors\/grok\.md.*"models"/);
  assert.throws(() => parseExecutor(GROK_TEXT.replace('models: [grok-build, grok-composer-2.5-fast]', 'models: grok-build'), 'docs/executors/grok.md'), /executors\/grok\.md.*"models"/);
});

test('an invocation missing {model} or {prompt}, or lacking both {worktree} and {ref}, throws naming the file and "invocation"', () => {
  const noModel = GROK_TEXT.replace('-m {model} ', '');
  const noPrompt = GROK_TEXT.replace('--prompt-file {prompt} ', '');
  const noPlace = GROK_TEXT.replace('--cwd {worktree} ', '');
  assert.throws(() => parseExecutor(noModel, 'docs/executors/grok.md'), /executors\/grok\.md.*"invocation"/);
  assert.throws(() => parseExecutor(noPrompt, 'docs/executors/grok.md'), /executors\/grok\.md.*"invocation"/);
  assert.throws(() => parseExecutor(noPlace, 'docs/executors/grok.md'), /executors\/grok\.md.*"invocation"/);
});

test('auth_smoke without run or without expect throws naming the file and "auth_smoke"', () => {
  const noRun = GROK_TEXT.replace('  run: grok -p "say PONG" --max-turns 1\n', '');
  const noExpect = GROK_TEXT.replace('  expect: PONG\n', '');
  assert.throws(() => parseExecutor(noRun, 'docs/executors/grok.md'), /executors\/grok\.md.*"auth_smoke"/);
  assert.throws(() => parseExecutor(noExpect, 'docs/executors/grok.md'), /executors\/grok\.md.*"auth_smoke"/);
});

test('a non-positive-integer concurrency throws naming the file and "concurrency"', () => {
  assert.throws(() => parseExecutor(GROK_TEXT.replace('concurrency: 2', 'concurrency: 0'), 'docs/executors/grok.md'), /executors\/grok\.md.*"concurrency"/);
  assert.throws(() => parseExecutor(GROK_TEXT.replace('concurrency: 2', 'concurrency: 1.5'), 'docs/executors/grok.md'), /executors\/grok\.md.*"concurrency"/);
});

test('an id that does not equal the filename stem throws naming the file and "id"', () => {
  assert.throws(() => parseExecutor(GROK_TEXT, 'docs/executors/other.md'), /executors\/other\.md.*"id"/);
});

test('parseExecutors returns the registry keyed by id across multiple playbooks', () => {
  const otherText = GROK_TEXT.replaceAll('grok', 'other');
  const registry = parseExecutors([
    { file: 'docs/executors/grok.md', text: GROK_TEXT },
    { file: 'docs/executors/other.md', text: otherText },
  ]);
  assert.deepEqual(Object.keys(registry).toSorted((a, b) => a.localeCompare(b)), ['grok', 'other']);
  assert.equal(registry.grok.command, 'grok');
  assert.equal(registry.other.command, 'other');
});

test('parseExecutors throws naming both files on a duplicate id', () => {
  const entries = [
    { file: 'docs/executors/grok.md', text: GROK_TEXT },
    { file: 'archived/grok.md', text: GROK_TEXT },
  ];
  assert.throws(() => parseExecutors(entries), /executors\/grok\.md.*archived\/grok\.md/);
});

const REGISTRY = { grok: parseExecutor(GROK_TEXT, 'docs/executors/grok.md') };

test('validateBindings errors unregistered-executor when executor names no registry id, naming the role, and raises no warning', () => {
  const table = { 'build.rote': { model: 'session', executor: 'ghost', provenance: 'local' } };
  const { errors, warnings } = validateBindings(table, REGISTRY);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'unregistered-executor');
  assert.equal(errors[0].where, 'build.rote');
  assert.deepEqual(warnings, []);
});

test('validateBindings errors model-outside-playbook for a registered executor whose binding model sits outside the playbook\'s models list, session included, naming the role', () => {
  const table = {
    'build.rote': { model: 'session', executor: 'grok', provenance: 'local' },
    'design.reader': { model: 'grok-mini', executor: 'grok', provenance: 'local' },
  };
  const { errors } = validateBindings(table, REGISTRY);
  assert.deepEqual(
    errors.map(({ code, where }) => ({ code, where })).toSorted((a, b) => a.where.localeCompare(b.where)),
    [
      { code: 'model-outside-playbook', where: 'build.rote' },
      { code: 'model-outside-playbook', where: 'design.reader' },
    ],
  );
});

test('validateBindings warns no-routing-surface for an executor on any role outside build.rote/build.standard/build.complex/validate, and raises no error', () => {
  const table = { 'design.reader': { model: 'grok-build', executor: 'grok', provenance: 'local' } };
  const { errors, warnings } = validateBindings(table, REGISTRY);
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].code, 'no-routing-surface');
  assert.equal(warnings[0].where, 'design.reader');
});

test('validateBindings warns off-rubric-tier only for build.complex — build.standard and validate carry recorded eval evidence (ADR-0047) and route silently', () => {
  const table = {
    'build.standard': { model: 'grok-build', executor: 'grok', provenance: 'local' },
    'build.complex': { model: 'grok-build', executor: 'grok', provenance: 'local' },
    validate: { model: 'grok-build', executor: 'grok', provenance: 'local' },
  };
  const { errors, warnings } = validateBindings(table, REGISTRY);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    warnings.map(({ code, where }) => ({ code, where })),
    [{ code: 'off-rubric-tier', where: 'build.complex' }],
  );
});

test('validateBindings warns ignored-effort for an effort on an executor binding whose executor carries no effort_flag, and raises no error', () => {
  const table = { 'build.rote': { model: 'grok-build', executor: 'grok', effort: 'high', provenance: 'local' } };
  const { errors, warnings } = validateBindings(table, REGISTRY);
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].code, 'ignored-effort');
  assert.equal(warnings[0].where, 'build.rote');
});

test('validateBindings raises no issue anywhere for an executor of the literal agent or an absent executor, even off the routing surface or carrying an effort', () => {
  const table = {
    'build.rote': { model: 'session', executor: 'agent', provenance: 'default' },
    'build.standard': { model: 'session', provenance: 'default' },
    'design.reader': { model: 'session', executor: 'agent', effort: 'high', provenance: 'default' },
  };
  assert.deepEqual(validateBindings(table, REGISTRY), { errors: [], warnings: [] });
});
