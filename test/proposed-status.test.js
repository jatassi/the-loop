// proposed-status's cross-cutting acceptance: a proposed feature is refused at the
// prepare-execution-context gate, the /the-loop route table names the new `design`
// proposal, and every living surface stating the feature-status enum lists all
// four values — the old three-value statement greps to zero outside historical
// records (ADRs, the founding design docs, per-feature design docs, and the other
// frozen record corpora). Reads the shipped files' text directly, the same way a
// human or a downstream agent would, and spawns the real CLI as a user would.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const read = (p) => readFileSync(p, 'utf8');
const BIN = path.resolve('bin/the-loop.js');

// ── criterion 2: prepare-execution-context refuses a proposed feature ──
test('spine prepare-execution-context refuses a proposed feature, naming it must be designed first, with nothing on stdout', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'proposed-status-cli-'));
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  writeFileSync(path.join(root, 'docs/feature-graph.md'), `# Fixture — Feature graph

## Feature graph

\`\`\`yaml
design_version: 1
features:
  - id: backlog-item
    title: Backlog item
    status: proposed
\`\`\`
`);
  writeFileSync(path.join(root, 'docs/architecture.md'), '# Fixture — Architecture\n\n## Validation runbook\n\nnone\n');
  try {
    execFileSync('node', [BIN, 'prepare-execution-context', '--features', 'backlog-item', '--target-branch', 'main'],
      { encoding: 'utf8', cwd: root });
    assert.fail('expected exit 1');
  } catch (error) {
    assert.equal(error.status, 1);
    assert.equal(error.stdout, '');
    assert.match(error.stderr, /must be designed first.*\(backlog-item\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── criterion 5a: the route table maps a `design` proposal to the design skill ──
test('commands/the-loop.md routes a design proposal to the design skill, and new-intake mentions parking an idea as a proposed record', () => {
  const cmd = read('commands/the-loop.md');
  assert.match(cmd, /`design`\s*→\s*the `design` skill, amending the design for the named ids/);
  assert.match(cmd, /parked as a `proposed` record by amendment/);
});

// The six living surfaces the design names explicitly (docs/feature-graph.md's
// header, docs/architecture.md's Operating model paragraph + Feature record
// contract, docs/glossary.md's [[feature graph]] entry, README.md's status-field
// line, skills/design/SKILL.md's yaml sample, commands/the-loop.md's routes) each
// list all four values together.
const SURFACES = ['docs/feature-graph.md', 'docs/architecture.md', 'docs/glossary.md',
  'README.md', 'skills/design/SKILL.md', 'bin/the-loop.js'];
const FOUR_VALUES = /proposed\s*\|\s*designed\s*\|\s*validated\s*\|\s*shipped|proposed\|designed\|validated\|shipped/;

test('every named living surface lists all four status values together', () => {
  for (const f of SURFACES) {
    assert.match(read(f), FOUR_VALUES, `${f} should list proposed|designed|validated|shipped together`);
  }
});

// Historical records (ADRs, the founding design docs, per-feature design docs, and
// the other frozen record corpora) keep their original vocabulary; a `proposed`
// prefix on the enum is the new statement, not the old one, however it's spaced.
const HISTORICAL_DIRS = ['docs/adr/', 'docs/research/', 'docs/briefs/', 'docs/design/',
  'docs/designs/', 'docs/plans/', 'docs/releases/', 'docs/bugs/'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude']);
// The pre-amendment three-value enum, in either spacing style, so long as it isn't
// actually the tail of the new four-value statement (`proposed | ` / `proposed|`
// immediately before it).
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

test('the old three-value status statement greps to zero outside historical records', () => {
  const offenders = [];
  for (const file of listTextFiles('.')) {
    if (HISTORICAL_DIRS.some((dir) => file.startsWith(`./${dir}`) || file.startsWith(dir))) { continue; }
    const text = read(file);
    if (OLD_ENUM.test(text)) { offenders.push(file); }
    OLD_ENUM.lastIndex = 0; // stateful /g regex — reset between files
  }
  assert.deepEqual(offenders, []);
});
