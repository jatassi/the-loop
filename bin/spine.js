#!/usr/bin/env node
// CLI over the artifact spine, for the interactive session and agents. (The Workflow
// itself has no filesystem — it consumes the index via `args`.) Commands print JSON to
// stdout; `check` is a lint that sets the exit code (0 ok / 1 on errors or round-trip drift).
//
//   spine parse  [design.md]        the full parsed model (minus internals)
//   spine index  [design.md]        the compact workflow-args index (no contract bodies)
//   spine resolve <id> [design.md]  a feature node + the contracts it references
//   spine check  [design.md]        validate + round-trip; report; exit 1 on failure
//   spine set-status <feature-id> <status>  flip one feature's status in design.md; prints
//                                            the updated node as JSON; exit 1, unwritten, on
//                                            an unknown id or an out-of-enum status
//   spine note <feature-id> <text>  append <text> to a feature's notes array in design.md;
//                                    prints the updated node as JSON; exit 1, unwritten, on
//                                    an unknown id or empty text
//   spine ledger render             regenerate docs/ledger/ledger.md from design.md +
//                                    docs/escalations/*.md (absent dir = none); idempotent
//   spine ledger append-run [summary.json|-]  insert one newest-first Run-history bullet
//                                    from a run-summary JSON; exit 1, unwritten, when
//                                    date/run are missing, the Ledger has no
//                                    "## Run history" heading, or the Ledger is absent
//   spine plan parse <feature-id> [plan.md]             the parsed plan model
//   spine plan check <feature-id> [plan.md] [design.md] validate against the design + round-trip
//   spine plan task <feature-id> <task-id> [plan.md] [design.md]        a build agent's task slice
//   spine plan report <feature-id> <task-id> [report.json|-] [plan.md]  fold a completion report in
//   spine plan remediate <feature-id> [findings.json|-]  append the remediation round-marker task;
//                                                        exit 1, unwritten, on a second round or a
//                                                        findings set with no file:line locations
//   spine plan fix <feature-id> [fix.json|-]  append a fix-N task (not one-shot); resets +
//                                             chains any blocked task behind it; exit 1,
//                                             unwritten, on empty acceptance/footprint
//   spine validate scan <feature-id> [target] [branch]  forensics tripwires + patch-id dedup over
//                                                       the feature branch's diff (target: main,
//                                                       branch: loop/<feature-id> by default)
//   spine validate waive <feature-id> [waiver.json|-]  append one waiver to the LAST
//                                                       "## Validation" entry; exit 1, unwritten,
//                                                       on a missing required field, a missing
//                                                       validations file, or a file with no entry
//   spine escalation resolve <feature-id> <kind> [--reason <text>] [--phase <plan|build|validate>]
//                                    resolve a parked feature: validate kind against the record's
//                                    phase, flip the status, run kind-specific extras (re-plan
//                                    deletes the plan; retry-on-validate stamps the retried mark),
//                                    delete the record, re-render the Ledger. Never commits — the
//                                    adjust skill owns the booking commit. --phase is the
//                                    damaged-park escape hatch (no record). exit 1, unwritten, on
//                                    any invalid kind/phase/guard
//   spine models [defaults.json]    resolved role table: plugin defaults <
//                                    project (.claude/settings.json) < local
//                                    (.claude/settings.local.json), "the-loop".modelBindings
//   spine ship status                docs/ships/ship-*.md's count, next N, previous
//                                    ship_sha, and the latest record's projection
//                                    ({ship, ship_sha, outcome, interrupted}) — the
//                                    healing + pin helper; exit 1, naming the file, on a
//                                    record with no "## Ship record" block

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseEscalation, planResolution } from '../src/escalation.js';
import { appendRun, renderLedger } from '../src/ledger.js';
import { resolveModels } from '../src/models.js';
import { appendNote } from '../src/note.js';
import { parse } from '../src/parse.js';
import { appendFix, appendRemediation, foldReport, parsePlan, planPath, resolveTask, validatePlan } from '../src/plan.js';
import { render } from '../src/render.js';
import { extractIndex, resolveIn } from '../src/resolve.js';
import { validate } from '../src/schema.js';
import { setStatus } from '../src/status.js';
import { appendWaiver, isDeduped, latestEntry, parseUnifiedDiff, scan, stampRetried } from '../src/validate.js';
import { shipCommand } from './ship.js';

const DEFAULT = 'docs/design/design.md';
const LEDGER = 'docs/ledger/ledger.md';
const ESCALATIONS_DIR = 'docs/escalations';
// The plugin's own root: bin/spine.js's parent directory's parent — never cwd.
const PLUGIN_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (file) => readFileSync(file || DEFAULT, 'utf8');
const out = (obj) => process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
const clean = ({ _blocks, ...rest }) => rest; // drop the yaml Documents from JSON output
const fail = (msg) => { process.stderr.write(`spine: ${msg}\n`); process.exit(1); };

const [cmd, ...rest] = process.argv.slice(2);

try {
  switch (cmd) {
    case 'parse': {
      const model = parse(read(rest[0]));
      out(clean(model));
      break;
    }
    case 'index': {
      const model = parse(read(rest[0]));
      out(extractIndex(model));
      break;
    }
    case 'resolve': {
      if (!rest[0]) { fail('usage: spine resolve <feature-id> [design.md]'); }
      const model = parse(read(rest[1]));
      out(resolveIn(model, rest[0]));
      break;
    }
    case 'check': {
      process.exit(check(rest[0]));
      break;
    }
    case 'set-status': {
      setStatusCommand(rest);
      break;
    }
    case 'note': {
      noteCommand(rest);
      break;
    }
    case 'ledger': {
      ledgerCommand(rest);
      break;
    }
    case 'plan': {
      planCommand(rest);
      break;
    }
    case 'validate': {
      validateCommand(rest);
      break;
    }
    case 'escalation': {
      escalationCommand(rest);
      break;
    }
    case 'models': {
      modelsCommand(rest);
      break;
    }
    case 'ship': { shipCommand(rest); break; }
    default: {
      process.stdout.write('usage: spine <parse|index|resolve <id>|check|set-status <id> <status>|note <id> <text>|ledger render|plan <parse|check|task|report|remediate|fix> <id>|validate <scan|waive> <id>|escalation resolve <id> <kind>|models [defaults.json]|ship status> [file…]\n');
      process.exit(cmd ? 1 : 0);
    }
  }
} catch (error) {
  fail(error.message);
}

// spine set-status <feature-id> <status> — flip one feature's status in design.md.
function setStatusCommand([featureId, status]) {
  if (!featureId || !status) { fail('usage: spine set-status <feature-id> <status>'); }
  const text = read();
  const model = parse(text);
  setStatus(model, featureId, status);
  writeFileSync(DEFAULT, render(text, model));
  out(model.features.find((f) => f.id === featureId));
}

// spine note <feature-id> <text> — append a note to one feature node in design.md.
function noteCommand([featureId, text]) {
  if (!featureId || !text) { fail('usage: spine note <feature-id> <text>'); }
  const source = read();
  const model = parse(source);
  appendNote(model, featureId, text);
  writeFileSync(DEFAULT, render(source, model));
  out(model.features.find((f) => f.id === featureId));
}

// spine ledger <render|append-run [summary.json|-]>.
function ledgerCommand([sub, arg]) {
  if (sub === 'render') {
    const model = parse(read());
    const priorText = existsSync(LEDGER) ? readFileSync(LEDGER, 'utf8') : '';
    writeFileSync(LEDGER, renderLedger(model, readEscalations(), priorText));
    out({ written: LEDGER });
    return;
  }
  if (sub === 'append-run') {
    appendRunCommand(arg);
    return;
  }
  fail('usage: spine ledger <render|append-run [summary.json|-]>');
}

// spine ledger append-run [summary.json|-] — read a run-summary JSON (file arg, "-", or
// omitted all mean stdin) and insert its bullet into the Ledger. A missing Ledger file
// throws here, before any write; a summary the pure function refuses throws too.
function appendRunCommand(summaryFile) {
  const source = summaryFile && summaryFile !== '-' ? summaryFile : 0; // 0 = stdin
  const summary = JSON.parse(readFileSync(source, 'utf8'));
  const priorText = readFileSync(LEDGER, 'utf8');
  writeFileSync(LEDGER, appendRun(priorText, summary));
  out({ written: LEDGER });
}

// docs/escalations/*.md → open EscalationRecords; an absent directory means none.
function readEscalations() {
  if (!existsSync(ESCALATIONS_DIR)) { return []; }
  return readdirSync(ESCALATIONS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => parseEscalation(readFileSync(path.join(ESCALATIONS_DIR, f), 'utf8')))
    .filter(Boolean);
}

// spine models [defaults.json] — the resolved role table: plugin defaults <
// project (.claude/settings.json) < local (.claude/settings.local.json), both under
// the "the-loop".modelBindings key, both read from cwd (agents run at the target
// repo's root). The optional trailing arg overrides the defaults-file path.
// The plugin-defaults file is read and parsed right here (not a separate readDefaults
// helper — this file's shared eslint max-lines budget has no room for the wrapper): a
// read or parse failure names the file.
function modelsCommand([defaultsFile]) {
  const defaultsPath = defaultsFile || path.join(PLUGIN_ROOT, 'config/model-bindings.json');
  let text;
  try {
    text = readFileSync(defaultsPath, 'utf8');
  } catch (error) {
    throw new Error(`could not read defaults file ${defaultsPath}: ${error.message}`, { cause: error });
  }
  let defaults;
  try {
    defaults = JSON.parse(text);
  } catch (error) {
    throw new Error(`unparseable JSON in ${defaultsPath}: ${error.message}`, { cause: error });
  }
  const project = readSettingsLayer('.claude/settings.json');
  const local = readSettingsLayer('.claude/settings.local.json');
  out(resolveModels({ defaults, project, local }));
}

// A settings layer (project or local): a missing file, or a present file missing the
// "the-loop".modelBindings key, is an empty layer — never an error. Unparseable JSON
// in a present file is an error naming the file.
function readSettingsLayer(file) {
  if (!existsSync(file)) { return {}; }
  let settings;
  try {
    settings = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`unparseable JSON in ${file}: ${error.message}`, { cause: error });
  }
  return settings?.['the-loop']?.modelBindings ?? {};
}

// The plan subcommands: parse | check | task | report | remediate | fix.
function planCommand(argv) {
  const [sub, featureId, ...args] = argv;
  if (!featureId || !['parse', 'check', 'task', 'report', 'remediate', 'fix'].includes(sub)) {
    fail('usage: spine plan <parse|check|task|report|remediate|fix> <feature-id> …');
  }
  switch (sub) {
    case 'parse': {
      const text = readFileSync(args[0] || planPath(featureId), 'utf8');
      out(clean(parsePlan(text)));
      break;
    }
    case 'check': {
      process.exit(planCheck(featureId, args[0], args[1]));
      break;
    }
    case 'task': {
      taskCommand(featureId, args);
      break;
    }
    case 'remediate': {
      remediateCommand(featureId, args);
      break;
    }
    case 'fix': {
      fixCommand(featureId, args);
      break;
    }
    default: {
      reportCommand(featureId, args);
    }
  }
}

// spine plan task <feature-id> <task-id> [plan.md] [design.md] — a build agent's slice.
function taskCommand(featureId, [taskId, planFile, designFile]) {
  if (!taskId) { fail('usage: spine plan task <feature-id> <task-id> [plan.md] [design.md]'); }
  const { plan } = loadPlan(featureId, planFile);
  const design = parse(read(designFile));
  out(resolveTask(plan, design, taskId));
}

// spine plan report <feature-id> <task-id> [report.json|-] [plan.md] — fold + write back.
function reportCommand(featureId, [taskId, reportFile, planFile]) {
  if (!taskId) { fail('usage: spine plan report <feature-id> <task-id> [report.json|-] [plan.md]'); }
  const source = reportFile && reportFile !== '-' ? reportFile : 0; // 0 = stdin
  const report = JSON.parse(readFileSync(source, 'utf8'));
  const { file, text, plan } = loadPlan(featureId, planFile);
  foldReport(plan, taskId, report);
  writeFileSync(file, render(text, plan));
  out(plan.tasks.find((t) => t.id === taskId));
}

// spine plan remediate <feature-id> [findings.json|-] — append the round-marker + write back.
function remediateCommand(featureId, [findingsFile]) {
  const source = findingsFile && findingsFile !== '-' ? findingsFile : 0; // 0 = stdin
  const findings = JSON.parse(readFileSync(source, 'utf8'));
  const { file, text, plan } = loadPlan(featureId);
  appendRemediation(plan, findings);
  writeFileSync(file, render(text, plan));
  out(plan.tasks.find((t) => t.remediation));
}

// spine plan fix <feature-id> [fix.json|-] — append a fix-N task + write back.
function fixCommand(featureId, [fixFile]) {
  const source = fixFile && fixFile !== '-' ? fixFile : 0; // 0 = stdin
  const directive = JSON.parse(readFileSync(source, 'utf8'));
  const { file, text, plan } = loadPlan(featureId);
  const task = appendFix(plan, directive);
  writeFileSync(file, render(text, plan));
  out(task);
}

// spine validate <scan|waive> <feature-id> …
function validateCommand(argv) {
  const [sub, featureId, ...args] = argv;
  if (sub === 'waive') { waiveCommand(featureId, args); return; }
  if (sub !== 'scan' || !featureId) { fail('usage: spine validate <scan <feature-id> [target] [branch]|waive <feature-id> [waiver.json|-]>'); }
  scanCommand(featureId, args);
}

// spine validate scan <feature-id> [target] [branch] — the forensics scanner (leg 1).
// Gathers the git facts here (the bin edge owns effects), scans in the pure core.
function scanCommand(featureId, args) {
  const target = args[0] || 'main';
  const branch = args[1] || `loop/${featureId}`;
  const base = gitOut(`git merge-base ${target} ${branch}`).trim();
  const patchId = gitOut(`git diff ${base} ${branch} | git patch-id --stable`).split(' ', 1)[0] || null;
  const planFile = planPath(featureId);
  const plan = existsSync(planFile) ? parsePlan(readFileSync(planFile, 'utf8')) : null;
  const validationsFile = `docs/validations/${featureId}.md`;
  const latest = existsSync(validationsFile) ? latestEntry(readFileSync(validationsFile, 'utf8')) : null;
  const diff = parseUnifiedDiff(gitOut(`git diff --unified=0 ${base} ${branch}`));
  out({
    feature: featureId, target, branch, base,
    patch_id: patchId,
    dedup: isDeduped(patchId, latest),
    retried: latest ? latest.retried : null,
    latest_result: latest ? latest.result : null,
    hits: scan({ diff, plan }),
  });
}

// spine validate waive <feature-id> [waiver.json|-] — append one waiver to the entry
// under the LAST "## Validation" heading; refuses (nothing written) on a missing
// required field, a missing validations file, or a file with no entry yet.
function waiveCommand(featureId, [waiverFile]) {
  if (!featureId) { fail('usage: spine validate waive <feature-id> [waiver.json|-]'); }
  const source = waiverFile && waiverFile !== '-' ? waiverFile : 0; // 0 = stdin
  const waiver = JSON.parse(readFileSync(source, 'utf8'));
  const file = `docs/validations/${featureId}.md`;
  const updated = appendWaiver(readFileSync(file, 'utf8'), waiver);
  writeFileSync(file, updated);
  out(latestEntry(updated));
}

// spine escalation resolve <feature-id> <kind> [--reason <text>] [--phase <plan|build|validate>].
// The two flags each take a value; anything else is exit-1.
function escalationCommand(argv) {
  const [sub, featureId, kind, ...flags] = argv;
  if (sub !== 'resolve' || !featureId || !kind) { fail('usage: spine escalation resolve <feature-id> <kind> [--reason <text>] [--phase <plan|build|validate>]'); }
  const opts = {};
  for (let i = 0; i < flags.length; i += 2) {
    const key = { '--reason': 'reason', '--phase': 'phase' }[flags[i]];
    if (!key || flags[i + 1] === undefined) { fail(`unknown or valueless flag: ${flags[i]}`); }
    opts[key] = flags[i + 1];
  }
  resolveEscalationCommand(featureId, kind, opts);
}

// Fold a parked feature back in. Every guard runs before the first write, so a refused
// resolution leaves the target untouched; then the contracted effect order runs: flip
// status, run kind-specific extras, delete the record, re-render the Ledger (so
// What-needs-you drops the entry). Never commits — the adjust skill books the commit.
function resolveEscalationCommand(featureId, kind, { reason, phase: phaseFlag }) {
  const recordFile = path.join(ESCALATIONS_DIR, `${featureId}.md`);
  const phase = resolveParkPhase(recordFile, phaseFlag);
  const text = read();
  const model = parse(text);
  const feature = model.features.find((f) => f.id === featureId);
  if (!feature) { fail(`unknown feature id: ${featureId}`); }
  if (feature.status !== 'parked') { fail(`feature ${featureId} is ${feature.status}, not parked`); }
  const { status, deletesPlan, stampsRetried } = planResolution(kind, phase, { reason });

  setStatus(model, featureId, status);
  writeFileSync(DEFAULT, render(text, model));
  const deleted = deletesPlan ? removePlan(featureId) : [];
  const retried = stampsRetried ? stampValidations(featureId, reason) : null;
  if (!phaseFlag) { unlinkSync(recordFile); deleted.push(recordFile); }
  const priorLedger = existsSync(LEDGER) ? readFileSync(LEDGER, 'utf8') : '';
  writeFileSync(LEDGER, renderLedger(model, readEscalations(), priorLedger));
  out({ feature: featureId, kind, phase, status, deleted, retried });
}

// The park's phase: from the record normally, or from --phase (the damaged-park escape
// hatch) when no record exists. A present record and --phase are mutually exclusive —
// either mismatch is exit-1 before any write.
function resolveParkPhase(recordFile, phaseFlag) {
  const record = existsSync(recordFile) ? parseEscalation(readFileSync(recordFile, 'utf8')) : null;
  if (phaseFlag && record) { fail(`a record exists at ${recordFile}; --phase is for a damaged park with no record`); }
  if (!phaseFlag && !record) { fail(`no escalation record at ${recordFile}; pass --phase for a damaged park`); }
  return phaseFlag || record.phase;
}

// re-plan discards the plan artifact when one exists.
function removePlan(featureId) {
  const file = planPath(featureId);
  if (!existsSync(file)) { return []; }
  unlinkSync(file);
  return [file];
}

// retry-on-a-validate-park stamps the latest validations entry with today's UTC date
// and the human's reason, so the next scan dedups false and re-runs all four legs.
function stampValidations(featureId, reason) {
  const file = `docs/validations/${featureId}.md`;
  const mark = `${new Date().toISOString().slice(0, 10)} — ${reason}`;
  writeFileSync(file, stampRetried(readFileSync(file, 'utf8'), mark));
  return mark;
}

// A declaration, not a const, so the dispatch above can reach it (see printIssue).
function gitOut(cmd) {
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// Read + parse a plan artifact, guarding the feature-id match.
function loadPlan(featureId, planFile) {
  const file = planFile || planPath(featureId);
  const text = readFileSync(file, 'utf8');
  const plan = parsePlan(text);
  if (plan.feature !== featureId) { fail(`plan declares feature "${plan.feature}", not "${featureId}"`); }
  return { file, text, plan };
}

// A function declaration, deliberately: the CLI dispatch above runs at module
// evaluation, before any `const` below it would initialize — only hoisted
// declarations are safely callable from it.
function printIssue(kind, i) {
  process.stdout.write(`  ${kind} ${i.code}: ${i.message}${i.where ? ` (${i.where})` : ''}\n`);
}

function printIssues(warnings, errors) {
  for (const w of warnings) { printIssue('warn ', w); }
  for (const e of errors) { printIssue('ERROR', e); }
}

function check(file) {
  const text = read(file);
  const model = parse(text);
  const { ok, errors, warnings } = validate(model);
  const didRoundTrip = render(text, model) === text;

  printIssues(warnings, errors);
  if (!didRoundTrip) { process.stdout.write('  ERROR round-trip: render(text, parse(text)) != text\n'); }

  const good = ok && didRoundTrip;
  process.stdout.write(
    `${good ? 'OK  ' : 'FAIL'} ${model.features.length} features, ${model.contracts.length} contracts — ` +
    `${errors.length} error(s), ${warnings.length} warning(s)\n`,
  );
  return good ? 0 : 1;
}

function planCheck(featureId, planFile, designFile) {
  const text = readFileSync(planFile || planPath(featureId), 'utf8');
  const model = parsePlan(text);
  const design = parse(read(designFile));
  const { ok, errors, warnings } = validatePlan(model, design, { standardExists: (p) => existsSync(p) });
  if (model.feature !== featureId) {
    errors.push({ code: 'feature-mismatch', message: `plan declares feature "${model.feature}" but was checked as "${featureId}"` });
  }
  const didRoundTrip = render(text, model) === text;

  printIssues(warnings, errors);
  if (!didRoundTrip) { process.stdout.write('  ERROR round-trip: render(text, parsePlan(text)) != text\n'); }

  const good = ok && errors.length === 0 && didRoundTrip;
  process.stdout.write(
    `${good ? 'OK  ' : 'FAIL'} plan ${featureId}: ${model.tasks.length} task(s) — ` +
    `${errors.length} error(s), ${warnings.length} warning(s)\n`,
  );
  return good ? 0 : 1;
}
