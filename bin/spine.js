#!/usr/bin/env node
// CLI over the artifact spine, for the interactive session and agents. (The Workflow
// itself has no filesystem — it consumes the index via `args`.) Commands print JSON to
// stdout; `check` is a lint that sets the exit code (0 ok / 1 on errors or round-trip drift).
//
//   spine parse  [design.md]        the full parsed model (minus internals)
//   spine index  [design.md]        the compact workflow-args index (no contract bodies)
//   spine resolve <id> [design.md]  a feature node + the contracts it references
//   spine check  [design.md]        validate + round-trip; report; exit 1 on failure
//   spine plan parse <feature-id> [plan.md]             the parsed plan model
//   spine plan check <feature-id> [plan.md] [design.md] validate against the design + round-trip
//   spine plan task <feature-id> <task-id> [plan.md] [design.md]        a build agent's task slice
//   spine plan report <feature-id> <task-id> [report.json|-] [plan.md]  fold a completion report in

import { readFileSync, writeFileSync } from 'node:fs';

import { parse } from '../src/parse.js';
import { foldReport, parsePlan, planPath, resolveTask, validatePlan } from '../src/plan.js';
import { render } from '../src/render.js';
import { extractIndex, resolveIn } from '../src/resolve.js';
import { validate } from '../src/schema.js';

const DEFAULT = 'docs/design/design.md';
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
    case 'plan': {
      planCommand(rest);
      break;
    }
    default: {
      process.stdout.write('usage: spine <parse|index|resolve <id>|check|plan <parse|check|task|report> <id>> [file…]\n');
      process.exit(cmd ? 1 : 0);
    }
  }
} catch (error) {
  fail(error.message);
}

// The plan subcommands: parse | check | task | report.
function planCommand(argv) {
  const [sub, featureId, ...args] = argv;
  if (!featureId || !['parse', 'check', 'task', 'report'].includes(sub)) {
    fail('usage: spine plan <parse|check|task|report> <feature-id> …');
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

// Read + parse a plan artifact, guarding the feature-id match.
function loadPlan(featureId, planFile) {
  const file = planFile || planPath(featureId);
  const text = readFileSync(file, 'utf8');
  const plan = parsePlan(text);
  if (plan.feature !== featureId) { fail(`plan declares feature "${plan.feature}", not "${featureId}"`); }
  return { file, text, plan };
}

const printIssue = (kind, i) => process.stdout.write(`  ${kind} ${i.code}: ${i.message}${i.where ? ` (${i.where})` : ''}\n`);

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
  const { ok, errors, warnings } = validatePlan(model, design);
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
