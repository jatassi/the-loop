// bin/spine.js's `ship status` command — the healing + pin helper — exercised as a
// subprocess against throwaway fixture directories (test/spine-cli.test.js conventions;
// lives in its own file since bin/spine.js's own CLI tests already sit near their
// budget, the same recurring planning signal docs/plans/surfacing.md flagged).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

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
  const root = mkdtempSync(path.join(tmpdir(), 'spine-ship-'));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
}

// A guard refusal's byte-unchanged proof: snapshot before, assertUnchanged after.
function snapshot(root, ...rels) {
  return Object.fromEntries(rels.map((rel) => [rel, readFileSync(path.join(root, rel), 'utf8')]));
}

function assertUnchanged(root, before) {
  for (const [rel, contents] of Object.entries(before)) {
    assert.equal(readFileSync(path.join(root, rel), 'utf8'), contents);
  }
}

const SHIP_1_DEPLOYED = `# Ship 1

## Ship record

\`\`\`yaml
ship: 1
ship_sha: sha1
approval:
  approver: Jackson Atassi
  date: 2026-07-01
outcome: deployed
\`\`\`
`;

const SHIP_2_DEPLOYED = `# Ship 2

## Ship record

\`\`\`yaml
ship: 2
ship_sha: sha2
approval:
  approver: Jackson Atassi
  date: 2026-07-02
outcome: deployed
\`\`\`
`;

const SHIP_1_INTERRUPTED = `# Ship 1

Approved, corridor never concluded.

## Ship record

\`\`\`yaml
ship: 1
ship_sha: sha1
approval:
  approver: Jackson Atassi
  date: 2026-07-01
\`\`\`
`;

const SHIP_1_UNAPPROVED = `# Ship 1

Assembled, not yet approved.

## Ship record

\`\`\`yaml
ship: 1
ship_sha: sha1
features: [alpha]
\`\`\`
`;

const MALFORMED = `# Ship 1

Just narrative, no structured block at all.
`;

test('spine ship status prints ships 0, next 1, previous_ship_sha null, and latest null when docs/ships is absent', () => {
  const root = fixture({});
  try {
    const status = JSON.parse(spine(['ship', 'status'], { cwd: root }));
    assert.deepEqual(status, { ships: 0, next: 1, previous_ship_sha: null, latest: null });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine ship status counts every ship-*.md record and summarizes the highest-N one when it is concluded', () => {
  const root = fixture({ 'docs/ships/ship-1.md': SHIP_1_DEPLOYED, 'docs/ships/ship-2.md': SHIP_2_DEPLOYED });
  try {
    const status = JSON.parse(spine(['ship', 'status'], { cwd: root }));
    assert.deepEqual(status, {
      ships: 2,
      next: 3,
      previous_ship_sha: 'sha2',
      latest: { ship: 2, ship_sha: 'sha2', outcome: 'deployed', interrupted: false },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine ship status surfaces an approved-no-outcome latest record as interrupted', () => {
  const root = fixture({ 'docs/ships/ship-1.md': SHIP_1_INTERRUPTED });
  try {
    const status = JSON.parse(spine(['ship', 'status'], { cwd: root }));
    assert.deepEqual(status.latest, { ship: 1, ship_sha: 'sha1', outcome: null, interrupted: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine ship status reports interrupted false for a record with neither approval nor outcome', () => {
  const root = fixture({ 'docs/ships/ship-1.md': SHIP_1_UNAPPROVED });
  try {
    const status = JSON.parse(spine(['ship', 'status'], { cwd: root }));
    assert.deepEqual(status.latest, { ship: 1, ship_sha: 'sha1', outcome: null, interrupted: false });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine ship status exits 1 naming the file when a ship-*.md record has no "## Ship record" block', () => {
  const root = fixture({ 'docs/ships/ship-1.md': MALFORMED });
  try {
    const error = spineFails(['ship', 'status'], { cwd: root });
    assert.match(error.stderr, /ship-1\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the spine usage string names ship status', () => {
  assert.match(spine([]), /ship status/);
});

// spine ship book <N> [outcome.json|-] — commit-2 mechanics: record + (deployed-only)
// flips + Ledger render + one appendShip bullet, guarded before any write.
const BOOK_DESIGN = `# Fixture — Design

## Feature graph

\`\`\`yaml
design_version: 3
features:
  - id: alpha
    title: Alpha
    status: validated
    depends_on: []
    acceptance: does alpha things
  - id: beta
    title: Beta
    status: validated
    depends_on: []
    acceptance: does beta things
  - id: gamma
    title: Gamma
    status: building
    depends_on: []
    acceptance: does gamma things
\`\`\`
`;

const BOOK_LEDGER = `## What this is
Fixture ledger for the ship book test.

## Where we are
stale — will be regenerated

## What needs you
stale — will be regenerated

## What's next
stale — will be regenerated

## Run history
2026-01-01: first hand-render.
`;

function approvedRecord(ship, features) {
  return `# Ship ${ship}\n\nApproved, corridor not yet run.\n\n## Ship record\n\n\`\`\`yaml\nship: ${ship}\nship_sha: sha${ship}\nfeatures: [${features.join(', ')}]\napproval:\n  approver: Jackson Atassi\n  date: 2026-07-03\n\`\`\`\n`;
}

const UNAPPROVED_FOR_BOOK = `# Ship 10

Assembled, not yet approved.

## Ship record

\`\`\`yaml
ship: 10
ship_sha: sha10
features: [alpha]
\`\`\`
`;

test('spine ship book <N> deployed writes the outcome into the record, flips every listed feature validated -> shipped in design.md, re-renders the Ledger from the flipped graph, and inserts one appendShip bullet', () => {
  const root = fixture({
    'docs/ships/ship-7.md': approvedRecord(7, ['alpha', 'beta']),
    'docs/design/design.md': BOOK_DESIGN,
    'docs/ledger/ledger.md': BOOK_LEDGER,
  });
  try {
    const recordPath = path.join(root, 'docs/ships/ship-7.md');
    const designPath = path.join(root, 'docs/design/design.md');
    const ledgerPath = path.join(root, 'docs/ledger/ledger.md');
    const today = new Date().toISOString().slice(0, 10);

    const printed = JSON.parse(spine(['ship', 'book', '7'], {
      cwd: root,
      input: JSON.stringify({ outcome: 'deployed', health_signal: true, steps: [] }),
    }));
    assert.equal(printed.ship, 7);
    assert.equal(printed.outcome, 'deployed');
    assert.equal(printed._blocks, undefined); // the retained yaml Document never reaches stdout

    assert.match(readFileSync(recordPath, 'utf8'), /outcome: deployed/);

    const design = readFileSync(designPath, 'utf8');
    assert.match(design, /id: alpha\n {4}title: Alpha\n {4}status: shipped/);
    assert.match(design, /id: beta\n {4}title: Beta\n {4}status: shipped/);
    assert.match(design, /id: gamma\n {4}title: Gamma\n {4}status: building/); // sibling untouched

    const ledger = readFileSync(ledgerPath, 'utf8');
    assert.match(ledger, new RegExp(String.raw`## Run history\n- ${today} \| ship-7 \| deployed \| features: alpha, beta\n`));
    assert.match(ledger, /Total: 3 \(design_version 3\)/); // re-rendered from the flipped graph
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine ship book <N> rolled-back with rollback_verified false records the outcome and rollback_verified, inserts one appendShip bullet, and leaves design.md untouched', () => {
  const root = fixture({
    'docs/ships/ship-8.md': approvedRecord(8, ['alpha']),
    'docs/design/design.md': BOOK_DESIGN,
    'docs/ledger/ledger.md': BOOK_LEDGER,
  });
  try {
    const recordPath = path.join(root, 'docs/ships/ship-8.md');
    const designPath = path.join(root, 'docs/design/design.md');
    const ledgerPath = path.join(root, 'docs/ledger/ledger.md');
    const designBefore = readFileSync(designPath, 'utf8');
    const today = new Date().toISOString().slice(0, 10);

    spine(['ship', 'book', '8'], { cwd: root, input: JSON.stringify({ outcome: 'rolled-back', rollback_verified: false }) });

    const record = readFileSync(recordPath, 'utf8');
    assert.match(record, /outcome: rolled-back/);
    assert.match(record, /rollback_verified: false/);
    assert.equal(readFileSync(designPath, 'utf8'), designBefore); // no flips on a non-deployed outcome

    const ledger = readFileSync(ledgerPath, 'utf8');
    assert.match(ledger, new RegExp(String.raw`## Run history\n- ${today} \| ship-8 \| rolled-back \| features: alpha \| rollback_verified: false\n`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine ship book <N> deploy-failed records the outcome, inserts one appendShip bullet with no rollback_verified field, and leaves design.md untouched', () => {
  const root = fixture({
    'docs/ships/ship-9.md': approvedRecord(9, ['alpha']),
    'docs/design/design.md': BOOK_DESIGN,
    'docs/ledger/ledger.md': BOOK_LEDGER,
  });
  try {
    const recordPath = path.join(root, 'docs/ships/ship-9.md');
    const designPath = path.join(root, 'docs/design/design.md');
    const ledgerPath = path.join(root, 'docs/ledger/ledger.md');
    const designBefore = readFileSync(designPath, 'utf8');
    const today = new Date().toISOString().slice(0, 10);

    spine(['ship', 'book', '9'], { cwd: root, input: JSON.stringify({ outcome: 'deploy-failed' }) });

    const record = readFileSync(recordPath, 'utf8');
    assert.match(record, /outcome: deploy-failed/);
    assert.doesNotMatch(record, /rollback_verified/);
    assert.equal(readFileSync(designPath, 'utf8'), designBefore);

    const ledger = readFileSync(ledgerPath, 'utf8');
    assert.match(ledger, new RegExp(String.raw`## Run history\n- ${today} \| ship-9 \| deploy-failed \| features: alpha\n`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine ship book exits 1 with nothing written when no record exists for N', () => {
  const root = fixture({ 'docs/design/design.md': BOOK_DESIGN, 'docs/ledger/ledger.md': BOOK_LEDGER });
  try {
    const before = snapshot(root, 'docs/design/design.md', 'docs/ledger/ledger.md');
    spineFails(['ship', 'book', '42'], { cwd: root, input: JSON.stringify({ outcome: 'deployed' }) });
    assertUnchanged(root, before);
    assert.equal(existsSync(path.join(root, 'docs/ships/ship-42.md')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine ship book exits 1 with nothing written when the record carries no approval', () => {
  const root = fixture({
    'docs/ships/ship-10.md': UNAPPROVED_FOR_BOOK,
    'docs/design/design.md': BOOK_DESIGN,
    'docs/ledger/ledger.md': BOOK_LEDGER,
  });
  try {
    const before = snapshot(root, 'docs/ships/ship-10.md', 'docs/design/design.md', 'docs/ledger/ledger.md');
    spineFails(['ship', 'book', '10'], { cwd: root, input: JSON.stringify({ outcome: 'deployed' }) });
    assertUnchanged(root, before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine ship book exits 1 with nothing written when the record already carries an outcome', () => {
  const root = fixture({
    'docs/ships/ship-1.md': SHIP_1_DEPLOYED,
    'docs/design/design.md': BOOK_DESIGN,
    'docs/ledger/ledger.md': BOOK_LEDGER,
  });
  try {
    const before = snapshot(root, 'docs/ships/ship-1.md', 'docs/design/design.md', 'docs/ledger/ledger.md');
    spineFails(['ship', 'book', '1'], { cwd: root, input: JSON.stringify({ outcome: 'rolled-back' }) });
    assertUnchanged(root, before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine ship book exits 1 with nothing written when the outcome is outside deployed|rolled-back|deploy-failed', () => {
  const root = fixture({
    'docs/ships/ship-11.md': approvedRecord(11, ['alpha']),
    'docs/design/design.md': BOOK_DESIGN,
    'docs/ledger/ledger.md': BOOK_LEDGER,
  });
  try {
    const before = snapshot(root, 'docs/ships/ship-11.md', 'docs/design/design.md', 'docs/ledger/ledger.md');
    spineFails(['ship', 'book', '11'], { cwd: root, input: JSON.stringify({ outcome: 'cancelled' }) });
    assertUnchanged(root, before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('spine ship book exits 1 with nothing written when a deployed booking lists a feature unknown to the graph or not currently validated', () => {
  const root = fixture({
    'docs/ships/ship-12.md': approvedRecord(12, ['delta']), // unknown to the graph
    'docs/ships/ship-13.md': approvedRecord(13, ['gamma']), // known, but status: building
    'docs/design/design.md': BOOK_DESIGN,
    'docs/ledger/ledger.md': BOOK_LEDGER,
  });
  try {
    const before = snapshot(
      root, 'docs/ships/ship-12.md', 'docs/ships/ship-13.md', 'docs/design/design.md', 'docs/ledger/ledger.md',
    );
    spineFails(['ship', 'book', '12'], { cwd: root, input: JSON.stringify({ outcome: 'deployed' }) });
    spineFails(['ship', 'book', '13'], { cwd: root, input: JSON.stringify({ outcome: 'deployed' }) });
    assertUnchanged(root, before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
