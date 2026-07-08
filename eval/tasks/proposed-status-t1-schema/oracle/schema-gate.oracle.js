// Oracle for proposed-status-t1-schema — drives the real CLI (`the-loop check` and
// `the-loop status`, the public interfaces the criteria name) over temp graph files.
// Behavioral: it never imports the schema internals, so a solution is free to structure
// STATUS and the field checks however it likes as long as the observable gate and the
// rendered counts are right.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const BIN = path.resolve('bin/the-loop.js');

function graphFile(featuresYaml) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ps-schema-'));
  const file = path.join(dir, 'feature-graph.md');
  writeFileSync(file, `# Fixture — Feature graph\n\n## Feature graph\n\n\`\`\`yaml\ndesign_version: 1\nfeatures:\n${featuresYaml}\n\`\`\`\n`);
  return { dir, file };
}
function cli(args) {
  try { return { code: 0, stdout: execFileSync('node', [BIN, ...args], { encoding: 'utf8' }), stderr: '' }; }
  catch (e) { return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }; }
}

test('criterion 1: a proposed feature with no acceptance passes `the-loop check` OK', () => {
  const { dir, file } = graphFile('  - id: backlog\n    title: Backlog\n    status: proposed');
  try {
    const r = cli(['check', file]);
    assert.equal(r.code, 0, 'check exits 0 for a proposed record with no acceptance');
    assert.match(r.stdout, /^OK/m);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('criterion 1: a designed feature with no acceptance still fails with missing-acceptance', () => {
  const { dir, file } = graphFile('  - id: widget\n    title: Widget\n    status: designed');
  try {
    const r = cli(['check', file]);
    assert.equal(r.code, 1, 'check exits 1 for a designed feature with no acceptance');
    assert.match(`${r.stdout}\n${r.stderr}`, /missing-acceptance/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('criterion 2: `the-loop status` counts the proposed stage', () => {
  const { dir, file } = graphFile([
    '  - id: backlog\n    title: Backlog\n    status: proposed',
    '  - id: widget\n    title: Widget\n    status: designed\n    acceptance: [does a thing]',
    '  - id: gadget\n    title: Gadget\n    status: validated\n    acceptance: [does a thing]',
  ].join('\n'));
  try {
    const r = cli(['status', file]);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /- proposed: 1/, 'the summary counts the one proposed feature');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
