// Command implementations for the the-loop CLI. Split out of bin/the-loop.js (its sibling
// and sole caller) to keep that file's job to argv dispatch alone; this module holds
// the actual command bodies and the small I/O helpers (read/out/clean/fail) they share.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderIndex } from '../src/calibration-summarize.js';
import { parseExecutors, validateBindings } from '../src/executor-registry.js';
import { validate } from '../src/feature-schema.js';
import { parse } from '../src/parse-feature-graph.js';
import { parsePlan, planPath, resolveTask, validatePlan } from '../src/plan.js';
import { assembleExecutionContext, checkScope, featureBranch } from '../src/prepare-execution-context.js';
import { machineOrientation } from '../src/propose-next-action.js';
import { sectionAfter } from '../src/replace-fenced-block.js';
import { HOOK_INVENTORY, resolveFamily, resolveModels } from '../src/resolve-model-bindings.js';
import { setStatus } from '../src/set-feature-status.js';
import { describeRun, spliceRunDescription } from '../src/splice-workflow-description.js';
import { renderStatusSummary } from '../src/status-summary.js';
import { render } from '../src/write-feature-graph.js';

const GRAPH = 'docs/feature-graph.md';
export const DESIGN = 'docs/architecture.md';
const DESIGNS_DIR = 'docs/designs';
const BUGS_DIR = 'docs/bugs';
const CALIBRATION_INDEX = 'docs/calibration/index.md';
const WORKTREES_DIR = '.claude/worktrees';
// The plugin's own root: this file's parent directory's parent — never cwd.
export const PLUGIN_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const read = (file) => readFileSync(file || GRAPH, 'utf8');
export const out = (obj) => process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
export const clean = ({ _blocks, ...rest }) => rest; // drop the yaml Documents from JSON output
export const fail = (msg) => { process.stderr.write(`spine: ${msg}\n`); process.exit(1); };
export const warn = (msg) => process.stderr.write(`spine: warn — ${msg}\n`);

// the-loop calibration-summarize — regenerate docs/calibration/index.md wholesale from
// the docs/calibration/runs/*.md record corpus (this repository only). Deterministic:
// the renderer parses every record before emitting a byte, so one malformed record
// throws — naming the file — before anything is written, and the shared top-level catch
// turns that into exit 1 with no index touched.
export function calibrationSummarizeCommand() {
  const runsDir = 'docs/calibration/runs';
  // Read order is irrelevant — renderIndex orders records deterministically itself.
  const records = existsSync(runsDir)
    ? readdirSync(runsDir).filter((f) => f.endsWith('.md'))
      .map((f) => ({ file: path.join(runsDir, f), text: readFileSync(path.join(runsDir, f), 'utf8') }))
    : [];
  const index = renderIndex(records);
  mkdirSync('docs/calibration', { recursive: true });
  writeFileSync('docs/calibration/index.md', index);
  out({ written: 'docs/calibration/index.md', runs: records.length });
}

// the-loop set-status <feature-id> <status> [graph-path] — flip one feature's status in
// the feature graph (default docs/feature-graph.md). When graph-path is supplied, read
// and write that file only — never the default path.
export function setStatusCommand([featureId, status, graphPath]) {
  if (!featureId || !status) { fail('usage: spine set-status <feature-id> <status> [graph-path]'); }
  const file = graphPath || GRAPH;
  const text = read(graphPath);
  const model = parse(text);
  setStatus(model, featureId, status);
  writeFileSync(file, render(text, model));
  out(model.features.find((f) => f.id === featureId));
}

// the-loop status [feature-graph.md] [--json] — the human-readable status summary by default;
// --json is the machine orientation (mode, position, eligible set, next-action
// proposal). Neither writes anything. The one approved functional consolidation of
// the former orient and ledger subcommands (sweep mechanics note 1).
export function statusCommand(argv) {
  const jsonAt = argv.indexOf('--json');
  const isJson = jsonAt !== -1;
  const positional = argv.find((_, i) => i !== jsonAt);
  if (isJson) {
    out(machineOrientation(positional));
    return;
  }
  const model = parse(read(positional));
  process.stdout.write(renderStatusSummary(model));
}

// the-loop models-list [defaults.json] [executors-dir] — print the resolved role table.
// A hard error (unregistered executor, model outside its playbook) exits 1 with no
// table; guard warnings print to stderr but never fail.
export function modelsListCommand([defaultsFile, executorsDir]) {
  const { table, errors, warnings } = buildModelsTable(defaultsFile, executorsDir);
  for (const w of warnings) { process.stderr.write(`warn ${w.code}: ${w.message} (${w.where})\n`); }
  if (errors.length > 0) {
    for (const e of errors) { process.stderr.write(`error ${e.code}: ${e.message} (${e.where})\n`); }
    process.exit(1);
  }
  out(table);
}

// The resolved role table + registry validation, shared by `models-list` and
// `prepare-execution-context`: plugin defaults < user (~/.claude/settings.json) <
// project (.claude/settings.json) < local (.claude/settings.local.json), all under
// "the-loop".modelBindings. An empty/missing user layer is byte-identical to the
// historical three-layer merge.
function buildModelsTable(defaultsFile, executorsDir) {
  const defaultsPath = defaultsFile || path.join(PLUGIN_ROOT, 'config/model-bindings.json');
  const defaults = readDefaults(defaultsPath);
  const user = readSettingsLayer(userSettingsPath(), 'modelBindings');
  const project = readSettingsLayer('.claude/settings.json', 'modelBindings');
  const local = readSettingsLayer('.claude/settings.local.json', 'modelBindings');
  const table = resolveModels({ defaults, user, project, local });
  const registry = readRegistry(executorsDir || path.join(PLUGIN_ROOT, 'config/executors'));
  const { errors, warnings } = validateBindings(table, registry);
  return { table, errors, warnings };
}

// ~/.claude/settings.json — the user-scope layer. Same path construction every call
// site uses so HOME overrides in tests reach readSettingsLayer uniformly.
export function userSettingsPath() {
  return path.join(homedir(), '.claude', 'settings.json');
}

// Resolve every real (non-synthetic) HOOK_INVENTORY family across the four layers.
// modelBindings defaults come from plugin/config/model-bindings.json; every other
// family's defaults come from plugin/config/hook-defaults.json (absent key →
// undefined → resolveFamily's inventory fallback when nothing else binds it). Shared
// by hooksListCommand (bin/hooks-commands.js) and prepareExecutionContextCommand.
export function buildHooksTable() {
  const modelDefaults = readDefaults(path.join(PLUGIN_ROOT, 'config/model-bindings.json'));
  const hookDefaults = readDefaults(path.join(PLUGIN_ROOT, 'config/hook-defaults.json'));
  const userFile = userSettingsPath();
  const projectFile = '.claude/settings.json';
  const localFile = '.claude/settings.local.json';

  const hooks = {};
  for (const family of Object.keys(HOOK_INVENTORY)) {
    if (family === 'exampleBlock') { continue; } // synthetic — not a settings key
    const defaults = family === 'modelBindings' ? modelDefaults : hookDefaults[family];
    const layers = {
      defaults,
      user: familyLayer(family, readSettingsLayer(userFile, family)),
      project: familyLayer(family, readSettingsLayer(projectFile, family)),
      local: familyLayer(family, readSettingsLayer(localFile, family)),
    };
    hooks[family] = resolveFamily(family, layers);
  }
  return hooks;
}

// readSettingsLayer returns {} for a missing key (right for modelBindings role maps).
// Single-entry families must leave the layer unset when unbound so mergeSingleEntry
// does not treat an empty object as a wholesale win over lower layers / fallbacks.
function familyLayer(family, value) {
  if (family === 'modelBindings') { return value; }
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
    return; // unbound — omit the layer
  }
  return value;
}

// Every *.md file in dir, parsed into the registry keyed by id; an absent dir is an
// empty registry, never an error (a delegation-off repo need not ship config/executors/).
export function readRegistry(dir) {
  if (!existsSync(dir)) { return {}; }
  const entries = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ file: path.join(dir, f), text: readFileSync(path.join(dir, f), 'utf8') }));
  return parseExecutors(entries);
}

// The plugin-defaults file: expected to exist and parse — a read or parse failure
// names the file.
export function readDefaults(file) {
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

// A settings layer (user, project, or local): a missing file, or a present file
// missing the "the-loop".[family] key, is an empty layer — never an error.
// Unparseable JSON in a present file is an error naming the file.
export function readSettingsLayer(file, family) {
  if (!existsSync(file)) { return {}; }
  let settings;
  try {
    settings = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`unparseable JSON in ${file}: ${error.message}`, { cause: error });
  }
  return settings?.['the-loop']?.[family] ?? {};
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

// the-loop plan task <feature-id> <task-id> [plan.md] [feature-graph.md] — a build task's task brief.
function taskCommand(featureId, [taskId, planFile, graphFile]) {
  if (!taskId) { fail('usage: spine plan task <feature-id> <task-id> [plan.md] [feature-graph.md]'); }
  const { plan } = loadPlan(featureId, planFile);
  const design = parse(read(graphFile));
  out(resolveTask(plan, design, taskId));
}

// the-loop prepare-execution-context --features <id,id,…> --target-branch <ref>
// [--script-out <path>] [--graph-path <path>] — the one-shot execution-context assembler (ADR-0036/0038):
// gates the graph and the scope, gathers every per-feature input (design doc, plan
// from the feature branch, task state from git), the resolved model-bindings table,
// and the full resolved hook table, and prints the execution context the workflow
// consumes as `args`. Any gate failure exits 1 with nothing printed to stdout. No
// default target branch: a guessed target can silently diverge from the branch the
// execution context's artifacts were read from, and the whole run inherits the
// mismatch — the caller must name the ref the run integrates into.
// `--script-out` additionally writes a launch-ready copy of the canonical workflow
// script (run-presentation), its meta description spliced to name this run's scope
// and target — the harness reads a workflow's description only from that literal, so
// a per-run description needs a per-run script copy. A shape-gate refusal (the
// canonical script's meta doesn't carry the expected `description: '…'` shape) throws,
// bubbling to the shared top-level catch: exit 1, nothing written — stdout included.
export function prepareExecutionContextCommand(argv) {
  const opts = parseFlags(argv, {
    '--features': 'scope', '--target-branch': 'target', '--script-out': 'scriptOut', '--graph-path': 'graphPath',
  });
  if (!opts.scope || !opts.target) {
    fail('usage: the-loop prepare-execution-context --features <id,id,…> --target-branch <ref> [--script-out <path>] [--graph-path <path>]');
  }
  const scope = opts.scope.split(',').map((s) => s.trim()).filter(Boolean);
  const target = opts.target;
  const graphFile = opts.graphPath || GRAPH;

  const model = parse(read(opts.graphPath));
  const graphIssues = validate(model);
  failOnIssues(graphIssues.errors, `the feature graph fails validation — fix ${graphFile} first`);
  failOnIssues(checkScope(model, scope).errors, 'scope gate failed — nothing prepared');

  const { table: models, errors, warnings } = buildModelsTable();
  for (const w of warnings) { process.stderr.write(`warn ${w.code}: ${w.message} (${w.where})\n`); }
  failOnIssues(errors, 'model bindings failed executor validation — nothing prepared');

  const hooks = buildHooksTable();

  const probe = existsSync(DESIGN) ? sectionAfter(readFileSync(DESIGN, 'utf8'), '## Validation procedure') : null;
  if (probe == null) { warn(`no "## Validation procedure" section in ${DESIGN} — validation runs without one`); }

  // Wall-clock stamp once at the bin edge — the only legal clock read for this command.
  const preparedAt = new Date().toISOString();
  // No calibration history is the common case; missing file/section → null, no warn.
  const calibration = existsSync(CALIBRATION_INDEX)
    ? sectionAfter(readFileSync(CALIBRATION_INDEX, 'utf8'), '## Digest')
    : null;

  const inputs = {};
  for (const id of scope) {
    inputs[id] = gatherFeatureInputs(id, model);
  }
  const cli = `node "${path.join(PLUGIN_ROOT, 'bin/the-loop.js')}"`;
  const executionContext = assembleExecutionContext({ model, scope, target, probe, models, hooks, inputs, preparedAt, calibration, cli });
  if (opts.scriptOut) { writeSplicedWorkflowScript(opts.scriptOut, scope, target); }
  out(executionContext);
}

// The canonical workflow script's own copy, meta description spliced to this run's
// scope and target — see the command comment above for why a per-run copy is required.
function writeSplicedWorkflowScript(scriptOut, scope, target) {
  const canonicalText = readFileSync(path.join(PLUGIN_ROOT, 'workflows/execution-pipeline.js'), 'utf8');
  const spliced = spliceRunDescription(canonicalText, describeRun(scope, target));
  writeFileSync(scriptOut, spliced);
}

// Print every issue to stderr and exit 1 — the gate refusal every prepare-execution-
// context check shares.
function failOnIssues(errors, message) {
  if (errors.length === 0) { return; }
  for (const e of errors) { process.stderr.write(`error ${e.code}: ${e.message}${e.where ? ` (${e.where})` : ''}\n`); }
  fail(message);
}

// One feature's execution-context inputs: its design doc, its plan (from the feature
// branch first — the plan's durable home — falling back to a working-tree file), and
// the head subjects of its branches (task state).
function gatherFeatureInputs(id, model) {
  const docFile = path.join(DESIGNS_DIR, id, 'design.md');
  let designDoc = existsSync(docFile) ? readFileSync(docFile, 'utf8') : null;
  // A fix has no docs/designs/<id>/design.md — its context slice is its bug doc
  // instead (diagnose feature: docs/bugs/<id>.md), permanent from birth.
  if (designDoc == null) {
    const bugFile = path.join(BUGS_DIR, `${id}.md`);
    designDoc = existsSync(bugFile) ? readFileSync(bugFile, 'utf8') : null;
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

// A plan that reaches the execution context must validate against the graph; refusal
// here beats a mid-run stall.
function gatePlan(id, planText, model) {
  const plan = parsePlan(planText);
  const { errors, warnings } = validatePlan(plan, model);
  for (const w of warnings) { warn(`plan ${id}: ${w.code} — ${w.message}${w.where ? ` (${w.where})` : ''}`); }
  failOnIssues(errors, `plan for ${id} fails validation — nothing prepared`);
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

// the-loop worktree-create <branch> [--base-branch <ref>] — the one sanctioned
// worktree-creation path (ADR-0038): agents call this as their first act and do all
// work inside the printed path; the main checkout is the human's and is never touched.
export function worktreeCreateCommand([branch, ...flagArgs]) {
  if (!branch) { fail('usage: spine worktree-create <branch> [--base-branch <ref>]'); }
  const { baseBranch } = parseFlags(flagArgs, { '--base-branch': 'baseBranch' });
  const dir = path.join(WORKTREES_DIR, branch.replaceAll('/', '-'));
  if (existsSync(dir)) {
    out({ path: dir, branch, created: false });
    return;
  }
  const branchExists = gitOk(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
  if (branchExists) { git(['worktree', 'add', dir, branch]); }
  else { git(['worktree', 'add', '-b', branch, dir, baseBranch || 'main']); }
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

// the-loop worktree-remove <path-or-branch> — the one sanctioned worktree-teardown
// path. Agents hand back whatever they still hold — the printed path or the branch
// worktree-create was called with — so both resolve.
export function worktreeRemoveCommand([target]) {
  if (!target) { fail('usage: spine worktree-remove <path-or-branch>'); }
  const dir = worktreeDirFor(target);
  git(['worktree', 'remove', '--force', dir]);
  git(['worktree', 'prune']);
  out({ removed: dir });
}

function worktreeDirFor(target) {
  if (existsSync(target)) { return target; }
  const block = git(['worktree', 'list', '--porcelain']).split('\n\n')
    .find((b) => b.split('\n').includes(`branch refs/heads/${target}`));
  if (!block) { fail(`no worktree at path or for branch: ${target}`); }
  return block.match(/^worktree (.+)$/m)[1];
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
