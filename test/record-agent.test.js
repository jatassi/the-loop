// calibration-capture/record-agent acceptance, executable: the record agent
// definition, role binding, and dev symlink are present and structurally correct.
// Footprint is prose + config + symlink (no runtime logic) — every assertion
// reads the shipped files directly, the same way a human or downstream agent would.
import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from 'node:fs';
import { test } from 'node:test';

import { bindingFor, resolveModels } from '../plugin/src/resolve-model-bindings.js';

const read = (p) => readFileSync(p, 'utf8');

// ── criterion 1: record.md is a rote transcriber with the contracted tools,
// artifact path, enrichment fields, summarize verb, commit subject, return shape ──
test('plugin/agents/record.md defines the rote transcriber with contracted tools and procedures', () => {
  assert.ok(existsSync('plugin/agents/record.md'), 'plugin/agents/record.md should exist');
  const text = read('plugin/agents/record.md');

  assert.match(text, /^---\nname:\s*record\s*$/m, 'frontmatter name should be record');
  assert.match(
    text,
    /^tools:\s*Read, Grep, Glob, Bash, Write, Edit\s*$/m,
    'tools line should be exactly Read, Grep, Glob, Bash, Write, Edit',
  );

  assert.match(text, /docs\/calibration\/runs\//, 'artifact path pattern docs/calibration/runs/');
  for (const field of ['files_touched', 'insertions', 'deletions', 'commits', 'duration_minutes']) {
    assert.ok(text.includes(field), `body should mention enrichment field ${field}`);
  }
  assert.match(text, /calibration-summarize/, 'body should name the calibration-summarize command');
  assert.match(text, /calibration:\s*run/, 'body should name the commit subject pattern calibration: run');
  assert.match(text, /recorded/, 'body should mention recorded return result');
  assert.match(text, /blocked/, 'body should mention blocked return result');
});

// ── criterion 2: return shape, worktree/publish flow, and target-repo-only scope
// (covered in prose; structural presence of key contract phrases) ──
test('plugin/agents/record.md covers worktree publish, summarize, and target-only scope', () => {
  const text = read('plugin/agents/record.md');
  assert.match(text, /worktree-create/, 'should create a worktree via the-loop worktree-create');
  assert.match(text, /fast-forward|fast.?forward/i, 'should publish by fast-forward');
  assert.match(text, /target\s+repositor/i, 'should restrict reads/writes to the target repository');
  assert.match(
    text,
    /\{\s*"result":\s*"recorded".*"path"/s,
    'recorded return shape with path',
  );
  assert.match(
    text,
    /\{\s*"result":\s*"blocked".*"detail"/s,
    'blocked return shape with detail',
  );
});

// ── criterion 3: model binding + dev symlink + models table resolves the role ──
test('plugin/config/model-bindings.json binds record to haiku with no executor', () => {
  const bindings = JSON.parse(read('plugin/config/model-bindings.json'));
  assert.deepEqual(bindings.record, { model: 'haiku' });
  assert.equal('executor' in bindings.record, false, 'record must not carry an executor key');
});

test('.claude/agents/record.md is a symlink matching sibling agent link shape', () => {
  const linkPath = '.claude/agents/record.md';
  const siblingPath = '.claude/agents/build.md';
  assert.ok(existsSync(linkPath), `${linkPath} should exist`);
  assert.ok(lstatSync(linkPath).isSymbolicLink(), `${linkPath} should be a symbolic link`);

  const recordTarget = readlinkSync(linkPath);
  const buildTarget = readlinkSync(siblingPath);
  // Same relative shape: ../../plugin/agents/<name>.md
  assert.equal(
    recordTarget.replace(/record\.md$/, 'build.md'),
    buildTarget,
    'record symlink relative target should match build.md pattern',
  );
  assert.equal(
    realpathSync(linkPath),
    realpathSync('plugin/agents/record.md'),
    'symlink should resolve to plugin/agents/record.md',
  );
});

test('resolveModels/bindingFor resolves the record role to haiku default', () => {
  const defaults = JSON.parse(read('plugin/config/model-bindings.json'));
  const table = resolveModels({ defaults });
  assert.deepEqual(bindingFor(table, 'record'), { model: 'haiku', provenance: 'default' });
});
