// spine ship <status|book> — the ship-record CLI surface. Split out of bin/spine.js, which
// already sits at its own eslint max-lines ceiling (docs/plans/surfacing.md's t5/t6
// completion reports flagged this file's shared budget as a recurring planning signal
// for growing CLI namespaces): filesystem reads still stay at this bin edge; all
// parsing and decisions come from src/ship.js, src/ledger.js, and src/status.js.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { nextCorridorStep } from '../src/corridor.js';
import { parseEscalation } from '../src/escalation.js';
import { appendShip, renderLedger } from '../src/ledger.js';
import { parse } from '../src/parse.js';
import { render } from '../src/render.js';
import { applyOutcome, isInterrupted, OUTCOMES, parseShipRecord, summarizeShips } from '../src/ship.js';
import { setStatus } from '../src/status.js';

const SHIPS_DIR = 'docs/ships';
const DESIGN_FILE = 'docs/design/design.md';
const LEDGER_FILE = 'docs/ledger/ledger.md';
const ESCALATIONS_DIR = 'docs/escalations';
const out = (obj) => process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
const clean = ({ _blocks, ...rest }) => rest; // drop the retained yaml Document from JSON output
const fail = (msg) => { process.stderr.write(`spine: ${msg}\n`); process.exit(1); };

// bin/spine.js's 'ship' case calls straight in here with its own `rest` args.
export function shipCommand([sub, ...args]) {
  if (sub === 'status') { shipStatusCommand(); return; }
  if (sub === 'book') { shipBookCommand(args); return; }
  if (sub === 'corridor') { shipCorridorCommand(args); return; }
  fail('usage: spine ship <status|book <N> [outcome.json|-]|corridor [corridor.json|-]>');
}

// spine ship status — docs/ships/ship-*.md's count, next N, previous ship_sha, and the
// latest record's {ship, ship_sha, outcome, interrupted} projection (interrupted =
// approval present, no outcome) — the healing + pin helper a re-entering skill checks
// before touching anything.
function shipStatusCommand() {
  const records = (existsSync(SHIPS_DIR) ? readdirSync(SHIPS_DIR) : [])
    .filter((f) => /^ship-\d+\.md$/.test(f))
    .map((f) => readShipRecord(path.join(SHIPS_DIR, f)));
  const { count, latest, next, previous_ship_sha } = summarizeShips(records);
  out({
    ships: count,
    next,
    previous_ship_sha,
    latest: latest && { ship: latest.ship, ship_sha: latest.ship_sha, outcome: latest.outcome ?? null, interrupted: isInterrupted(latest) },
  });
}

// A ship-*.md file with no "## Ship record" block is malformed, not a healing case.
function readShipRecord(file) {
  const record = parseShipRecord(readFileSync(file, 'utf8'));
  if (!record._blocks.record) { fail(`no "## Ship record" block: ${file}`); }
  return record;
}

// spine ship book <N> [outcome.json|-] — commit-2 mechanics: land the corridor's
// concluded outcome in the ship record; on deployed, flip every listed feature
// validated -> shipped in design.md and re-render the Ledger from the flipped graph;
// every outcome (deployed, rolled-back, deploy-failed alike) inserts one appendShip
// bullet. Every guard below runs before the first write, so a refusal leaves the
// record, design.md, and the Ledger all byte-unchanged.
function shipBookCommand([n, outcomeFile]) {
  if (!n) { fail('usage: spine ship book <N> [outcome.json|-]'); }
  const recordFile = path.join(SHIPS_DIR, `ship-${n}.md`);
  const recordText = readRecordTextOrFail(recordFile, n);
  const record = parseShipRecord(recordText);
  guardBookable(record, n);

  const { outcome, rollback_verified } = readOutcomeInput(outcomeFile);
  if (!OUTCOMES.includes(outcome)) { fail(`outcome must be one of ${OUTCOMES.join('|')} (got ${JSON.stringify(outcome)})`); }
  const isDeployed = outcome === 'deployed';
  if (isDeployed) { guardFeaturesValidated(record.features, n); }

  applyOutcome(record, { outcome, rollback_verified });
  writeFileSync(recordFile, render(recordText, record));

  const priorLedger = readFileSync(LEDGER_FILE, 'utf8');
  const ledgerText = isDeployed ? flipAndRenderLedger(record.features, priorLedger) : priorLedger;
  const entry = { date: todayUtc(), ship: record.ship, outcome, features: record.features, rollback_verified };
  writeFileSync(LEDGER_FILE, appendShip(ledgerText, entry));

  out(clean(record));
}

// No record for N is a guard, not a read error: fail before ever touching the outcome
// input or any other file.
function readRecordTextOrFail(recordFile, n) {
  if (!existsSync(recordFile)) { fail(`no ship record: docs/ships/ship-${n}.md`); }
  return readFileSync(recordFile, 'utf8');
}

// A record must carry approval and must not already have concluded — both guarded
// before any write, and before the outcome input is even read.
function guardBookable(record, n) {
  if (!record.approval) { fail(`ship-${n} has no approval`); }
  if (record.outcome != null) { fail(`ship-${n} already carries an outcome (${record.outcome})`); }
}

// {outcome, rollback_verified?} JSON — file arg, "-", or omitted all mean stdin; extra
// fields (e.g. a corridor's health_signal/steps) are simply never destructured.
function readOutcomeInput(outcomeFile) {
  const source = outcomeFile && outcomeFile !== '-' ? outcomeFile : 0; // 0 = stdin
  return JSON.parse(readFileSync(source, 'utf8'));
}

// Deployed only: every listed feature must be known to the graph and currently
// validated — guarded before any write, reading design.md fresh (nothing has written
// it yet) so a bad list refuses cleanly.
function guardFeaturesValidated(features, n) {
  const design = parse(readFileSync(DESIGN_FILE, 'utf8'));
  for (const id of features) {
    const feature = design.features.find((f) => f.id === id);
    if (!feature) { fail(`ship-${n} lists unknown feature: ${id}`); }
    if (feature.status !== 'validated') { fail(`ship-${n} lists ${id}, status ${feature.status} (not validated)`); }
  }
}

// Flip every listed feature validated -> shipped, write design.md, and re-render the
// Ledger from the flipped graph — deployed bookings only. design.md is re-read here
// (every guard, including guardFeaturesValidated's own read, has already passed by
// this point, and nothing has written it yet).
function flipAndRenderLedger(features, priorLedger) {
  const designText = readFileSync(DESIGN_FILE, 'utf8');
  const design = parse(designText);
  for (const id of features) { setStatus(design, id, 'shipped'); }
  writeFileSync(DESIGN_FILE, render(designText, design));
  return renderLedger(design, readEscalations(), priorLedger);
}

// docs/escalations/*.md -> open EscalationRecords; an absent directory means none
// (mirrors bin/spine.js's own readEscalations; kept local since importing back across
// the split would reach into a file whose own dispatch runs at module load).
function readEscalations() {
  if (!existsSync(ESCALATIONS_DIR)) { return []; }
  return readdirSync(ESCALATIONS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => parseEscalation(readFileSync(path.join(ESCALATIONS_DIR, f), 'utf8')))
    .filter(Boolean);
}

// Today's date, UTC, YYYY-MM-DD — the bin edge's one clock read, per ship entries.
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

// spine ship corridor [corridor.json|-] — drive src/corridor.js's pure state machine
// one yielded step at a time: run the step's shell command (exit 0 = ok), feed the
// result back in, and repeat until it concludes. Prints {outcome, rollback_verified?,
// health_signal, steps} and exits 0 on any concluded outcome (deployed, rolled-back, and
// deploy-failed alike); exits 1, running nothing, when deploy or rollback is missing
// from the input.
function shipCorridorCommand([corridorFile]) {
  const binding = readCorridorInput(corridorFile);
  if (!binding.deploy || !binding.rollback) { fail('corridor input requires deploy and rollback command strings'); }

  const steps = [];
  let results = [];
  let next = nextCorridorStep(binding, results);
  while (!('outcome' in next)) {
    const ok = runCorridorStep(next.command);
    steps.push({ step: next.step, command: next.command, ok });
    results = [...results, { step: next.step, ok }];
    next = nextCorridorStep(binding, results);
  }
  out({ ...next, steps });
}

// {deploy, rollback, smoke?} shell-command-string JSON — file arg, "-", or omitted all
// mean stdin.
function readCorridorInput(corridorFile) {
  const source = corridorFile && corridorFile !== '-' ? corridorFile : 0; // 0 = stdin
  return JSON.parse(readFileSync(source, 'utf8'));
}

// Runs one corridor step's shell command; its exit code is the step's pass/fail — the
// corridor core (not this function) decides what happens next.
function runCorridorStep(command) {
  try {
    execSync(command, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
