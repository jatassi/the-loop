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
    assert.match(spine(['plan', 'check', 'widget'], { cwd: root }), /^OK/);

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

test('the spine usage string names set-status, ledger render, and plan remediate', () => {
  const usage = spine([]);
  assert.match(usage, /set-status/);
  assert.match(usage, /ledger render/);
  assert.match(usage, /plan <[^>]*remediate/);
});
