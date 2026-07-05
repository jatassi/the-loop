// Command implementations for the the-loop CLI. Split out of bin/the-loop.js (its sibling
// and sole caller) to keep that file's job to argv dispatch alone; this module holds
// the actual command bodies and the small I/O helpers (read/out/clean/fail) they share.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sectionAfter } from '../src/blocks.js';
import { parseExecutors, validateBindings } from '../src/executors.js';
import { assembleSnapshot, checkScope, featureBranch } from '../src/launch.js';
import { renderLedger } from '../src/ledger.js';
import { resolveModels } from '../src/models.js';
import { parse } from '../src/parse.js';
import { parsePlan, planPath, resolveTask, validatePlan } from '../src/plan.js';
import { render } from '../src/render.js';
import { validate } from '../src/schema.js';
import { setStatus } from '../src/status.js';

const GRAPH = 'docs/design/graph.md';
const DESIGN = 'docs/design/design.md';
const FEATURES_DIR = 'docs/design/features';
const RCA_DIR = 'docs/rca';
const WORKTREES_DIR = '.claude/worktrees';
// The plugin's own root: this file's parent directory's parent — never cwd.
export const PLUGIN_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const read = (file) => readFileSync(file || GRAPH, 'utf8');
export const out = (obj) => process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
export const clean = ({ _blocks, ...rest }) => rest; // drop the yaml Documents from JSON output
export const fail = (msg) => { process.stderr.write(`spine: ${msg}\n`); process.exit(1); };
const warn = (msg) => process.stderr.write(`spine: warn — ${msg}\n`);

// spine set-status <feature-id> <status> — flip one feature's status in graph.md.
export function setStatusCommand([featureId, status]) {
  if (!featureId || !status) { fail('usage: spine set-status <feature-id> <status>'); }
  const text = read();
  const model = parse(text);
  setStatus(model, featureId, status);
  writeFileSync(GRAPH, render(text, model));
  out(model.features.find((f) => f.id === featureId));
}

// spine ledger [graph.md] — print the status story to stdout; writes nothing.
export function ledgerCommand([file]) {
  const model = parse(read(file));
  const story = renderLedger(model);
  process.stdout.write(story);
}

// spine models [defaults.json] [executors-dir] — print the resolved role table.
// A hard error (unregistered executor, model outside its playbook) exits 1 with no
// table; guard warnings print to stderr but never fail.
export function modelsCommand([defaultsFile, executorsDir]) {
  const { table, errors, warnings } = buildModelsTable(defaultsFile, executorsDir);
  for (const w of warnings) { process.stderr.write(`warn ${w.code}: ${w.message} (${w.where})\n`); }
  if (errors.length > 0) {
    for (const e of errors) { process.stderr.write(`error ${e.code}: ${e.message} (${e.where})\n`); }
    process.exit(1);
  }
  out(table);
}

// The resolved role table + registry validation, shared by `models` and `launch`:
// plugin defaults < project (.claude/settings.json) < local (.claude/settings.local.json),
// both under the "the-loop".modelBindings key, both read from cwd.
function buildModelsTable(defaultsFile, executorsDir) {
  const defaultsPath = defaultsFile || path.join(PLUGIN_ROOT, 'config/model-bindings.json');
  const defaults = readDefaults(defaultsPath);
  const project = readSettingsLayer('.claude/settings.json');
  const local = readSettingsLayer('.claude/settings.local.json');
  const table = resolveModels({ defaults, project, local });
  const registry = readRegistry(executorsDir || path.join(PLUGIN_ROOT, 'executors'));
  const { errors, warnings } = validateBindings(table, registry);
  return { table, errors, warnings };
}

// Every *.md file in dir, parsed into the registry keyed by id; an absent dir is an
// empty registry, never an error (a delegation-off repo need not ship executors/).
export function readRegistry(dir) {
  if (!existsSync(dir)) { return {}; }
  const entries = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ file: path.join(dir, f), text: readFileSync(path.join(dir, f), 'utf8') }));
  return parseExecutors(entries);
}

// The plugin-defaults file: expected to exist and parse — a read or parse failure
// names the file.
function readDefaults(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`could not read defaults file ${file}: ${error.message}`, { cause: error });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`unparseable JSON in ${file}: ${error.message}`, { cause: error });
  }
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

// The plan subcommands: parse | check | task.
export function planCommand(argv) {
  const [sub, featureId, ...args] = argv;
  if (!featureId || !['parse', 'check', 'task'].includes(sub)) {
    fail('usage: spine plan <parse|check|task> <feature-id> …');
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
    default: {
      taskCommand(featureId, args);
    }
  }
}

// spine plan task <feature-id> <task-id> [plan.md] [graph.md] — a build task's kernel.
function taskCommand(featureId, [taskId, planFile, graphFile]) {
  if (!taskId) { fail('usage: spine plan task <feature-id> <task-id> [plan.md] [graph.md]'); }
  const { plan } = loadPlan(featureId, planFile);
  const design = parse(read(graphFile));
  out(resolveTask(plan, design, taskId));
}

// the-loop launch --scope <id,id,…> --target <ref> — the one-shot snapshot assembler
// (ADR-0036/0038): gates the graph and the scope, gathers every per-feature input
// (design doc, plan from the feature branch, task state from git), and prints the
// snapshot the workflow consumes as `args`. Any gate failure exits 1 with nothing
// printed to stdout. No default target: a guessed target can silently diverge from
// the branch the snapshot's artifacts were read from, and the whole run inherits
// the mismatch — the caller must name the ref the run integrates into.
export function launchCommand(argv) {
  const opts = parseFlags(argv, { '--scope': 'scope', '--target': 'target' });
  if (!opts.scope || !opts.target) { fail('usage: the-loop launch --scope <id,id,…> --target <ref>'); }
  const scope = opts.scope.split(',').map((s) => s.trim()).filter(Boolean);
  const target = opts.target;

  const model = parse(read());
  const graphIssues = validate(model);
  failOnIssues(graphIssues.errors, `the feature graph fails validation — fix ${GRAPH} first`);
  failOnIssues(checkScope(model, scope).errors, 'scope gate failed — nothing launched');

  const { table: models, errors, warnings } = buildModelsTable();
  for (const w of warnings) { process.stderr.write(`warn ${w.code}: ${w.message} (${w.where})\n`); }
  failOnIssues(errors, 'model bindings failed executor validation — nothing launched');

  const probe = existsSync(DESIGN) ? sectionAfter(readFileSync(DESIGN, 'utf8'), '## Runtime probe') : null;
  if (probe == null) { warn(`no "## Runtime probe" section in ${DESIGN} — validation runs without a runtime probe`); }

  const inputs = {};
  for (const id of scope) {
    inputs[id] = gatherFeatureInputs(id, model);
  }
  const cli = `node "${path.join(PLUGIN_ROOT, 'bin/the-loop.js')}"`;
  out(assembleSnapshot({ model, scope, target, probe, models, inputs, cli }));
}

// Print every issue to stderr and exit 1 — the gate refusal every launch check shares.
function failOnIssues(errors, message) {
  if (errors.length === 0) { return; }
  for (const e of errors) { process.stderr.write(`error ${e.code}: ${e.message}${e.where ? ` (${e.where})` : ''}\n`); }
  fail(message);
}

// One feature's launch-time inputs: its design doc, its plan (from the feature
// branch first — the plan's durable home — falling back to a working-tree file),
// and the head subjects of its branches (task state).
function gatherFeatureInputs(id, model) {
  const docFile = path.join(FEATURES_DIR, `${id}.md`);
  let designDoc = existsSync(docFile) ? readFileSync(docFile, 'utf8') : null;
  // A fix node has no docs/design/features/ doc — its context slice is its RCA doc
  // instead (diagnose feature: docs/rca/<id>.md), permanent from birth.
  if (designDoc == null) {
    const rcaFile = path.join(RCA_DIR, `${id}.md`);
    designDoc = existsSync(rcaFile) ? readFileSync(rcaFile, 'utf8') : null;
  }
  if (designDoc == null) { warn(`no per-feature design doc at ${docFile}`); }

  const branchHeads = readBranchHeads(id);
  const planText = readPlanText(id, branchHeads);
  return { designDoc, plan: planText == null ? null : gatePlan(id, planText, model), branchHeads };
}

// The plan's durable home is the feature branch; a working-tree file is tolerated
// with a warning (useful mid-migration), absence is simply "not planned yet".
function readPlanText(id, branchHeads) {
  if (branchHeads[featureBranch(id)] !== undefined) {
    const onBranch = gitShowOptional(`${featureBranch(id)}:${planPath(id)}`);
    if (onBranch != null) { return onBranch; }
  }
  if (!existsSync(planPath(id))) { return null; }
  warn(`plan for ${id} read from the working tree, not its branch — commit it to ${featureBranch(id)}`);
  return readFileSync(planPath(id), 'utf8');
}

// A plan that reaches the snapshot must validate against the graph; refusal here
// beats a mid-run stall.
function gatePlan(id, planText, model) {
  const plan = parsePlan(planText);
  const { errors, warnings } = validatePlan(plan, model);
  for (const w of warnings) { warn(`plan ${id}: ${w.code} — ${w.message}${w.where ? ` (${w.where})` : ''}`); }
  failOnIssues(errors, `plan for ${id} fails validation — nothing launched`);
  return clean(plan);
}

// Head subjects of every branch belonging to a feature: loop/<id> and loop/<id>--*.
function readBranchHeads(id) {
  const raw = git(['for-each-ref', `refs/heads/${featureBranch(id)}`, `refs/heads/${featureBranch(id)}--*`,
    '--format=%(refname:short)\t%(subject)']);
  const lines = raw.split('\n').filter(Boolean);
  const heads = {};
  for (const line of lines) {
    const [name, ...subject] = line.split('\t');
    heads[name] = subject.join('\t');
  }
  return heads;
}

// spine worktree <create <branch> [--from <ref>] | remove <path>> — the one sanctioned
// worktree lifecycle (ADR-0038): agents call create as their first act and do all work
// inside the printed path; the main checkout is the human's and is never touched.
export function worktreeCommand(argv) {
  const [sub, ...rest] = argv;
  if (sub === 'create') { worktreeCreate(rest); return; }
  if (sub === 'remove') { worktreeRemove(rest); return; }
  fail('usage: spine worktree <create <branch> [--from <ref>]|remove <path>>');
}

function worktreeCreate([branch, ...flagArgs]) {
  if (!branch) { fail('usage: spine worktree create <branch> [--from <ref>]'); }
  const { from } = parseFlags(flagArgs, { '--from': 'from' });
  const dir = path.join(WORKTREES_DIR, branch.replaceAll('/', '-'));
  if (existsSync(dir)) {
    out({ path: dir, branch, created: false });
    return;
  }
  const branchExists = gitOk(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
  if (branchExists) { git(['worktree', 'add', dir, branch]); }
  else { git(['worktree', 'add', '-b', branch, dir, from || 'main']); }
  linkNodeModules(dir);
  out({ path: dir, branch, created: true });
}

// Worktrees don't share node_modules; for node projects, link the root install in so
// tests run without a per-worktree install. Best-effort: any failure just skips it.
function linkNodeModules(dir) {
  try {
    if (existsSync(path.join(dir, 'package.json')) && existsSync('node_modules') && !existsSync(path.join(dir, 'node_modules'))) {
      symlinkSync(path.resolve('node_modules'), path.join(dir, 'node_modules'), 'dir');
    }
  } catch { /* best-effort */ }
}

function worktreeRemove([dir]) {
  if (!dir) { fail('usage: spine worktree remove <path>'); }
  git(['worktree', 'remove', '--force', dir]);
  git(['worktree', 'prune']);
  out({ removed: dir });
}

// --flag value pairs → an options object; an unknown or valueless flag is exit-1.
function parseFlags(argv, map) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = map[argv[i]];
    if (!key || argv[i + 1] === undefined) { fail(`unknown or valueless flag: ${argv[i]}`); }
    opts[key] = argv[i + 1];
  }
  return opts;
}

// git with argv handed straight to the binary — never a shell. A ref built from an
// untrusted graph's feature id therefore reaches git as one literal argument: shell
// metacharacters in it cannot start a command, they just make an unresolvable ref
// that fails cleanly.
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function gitOk(args) {
  try { git(args); return true; } catch { return false; }
}

function gitShowOptional(spec) {
  try { return git(['show', spec]); } catch { return null; }
}

// Read + parse a plan artifact, guarding the feature-id match.
function loadPlan(featureId, planFile) {
  const file = planFile || planPath(featureId);
  const text = readFileSync(file, 'utf8');
  const plan = parsePlan(text);
  if (plan.feature !== featureId) { fail(`plan declares feature "${plan.feature}", not "${featureId}"`); }
  return { file, text, plan };
}

function printIssue(kind, i) {
  process.stdout.write(`  ${kind} ${i.code}: ${i.message}${i.where ? ` (${i.where})` : ''}\n`);
}

function printIssues(warnings, errors) {
  for (const w of warnings) { printIssue('warn ', w); }
  for (const e of errors) { printIssue('ERROR', e); }
}

export function check(file) {
  const text = read(file);
  const model = parse(text);
  const { ok, errors, warnings } = validate(model);
  const didRoundTrip = render(text, model) === text;

  printIssues(warnings, errors);
  if (!didRoundTrip) { process.stdout.write('  ERROR round-trip: render(text, parse(text)) != text\n'); }

  const good = ok && didRoundTrip;
  process.stdout.write(
    `${good ? 'OK  ' : 'FAIL'} ${model.features.length} features — ` +
    `${errors.length} error(s), ${warnings.length} warning(s)\n`,
  );
  return good ? 0 : 1;
}

function planCheck(featureId, planFile, graphFile) {
  const text = readFileSync(planFile || planPath(featureId), 'utf8');
  const model = parsePlan(text);
  const design = parse(read(graphFile));
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
