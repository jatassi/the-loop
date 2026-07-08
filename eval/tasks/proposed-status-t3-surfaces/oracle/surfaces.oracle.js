// Oracle for proposed-status-t3-surfaces — reads the shipped surface files the same way a
// human or downstream agent would, asserting criterion 5: the /the-loop route table names
// the design proposal, every named living surface lists the four status values together,
// and the pre-amendment three-value statement greps to zero across living surfaces. Runs
// from the fixture root (cwd of `node --test`). The scan skips historical record corpora
// (frozen vocabulary), the harness dirs, and test/ + eval-oracle/ (so a candidate's own
// tests — which legitimately reference the enum pattern — are never graded as offenders).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(p, 'utf8');

test('criterion 5: the /the-loop route table maps a `design` proposal to the design skill', () => {
  assert.match(read('commands/the-loop.md'), /`design`\s*→\s*the\s*`design`\s*skill/);
});

const SURFACES = ['docs/feature-graph.md', 'docs/architecture.md', 'docs/glossary.md', 'README.md', 'skills/design/SKILL.md', 'bin/the-loop.js'];
const FOUR_VALUES = /proposed\s*\|\s*designed\s*\|\s*validated\s*\|\s*shipped/;

test('criterion 5: every named living surface lists proposed | designed | validated | shipped together', () => {
  for (const f of SURFACES) {
    assert.match(read(f), FOUR_VALUES, `${f} should list all four status values together`);
  }
});

const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', 'eval-oracle', 'test']);
const HISTORICAL_DIRS = ['docs/adr/', 'docs/research/', 'docs/briefs/', 'docs/design/', 'docs/designs/', 'docs/plans/', 'docs/releases/', 'docs/bugs/'];
// The pre-amendment three-value enum in either spacing style, unless it is actually the
// tail of the new four-value statement (`proposed | ` / `proposed|` immediately before).
const OLD_ENUM = /(?<!proposed \| )(?<!proposed\|)designed( \| |\|)validated\1shipped/g;

function listTextFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) { continue; }
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) { listTextFiles(full, acc); }
    else if (/\.(?:md|js)$/.test(entry)) { acc.push(full); }
  }
  return acc;
}

test('criterion 5: the old three-value status statement greps to zero across living surfaces', () => {
  const offenders = [];
  for (const file of listTextFiles('.')) {
    if (HISTORICAL_DIRS.some((d) => file.startsWith(`./${d}`))) { continue; }
    if (OLD_ENUM.test(read(file))) { offenders.push(file); }
    OLD_ENUM.lastIndex = 0; // stateful /g regex — reset between files
  }
  assert.deepEqual(offenders, []);
});
