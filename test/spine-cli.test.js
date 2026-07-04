// bin/spine.js's new commands (set-status, ledger render, plan remediate), exercised
// as a user or an agent would — spawned as a real subprocess against a throwaway
// fixture directory (no git needed; these commands only touch files).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const BIN = path.resolve('bin/spine.js');

function spine(args, opts = {}) {
  return execFileSync('node', [BIN, ...args], { encoding: 'utf8', ...opts });
}

// Runs a command expected to exit 1; returns the caught error for stderr inspection.
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
  const root = mkdtempSync(path.join(tmpdir(), 'spine-cli-'));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
}

const DESIGN = `# Fixture — Design

## Feature graph

\`\`\`yaml
design_version: 1
features:
  - id: widget
    title: Widget
    status: designed
    depends_on: []
    acceptance: renders a widget
  - id: gadget
    title: Gadget
    status: planned
    depends_on: [widget]
    acceptance: renders a gadget
\`\`\`
`;

test('spine set-status flips one feature, prints it as JSON, and exits 0; an unknown id or bad status exits 1 and writes nothing', () => {
  const root = fixture({ 'docs/design/design.md': DESIGN });
  try {
    const designPath = path.join(root, 'docs/design/design.md');
    const node = JSON.parse(spine(['set-status', 'widget', 'building'], { cwd: root }));
    assert.equal(node.id, 'widget');
    assert.equal(node.status, 'building');

    const written = readFileSync(designPath, 'utf8');
    assert.equal(written, DESIGN.replace('status: designed', 'status: building')); // sibling line untouched

    spineFails(['set-status', 'ghost', 'building'], { cwd: root });
    spineFails(['set-status', 'widget', 'launched'], { cwd: root });
    assert.equal(readFileSync(designPath, 'utf8'), written); // the two refusals wrote nothing
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine note appends text to a feature\'s notes array, creating the key when absent, prints the updated node as JSON, and leaves every byte outside the feature-graph block untouched; an unknown id or empty text exits 1 with nothing written', () => {
  const root = fixture({ 'docs/design/design.md': DESIGN });
  try {
    const designPath = path.join(root, 'docs/design/design.md');
    const node = JSON.parse(spine(['note', 'widget', 'a design-time note'], { cwd: root }));
    assert.equal(node.id, 'widget');
    assert.deepEqual(node.notes, ['a design-time note']);

    const written = readFileSync(designPath, 'utf8');
    assert.equal(written, DESIGN.replace(
      '    acceptance: renders a widget\n',
      '    acceptance: renders a widget\n    notes:\n      - a design-time note\n',
    ));

    spineFails(['note', 'ghost', 'a note'], { cwd: root });
    spineFails(['note', 'widget', ''], { cwd: root });
    assert.equal(readFileSync(designPath, 'utf8'), written); // the two refusals wrote nothing
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('after a note append, spine check still reports OK and spine resolve shows the new note riding the slice', () => {
  const root = fixture({ 'docs/design/design.md': DESIGN });
  try {
    spine(['note', 'widget', 'a design-time note'], { cwd: root });
    assert.match(spine(['check'], { cwd: root }), /^OK {2}/);

    const resolved = JSON.parse(spine(['resolve', 'widget'], { cwd: root }));
    assert.deepEqual(resolved.node.notes, ['a design-time note']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const PRIOR_LEDGER = `## What this is
Fixture ledger for the CLI wiring test.

## Where we are
stale — will be regenerated

## What needs you
stale — will be regenerated

## What's next
stale — will be regenerated

## Run history
2026-01-01: first hand-render.
`;

const ESCALATION = `# Escalation — widget

## Escalation

\`\`\`yaml
feature: widget
phase: build
kind: feature
deviation: contract asked for an atomic rename fs can't guarantee
menu:
  - split the task
branch: loop/widget
\`\`\`
`;

test('spine ledger render reads design.md + docs/escalations/*.md (absent dir = none), writes the Ledger per the pinned sections, and is idempotent', () => {
  const root = fixture({ 'docs/design/design.md': DESIGN, 'docs/ledger/ledger.md': PRIOR_LEDGER });
  try {
    const ledgerPath = path.join(root, 'docs/ledger/ledger.md');

    spine(['ledger', 'render'], { cwd: root }); // no docs/escalations/ dir yet
    const noEscalations = readFileSync(ledgerPath, 'utf8');
    assert.match(noEscalations, /^# Ledger — projected from design\.md \(feature graph\)\n\n## What this is\nFixture ledger for the CLI wiring test\./);
    assert.match(noEscalations, /## Where we are\nTotal: 2 \(design_version 1\)/);
    assert.match(noEscalations, /Nothing parked — no open escalations\./);
    assert.match(noEscalations, /## Run history\n2026-01-01: first hand-render\.\n$/);

    mkdirSync(path.join(root, 'docs/escalations'), { recursive: true });
    writeFileSync(path.join(root, 'docs/escalations/widget.md'), ESCALATION);
    spine(['ledger', 'render'], { cwd: root });
    const withEscalation = readFileSync(ledgerPath, 'utf8');
    assert.match(withEscalation, /\*\*widget\*\* \(build\): contract asked for an atomic rename fs can't guarantee/);

    spine(['ledger', 'render'], { cwd: root }); // same inputs again
    assert.equal(readFileSync(ledgerPath, 'utf8'), withEscalation); // unchanged
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const SUMMARY = { date: '2026-07-04', run: 'wf_999', completed: ['widget'], parked: ['gadget'] };

test('spine ledger append-run reads a run-summary JSON (file arg or stdin) and inserts one bullet as the first content after "## Run history", leaving the rest of the Ledger untouched', () => {
  const root = fixture({ 'docs/ledger/ledger.md': PRIOR_LEDGER });
  try {
    const ledgerPath = path.join(root, 'docs/ledger/ledger.md');
    const summaryPath = path.join(root, 'summary.json');
    writeFileSync(summaryPath, JSON.stringify(SUMMARY));

    spine(['ledger', 'append-run', 'summary.json'], { cwd: root });
    assert.equal(readFileSync(ledgerPath, 'utf8'), PRIOR_LEDGER.replace(
      '## Run history\n',
      '## Run history\n- 2026-07-04 | wf_999 | completed: widget | parked: gadget\n',
    ));

    // a second call, via stdin this time, inserts newest-first above the first
    const secondSummary = { date: '2026-07-05', run: 'wf_1000' };
    spine(['ledger', 'append-run', '-'], { cwd: root, input: JSON.stringify(secondSummary) });
    assert.equal(readFileSync(ledgerPath, 'utf8'), PRIOR_LEDGER.replace(
      '## Run history\n',
      '## Run history\n- 2026-07-05 | wf_1000\n- 2026-07-04 | wf_999 | completed: widget | parked: gadget\n',
    ));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine ledger append-run exits 1 with nothing written when the summary is missing date/run, when the Ledger has no "## Run history" heading, or when the Ledger file is absent', () => {
  const root = fixture({ 'docs/ledger/ledger.md': PRIOR_LEDGER });
  try {
    const ledgerPath = path.join(root, 'docs/ledger/ledger.md');
    const before = readFileSync(ledgerPath, 'utf8');

    spineFails(['ledger', 'append-run', '-'], { cwd: root, input: JSON.stringify({ run: 'wf_1' }) });
    spineFails(['ledger', 'append-run', '-'], { cwd: root, input: JSON.stringify({ date: '2026-07-04' }) });
    assert.equal(readFileSync(ledgerPath, 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  const noHeadingRoot = fixture({ 'docs/ledger/ledger.md': '## What this is\nNo run history here.\n' });
  try {
    const ledgerPath = path.join(noHeadingRoot, 'docs/ledger/ledger.md');
    const before = readFileSync(ledgerPath, 'utf8');
    spineFails(['ledger', 'append-run', '-'], { cwd: noHeadingRoot, input: JSON.stringify(SUMMARY) });
    assert.equal(readFileSync(ledgerPath, 'utf8'), before);
  } finally {
    rmSync(noHeadingRoot, { recursive: true, force: true });
  }

  const absentRoot = fixture({});
  try {
    spineFails(['ledger', 'append-run', '-'], { cwd: absentRoot, input: JSON.stringify(SUMMARY) });
  } finally {
    rmSync(absentRoot, { recursive: true, force: true });
  }
});

test('a subsequent spine ledger render preserves the spine ledger append-run bullet byte-identically', () => {
  const root = fixture({ 'docs/design/design.md': DESIGN, 'docs/ledger/ledger.md': PRIOR_LEDGER });
  try {
    const ledgerPath = path.join(root, 'docs/ledger/ledger.md');
    spine(['ledger', 'append-run', '-'], { cwd: root, input: JSON.stringify(SUMMARY) });
    const afterAppend = readFileSync(ledgerPath, 'utf8');

    spine(['ledger', 'render'], { cwd: root });
    const afterRender = readFileSync(ledgerPath, 'utf8');
    assert.match(afterRender, /## Run history\n- 2026-07-04 \| wf_999 \| completed: widget \| parked: gadget\n2026-01-01: first hand-render\.\n$/);
    assert.equal(afterRender.slice(afterRender.indexOf('## Run history')), afterAppend.slice(afterAppend.indexOf('## Run history')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const REMEDIATE_DESIGN = `# Fixture — Design

## Feature graph

\`\`\`yaml
design_version: 1
features:
  - id: widget
    title: Widget
    status: planned
    depends_on: []
    acceptance: renders a widget
\`\`\`
`;

const REMEDIATE_PLAN = `# Plan — widget

## Tasks

\`\`\`yaml
feature: widget
design_version: 1
tasks:
  - id: t1
    title: Render pipeline
    status: pending
    covers: [1]
    acceptance: given a widget model, rendering returns markup
    injects: []
    footprint: [src/render.js]
    size: s
    depends_on: []
\`\`\`
`;

const FINDINGS = [{ severity: 'advisory', location: 'src/render.js:12', observation: 'exceeds the complexity budget' }];
const NO_FILE_PATHS = [{ severity: 'advisory', location: 'npm test exit code 1', observation: 'suite failed' }];

test('spine plan remediate appends the round-marker so plan check passes; a second round, or findings with no file:line locations, exits 1 and writes nothing', () => {
  const root = fixture({ 'docs/design/design.md': REMEDIATE_DESIGN, 'docs/plans/widget.md': REMEDIATE_PLAN });
  try {
    const planPath = path.join(root, 'docs/plans/widget.md');

    const task = JSON.parse(spine(['plan', 'remediate', 'widget'], { cwd: root, input: JSON.stringify(FINDINGS) }));
    assert.equal(task.id, 'remediation');
    // t1 predates the tier field this feature adds, so plan check still warns
    // missing-tier for it — the grandfather posture (an untiered task warns,
    // never blocks). The remediated plan still passes: tolerate that leading
    // warn line, but require the output to end in the OK summary line.
    assert.match(spine(['plan', 'check', 'widget'], { cwd: root }), /^(?: {2}warn .*\n)*OK {2}.*\n$/);

    const written = readFileSync(planPath, 'utf8');
    spineFails(['plan', 'remediate', 'widget'], { cwd: root, input: JSON.stringify(FINDINGS) });
    assert.equal(readFileSync(planPath, 'utf8'), written); // the refused second round wrote nothing
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  const freshRoot = fixture({ 'docs/design/design.md': REMEDIATE_DESIGN, 'docs/plans/widget.md': REMEDIATE_PLAN });
  try {
    const planPath = path.join(freshRoot, 'docs/plans/widget.md');
    const before = readFileSync(planPath, 'utf8');
    spineFails(['plan', 'remediate', 'widget'], { cwd: freshRoot, input: JSON.stringify(NO_FILE_PATHS) });
    assert.equal(readFileSync(planPath, 'utf8'), before); // a footprint-less findings set wrote nothing
  } finally {
    rmSync(freshRoot, { recursive: true, force: true });
  }
});

const FIX_PLAN = `# Plan — widget

## Tasks

\`\`\`yaml
feature: widget
design_version: 1
tasks:
  - id: t1
    title: Persistence
    status: blocked
    covers: [1]
    acceptance: a saved widget round-trips
    footprint: [src/save.js]
    size: s
    depends_on: []
    report:
      result: blocked
\`\`\`
`;

test('spine plan fix appends fix-N, resets and chains the blocked task behind it, a subsequent spine plan check passes, and empty acceptance/footprint exits 1 with nothing written', () => {
  const root = fixture({ 'docs/design/design.md': DESIGN, 'docs/plans/widget.md': FIX_PLAN });
  try {
    const planFile = path.join(root, 'docs/plans/widget.md');
    const directive = { directive: 'Fix the save-path race\nMore context', acceptance: ['t1 saves without racing'], footprint: ['src/save.js'] };
    const task = JSON.parse(spine(['plan', 'fix', 'widget'], { cwd: root, input: JSON.stringify(directive) }));
    assert.equal(task.id, 'fix-1');
    assert.deepEqual(task.depends_on, []); // t1 is the only prior task, and it's being reset

    const plan = JSON.parse(spine(['plan', 'parse', 'widget'], { cwd: root }));
    const t1 = plan.tasks.find((t) => t.id === 't1');
    assert.equal(t1.status, 'pending');
    assert.ok(!('report' in t1));
    assert.deepEqual(t1.depends_on, ['fix-1']); // chained behind the fix
    // t1 predates the tier field this feature adds, so plan check still warns
    // missing-tier for it — tolerate that leading warn line, same as remediate's test.
    assert.match(spine(['plan', 'check', 'widget'], { cwd: root }), /^(?: {2}warn .*\n)*OK {2}.*\n$/);

    const before = readFileSync(planFile, 'utf8');
    spineFails(['plan', 'fix', 'widget'], { cwd: root, input: JSON.stringify({ acceptance: [], footprint: ['src/save.js'] }) });
    spineFails(['plan', 'fix', 'widget'], { cwd: root, input: JSON.stringify({ acceptance: ['a'], footprint: [] }) });
    assert.equal(readFileSync(planFile, 'utf8'), before); // both refusals wrote nothing
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the spine usage string names set-status, ledger render, and plan remediate', () => {
  const usage = spine([]);
  assert.match(usage, /set-status/);
  assert.match(usage, /ledger render/);
  assert.match(usage, /plan <[^>]*remediate/);
});

test("spine models resolves the shipped plugin defaults relative to bin/spine.js's own location, never cwd, and succeeds with no project or local settings present", () => {
  const root = fixture({}); // no .claude/, no config/ — an empty target repo
  try {
    const table = JSON.parse(spine(['models'], { cwd: root }));
    assert.deepEqual(table.plan, { model: 'session', provenance: 'default' }); // one shipped row, not the whole table
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const CUSTOM_DEFAULTS = JSON.stringify({
  build: { model: 'opus', effort: 'low' },
  drive: { model: 'grok-build', via: 'grok' },
});

test('spine models merges an overridden defaults file with project < local settings overrides (whole-entry replacement), stamping per-role provenance and carrying a bound via through untouched', () => {
  const root = fixture({ 'defaults.json': CUSTOM_DEFAULTS });
  try {
    const defaultsOnly = JSON.parse(spine(['models', 'defaults.json'], { cwd: root }));
    assert.deepEqual(defaultsOnly.build, { model: 'opus', effort: 'low', provenance: 'default' });
    assert.deepEqual(defaultsOnly.drive, { model: 'grok-build', via: 'grok', provenance: 'default' });

    mkdirSync(path.join(root, '.claude'), { recursive: true });
    writeFileSync(path.join(root, '.claude/settings.json'), JSON.stringify({ 'the-loop': { modelBindings: { build: { model: 'haiku' } } } }));
    const withProject = JSON.parse(spine(['models', 'defaults.json'], { cwd: root }));
    assert.deepEqual(withProject.build, { model: 'haiku', provenance: 'project' }); // wholesale replacement — effort is gone
    assert.deepEqual(withProject.drive, { model: 'grok-build', via: 'grok', provenance: 'default' }); // untouched

    writeFileSync(path.join(root, '.claude/settings.local.json'), JSON.stringify({ 'the-loop': { modelBindings: { build: { model: 'opus', effort: 'high' } } } }));
    const withLocal = JSON.parse(spine(['models', 'defaults.json'], { cwd: root }));
    assert.deepEqual(withLocal.build, { model: 'opus', effort: 'high', provenance: 'local' }); // local beats project too
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine models: a resolver rejection or unparseable settings JSON exits 1 naming the offender; the usage string names models', () => {
  const badDefaultsRoot = fixture({ 'defaults.json': JSON.stringify({ build: { effort: 'low' } }) }); // missing model
  try {
    const error = spineFails(['models', 'defaults.json'], { cwd: badDefaultsRoot });
    assert.match(error.stderr, /build.*default/);
  } finally {
    rmSync(badDefaultsRoot, { recursive: true, force: true });
  }

  const badProjectRoot = fixture({ 'defaults.json': '{}' });
  try {
    mkdirSync(path.join(badProjectRoot, '.claude'), { recursive: true });
    writeFileSync(path.join(badProjectRoot, '.claude/settings.json'), '{ not json');
    const error = spineFails(['models', 'defaults.json'], { cwd: badProjectRoot });
    assert.match(error.stderr, /\.claude\/settings\.json/);
  } finally {
    rmSync(badProjectRoot, { recursive: true, force: true });
  }

  assert.match(spine([]), /models/);
});
