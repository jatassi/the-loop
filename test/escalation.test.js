import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { parseEscalation, planResolution } from '../src/escalation.js';

const FULL = `# Escalation — widget

Prose narrative describing what happened.

## Escalation

\`\`\`yaml
feature: widget
phase: build
kind: feature
deviation: contract asked for an atomic rename fs can't guarantee
menu:
  - resolution: fix-in-place
    option: split the task
  - relax the atomicity criterion
branch: loop/widget
\`\`\`
`;

const BARE = `# Escalation — widget

## Escalation

\`\`\`yaml
feature: widget
phase: plan
kind: environment
\`\`\`
`;

test('parseEscalation reads the pinned keys from the yaml block under "## Escalation", defaulting menu to [] and absent scalars to null', () => {
  assert.deepEqual(parseEscalation(FULL), {
    feature: 'widget',
    phase: 'build',
    kind: 'feature',
    deviation: "contract asked for an atomic rename fs can't guarantee",
    menu: [
      { resolution: 'fix-in-place', option: 'split the task' },
      { resolution: null, option: 'relax the atomicity criterion' },
    ],
    branch: 'loop/widget',
  });
  assert.deepEqual(parseEscalation(BARE), {
    feature: 'widget',
    phase: 'plan',
    kind: 'environment',
    deviation: null,
    menu: [],
    branch: null,
  });
});

test('text with no Escalation heading, or a heading with no fenced yaml block, returns null rather than throwing', () => {
  assert.equal(parseEscalation('# Escalation — widget\n\nJust prose, no heading at all.\n'), null);
  assert.equal(parseEscalation('# Escalation — widget\n\n## Escalation\n\nNo fenced block under the heading.\n'), null);
});

test('planResolution returns the exact status flip and kind-specific extras for each kind on each phase', () => {
  assert.deepEqual(planResolution('retry', 'plan'), { status: 'designed', deletesPlan: false, stampsRetried: false });
  assert.deepEqual(planResolution('retry', 'build'), { status: 'building', deletesPlan: false, stampsRetried: false });
  assert.deepEqual(planResolution('retry', 'validate', { reason: 'flaky net' }), { status: 'building', deletesPlan: false, stampsRetried: true });
  assert.deepEqual(planResolution('fix-in-place', 'plan'), { status: 'designed', deletesPlan: false, stampsRetried: false });
  assert.deepEqual(planResolution('fix-in-place', 'build'), { status: 'building', deletesPlan: false, stampsRetried: false });
  assert.deepEqual(planResolution('fix-in-place', 'validate'), { status: 'building', deletesPlan: false, stampsRetried: false });
  assert.deepEqual(planResolution('re-plan', 'plan'), { status: 'designed', deletesPlan: true, stampsRetried: false });
  assert.deepEqual(planResolution('re-plan', 'build'), { status: 'designed', deletesPlan: true, stampsRetried: false });
  assert.deepEqual(planResolution('re-plan', 'validate'), { status: 'designed', deletesPlan: true, stampsRetried: false });
  assert.deepEqual(planResolution('waive', 'validate'), { status: 'validated', deletesPlan: false, stampsRetried: false });
});

test('planResolution throws on every invalid combination, so no caller writes on a bad resolution', () => {
  assert.throws(() => planResolution('defer', 'build'), /defer leaves the park in place/);
  assert.throws(() => planResolution('bogus', 'build'), /unknown resolution kind/);
  assert.throws(() => planResolution('waive', 'build'), /valid only on a validate park/);
  assert.throws(() => planResolution('waive', 'plan'), /valid only on a validate park/);
  assert.throws(() => planResolution('retry', 'validate'), /requires a reason/); // retry-on-validate with no reason
  assert.throws(() => planResolution('retry', 'nonsense'), /unknown phase/);
});

// ── The `escalation resolve` CLI, spawned as a real subprocess against a throwaway
// fixture directory. (These CLI cases live here, not in test/spine-cli.test.js, which
// sits at its max-lines budget — the exact planning signal t5/t6 flagged for t7.)
const BIN = path.resolve('bin/spine.js');

function spine(args, opts = {}) {
  return execFileSync('node', [BIN, ...args], { encoding: 'utf8', ...opts });
}

function spineFails(args, opts = {}) {
  try {
    spine(args, opts);
  } catch (error) {
    assert.equal(error.status, 1);
    return error;
  }
  assert.fail(`expected "spine ${args.join(' ')}" to exit 1`);
}

function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'spine-esc-'));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
}

const PARKED_DESIGN = `# Fixture — Design

## Feature graph

\`\`\`yaml
design_version: 1
features:
  - id: widget
    title: Widget
    status: parked
    depends_on: []
    acceptance: renders a widget
\`\`\`
`;

const LEDGER_FIXTURE = `# Ledger — projected from design.md (feature graph)

## What this is
Fixture ledger.

## Where we are
stale — regenerated

## What needs you
stale — regenerated

## What's next
stale — regenerated

## Run history
2026-01-01: seed.
`;

const VALIDATIONS_FIXTURE = `# Validation — widget

## Validation — run 1

\`\`\`yaml
patch_id: abc123def
result: deviation
\`\`\`
`;

function recordFor(phase) {
  return `# Escalation — widget

## Escalation

\`\`\`yaml
feature: widget
phase: ${phase}
kind: feature
deviation: the build could not land the contract as written
menu:
  - resolution: retry
    option: re-run once the flake clears
branch: loop/widget
\`\`\`
`;
}

test('spine escalation resolve flips the status, deletes the record, re-renders the Ledger to drop the park, and reports feature/kind/phase/status/deleted', () => {
  const root = fixture({
    'docs/design/design.md': PARKED_DESIGN,
    'docs/escalations/widget.md': recordFor('build'),
    'docs/ledger/ledger.md': LEDGER_FIXTURE,
  });
  try {
    const out = JSON.parse(spine(['escalation', 'resolve', 'widget', 'retry'], { cwd: root }));
    assert.deepEqual(out, {
      feature: 'widget', kind: 'retry', phase: 'build', status: 'building',
      deleted: ['docs/escalations/widget.md'], retried: null,
    });
    assert.match(readFileSync(path.join(root, 'docs/design/design.md'), 'utf8'), /status: building/);
    assert.equal(existsSync(path.join(root, 'docs/escalations/widget.md')), false); // record deleted
    assert.match(readFileSync(path.join(root, 'docs/ledger/ledger.md'), 'utf8'), /Nothing parked — no open escalations\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fix-in-place on a plan park lands the feature designed via the CLI', () => {
  const root = fixture({
    'docs/design/design.md': PARKED_DESIGN,
    'docs/escalations/widget.md': recordFor('plan'),
    'docs/ledger/ledger.md': LEDGER_FIXTURE,
  });
  try {
    const out = JSON.parse(spine(['escalation', 'resolve', 'widget', 'fix-in-place'], { cwd: root }));
    assert.equal(out.status, 'designed');
    assert.equal(out.phase, 'plan');
    assert.deepEqual(out.deleted, ['docs/escalations/widget.md']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('re-plan deletes the plan artifact, retry-on-a-validate-park stamps the retried mark and reports it, and waive lands validated', () => {
  const replanRoot = fixture({
    'docs/design/design.md': PARKED_DESIGN,
    'docs/escalations/widget.md': recordFor('validate'),
    'docs/plans/widget.md': '# Plan — widget\n\nstub\n',
    'docs/ledger/ledger.md': LEDGER_FIXTURE,
  });
  try {
    const out = JSON.parse(spine(['escalation', 'resolve', 'widget', 're-plan'], { cwd: replanRoot }));
    assert.equal(out.status, 'designed');
    assert.deepEqual(out.deleted, ['docs/plans/widget.md', 'docs/escalations/widget.md']);
    assert.equal(existsSync(path.join(replanRoot, 'docs/plans/widget.md')), false); // plan artifact discarded
  } finally {
    rmSync(replanRoot, { recursive: true, force: true });
  }

  const retryRoot = fixture({
    'docs/design/design.md': PARKED_DESIGN,
    'docs/escalations/widget.md': recordFor('validate'),
    'docs/validations/widget.md': VALIDATIONS_FIXTURE,
    'docs/ledger/ledger.md': LEDGER_FIXTURE,
  });
  try {
    const out = JSON.parse(spine(['escalation', 'resolve', 'widget', 'retry', '--reason', 'flaky network'], { cwd: retryRoot }));
    assert.equal(out.status, 'building');
    assert.match(out.retried, /^\d{4}-\d{2}-\d{2} — flaky network$/); // today UTC — reason
    assert.ok(readFileSync(path.join(retryRoot, 'docs/validations/widget.md'), 'utf8').includes(out.retried)); // stamped onto the entry
  } finally {
    rmSync(retryRoot, { recursive: true, force: true });
  }

  const waiveRoot = fixture({
    'docs/design/design.md': PARKED_DESIGN,
    'docs/escalations/widget.md': recordFor('validate'),
    'docs/ledger/ledger.md': LEDGER_FIXTURE,
  });
  try {
    assert.equal(JSON.parse(spine(['escalation', 'resolve', 'widget', 'waive'], { cwd: waiveRoot })).status, 'validated');
  } finally {
    rmSync(waiveRoot, { recursive: true, force: true });
  }
});

test('--phase resolves a damaged park with no record present and skips the record-deletion step', () => {
  const root = fixture({ 'docs/design/design.md': PARKED_DESIGN, 'docs/ledger/ledger.md': LEDGER_FIXTURE });
  try {
    const out = JSON.parse(spine(['escalation', 'resolve', 'widget', 'retry', '--phase', 'build'], { cwd: root }));
    assert.equal(out.status, 'building');
    assert.equal(out.phase, 'build');
    assert.deepEqual(out.deleted, []); // no record existed to delete
    assert.match(readFileSync(path.join(root, 'docs/design/design.md'), 'utf8'), /status: building/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('every escalation-resolve guard exits 1 with nothing written', () => {
  const buildRoot = fixture({ 'docs/design/design.md': PARKED_DESIGN, 'docs/escalations/widget.md': recordFor('build') });
  try {
    const designPath = path.join(buildRoot, 'docs/design/design.md');
    const before = readFileSync(designPath, 'utf8');
    assert.match(spineFails(['escalation', 'resolve', 'widget', 'waive'], { cwd: buildRoot }).stderr, /validate park/);
    assert.match(spineFails(['escalation', 'resolve', 'widget', 'defer'], { cwd: buildRoot }).stderr, /leaves the park in place/);
    spineFails(['escalation', 'resolve', 'widget', 'bogus'], { cwd: buildRoot });
    spineFails(['escalation', 'resolve', 'widget', 'retry', '--phase', 'build'], { cwd: buildRoot }); // --phase refused when a record exists
    assert.equal(readFileSync(designPath, 'utf8'), before); // every refusal wrote nothing
  } finally {
    rmSync(buildRoot, { recursive: true, force: true });
  }

  const validateRoot = fixture({ 'docs/design/design.md': PARKED_DESIGN, 'docs/escalations/widget.md': recordFor('validate') });
  try {
    spineFails(['escalation', 'resolve', 'widget', 'retry'], { cwd: validateRoot }); // retry-on-validate with no --reason
  } finally {
    rmSync(validateRoot, { recursive: true, force: true });
  }

  const noRecordRoot = fixture({ 'docs/design/design.md': PARKED_DESIGN });
  try {
    spineFails(['escalation', 'resolve', 'widget', 'retry'], { cwd: noRecordRoot }); // no record and no --phase
  } finally {
    rmSync(noRecordRoot, { recursive: true, force: true });
  }

  const unparkedRoot = fixture({
    'docs/design/design.md': PARKED_DESIGN.replace('status: parked', 'status: building'),
    'docs/escalations/widget.md': recordFor('build'),
  });
  try {
    assert.match(spineFails(['escalation', 'resolve', 'widget', 'retry'], { cwd: unparkedRoot }).stderr, /not parked/);
  } finally {
    rmSync(unparkedRoot, { recursive: true, force: true });
  }
});
