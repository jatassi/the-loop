// execute-skill's acceptance, executable: the loop's launch surface is its own skill,
// /begin delegates to it instead of carrying the leg, diagnose hands off by name, and
// the --script-out recipe lives on exactly one surface. Prose-only footprint — every
// assertion reads the shipped skill text directly, the way a downstream agent would,
// the same posture as consumption-lifecycle.test.js and configure-skill.test.js.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(p, 'utf8');
const EXECUTE = 'plugin/skills/execute/SKILL.md';
const BEGIN = 'plugin/skills/begin/SKILL.md';
const DIAGNOSE = 'plugin/skills/diagnose/SKILL.md';

/** Collapse line wrapping so assertions pin sentences, not the column they broke at. */
const squish = (text) => text.replaceAll(/\s+/g, ' ').trim();
const frontmatter = (text) => text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
const bodyOf = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, '');
const fmField = (text, field) => frontmatter(text).match(new RegExp(String.raw`^${field}:\s*(.+)$`, 'm'))?.[1] ?? '';

/** Every SKILL.md shipped under plugin/skills/. */
const skillFiles = () =>
  readdirSync('plugin/skills', { recursive: true })
    .filter((rel) => rel.endsWith('SKILL.md'))
    .map((rel) => `plugin/skills/${rel}`);

// The launch recipe as /begin's leg stated it, sentence by sentence. Criterion 5's
// "byte-identical on the default binding" is exactly this: the extracted surface says
// the same things about the same call, not a paraphrase of them.
const LEG_SENTENCES = [
  'the-loop prepare-execution-context --features <id,id,…> --target-branch <ref> --script-out <session-scratch path>',
  '`--target-branch` is required: name the target branch explicitly — the branch the session is working on, unless the design narrative names another. Never pass a target branch the checkout\'s artifacts didn\'t come from.',
  '`--script-out` names any writable session-scratch path; the command writes a launch-ready copy of the canonical execution-pipeline engine script there, its `meta` description spliced to name this run\'s scope and target (the harness persists each invocation\'s own script for resume, so the scratch copy needs no teardown).',
  'add `--graph-path <snapshot path>` so the context is assembled from the materialized snapshot rather than the local file, and the validator inherits that same snapshot path in its execution context.',
  'The command refuses with reasons on any gate failure',
  'Don\'t work around a refusal; fix what it names or tell the human.',
  'Pass **no `args`**: the spliced script embeds the execution context as a JS literal, and the Workflow `args` channel is lossy for large escaped JSON (it round-trips through the model\'s token stream and can silently corrupt nested escaped quotes).',
  '`completed` — merged and validated; nothing more to do.',
  '`blocked` — each needs a human decision. Present the reason and options as questions, right here in the chat. Apply what the human decides with ordinary tools (edit the plan or the feature\'s design doc, adjust scope), then offer to relaunch — the loop re-derives state from git, so a re-run resumes where work stopped.',
  '`stalled` — infrastructure hiccups; nothing recorded. A relaunch retries them.',
  '`halted` — the run stopped (budget only); report the detail.',
  'No status bookkeeping: the validators already updated the graph on the target branch, and `git log` is the run history. `the-loop status` prints the status story on demand.',
];

// ── criterion 1: the skill exists, its frontmatter declares the scope argument and the
// tools the recipe uses, and its body carries the whole launch recipe ──
test('the execute skill exists and its body carries the whole launch recipe', () => {
  assert.ok(existsSync(EXECUTE), `${EXECUTE} should exist`);
  const skill = read(EXECUTE);

  assert.match(frontmatter(skill), /^name:\s*execute\s*$/m, 'frontmatter name should be execute');
  const hint = fmField(skill, 'argument-hint');
  assert.match(hint, /id|scope/i, `argument-hint should name the scope, got ${JSON.stringify(hint)}`);

  const tools = fmField(skill, 'allowed-tools');
  for (const tool of ['the-loop', 'git', 'Read', 'Workflow']) {
    assert.ok(tools.includes(tool), `allowed-tools should cover ${tool}, got ${JSON.stringify(tools)}`);
  }

  const body = squish(bodyOf(skill));

  // prepare-execution-context, with all three flags on the quoted call
  assert.ok(
    body.includes('the-loop prepare-execution-context --features <id,id,…> --target-branch <ref> --script-out <session-scratch path>'),
    'the body should quote the prepare-execution-context call with --features, --target-branch, and --script-out',
  );

  // the Workflow call: scriptPath is the --script-out path, with no args, and the reason why
  assert.match(body, /scriptPath[^.]*--script-out/, 'scriptPath should bind to the --script-out path');
  assert.ok(body.includes('no `args`'), 'the body should state that the Workflow call passes no args');
  assert.match(body, /lossy for large escaped JSON/, 'the body should state why args is not used');
  assert.match(body, /round-trips through the model's token stream/, 'the body should state the corruption mechanism');

  // the four-outcome run-summary relay
  for (const outcome of ['completed', 'blocked', 'stalled', 'halted']) {
    assert.ok(body.includes(`\`${outcome}\``), `the run-summary relay should cover \`${outcome}\``);
  }
  assert.match(body, /model-selection —/, 'the relay should carry the model-selection lines from the run log');
});

// ── criterion 2: the leg is gone from /begin, both launch routes name the skill, and the
// recipe lives on exactly one living skill surface ──
test('the launch leg is gone from /begin, its launch routes name the execute skill, and the recipe lives on one surface', () => {
  const begin = read(BEGIN);

  assert.ok(!begin.includes('--script-out'), '/begin should no longer carry the --script-out recipe');
  assert.ok(!begin.includes('scriptPath'), '/begin should no longer make the Workflow call');
  assert.ok(!begin.includes('canonical execution-pipeline engine script'), '/begin should no longer describe the spliced engine copy');
  assert.ok(!begin.includes('`stalled`'), '/begin should no longer carry the run-summary relay');
  assert.ok(!/prepare-execution-context leg/.test(begin), '/begin should no longer name a leg of its own');

  // the advance-eligible-set proposal and the build jump both route to the skill by name
  const routes = squish(begin.slice(begin.indexOf('**Routes**')));
  assert.match(
    routes,
    /`advance-eligible-set`\s*\/\s*`build` jump → the `execute` skill/,
    'the eligible-set proposal and the build jump should route to the `execute` skill by name',
  );

  const carriers = skillFiles().filter((f) => read(f).includes('--script-out'));
  assert.deepEqual(carriers, [EXECUTE], '--script-out should appear on exactly one living skill surface');
});

// ── criterion 3: diagnose's hand-off names the skill and the fix id ──
test('the diagnose hand-off names the execute skill and the fix-<slug> id, not a bare CLI fragment', () => {
  const diagnose = read(DIAGNOSE);
  const afterHeading = diagnose.split('## 6 · Commit and hand off', 2)[1] ?? '';
  const handoff = squish(afterHeading.split('\n## ', 1)[0]);

  assert.match(handoff, /`execute` skill/, 'the hand-off should name the execute skill');
  assert.match(handoff, /fix-<slug>/, 'the hand-off should name the fix-<slug> id');
  assert.ok(
    !handoff.includes('the-loop prepare-execution-context'),
    'the hand-off should name the skill rather than a bare prepare-execution-context fragment',
  );
});

// ── criterion 4: scope resolution branches on who invoked, and every launch is gated ──
test('execute launches a human-typed scope, resolves the eligible set when bare, and gates a model-initiated launch', () => {
  const body = squish(bodyOf(read(EXECUTE)));

  // a human-typed scope launches — no route re-proposal
  assert.match(body, /human typed this invocation/i, 'the body should branch on the human having typed the invocation');
  assert.match(body, /Launch it as stated/, 'a human-typed scope should launch as stated');

  // bare invocation resolves the dependency-ready eligible set from status --json
  assert.match(body, /the-loop status --json/, 'a bare invocation should read the eligible set from `the-loop status --json`');
  assert.match(body, /dependency-ready/, 'the resolved scope should be the dependency-ready set');
  assert.match(body, /`eligibleSet`/, 'the body should name the eligibleSet field it reads');
  assert.match(
    body,
    /empty `eligibleSet`[^.]*say so and stop/i,
    'an empty eligible set should be reported and stop the run',
  );

  // a model-initiated invocation presents scope + target branch and waits
  assert.match(body, /a model reached for it/i, 'the body should branch on a model-initiated invocation');
  assert.match(body, /present the resolved scope and the target branch/i, 'a model-initiated launch should present scope and target branch');
  assert.match(body, /wait for the human's confirm/i, 'a model-initiated launch should wait for the human confirm');
});

// ── criterion 5: the launch path carries the bound-store half, reports an unreachable
// surface as a can't-run, and is unchanged on the default binding ──
test('the launch path snapshots a bound feature store, can\'t-runs an unreachable one, and is unchanged on the default binding', () => {
  const skill = squish(read(EXECUTE));

  // nondefault binding: materialize a snapshot, pass --graph-path, tear it down
  assert.match(skill, /artifactStores\.features/);
  assert.match(skill, /nondefault/i);
  assert.match(skill, /docs\/adapters\/features\.md/, 'the access path is the adapter doc');
  assert.match(skill, /Access/);
  assert.match(skill, /materialize/i);
  assert.match(skill, /ephemeral snapshot/i);
  assert.match(skill, /gitignored/i);
  assert.match(skill, /never committed/i);
  assert.match(skill, /--graph-path/);
  assert.match(skill, /tear the snapshot down|torn down/i);

  // bound-but-unreachable: a can't-run naming the surface, never a local fallback
  assert.match(skill, /unreachable/i);
  assert.match(skill, /can't-run/i);
  assert.match(skill, /naming the surface/i);
  assert.match(skill, /Never fall back to local/i);

  // default binding: the call runs unchanged, with no --graph-path
  assert.match(
    skill,
    /resolves `local` — the default — [^.]*unchanged/i,
    'the default binding should be stated as running the call unchanged',
  );

  // and byte-identical means these sentences travelled, not a paraphrase of them
  for (const sentence of LEG_SENTENCES) {
    assert.ok(skill.includes(squish(sentence)), `the extracted recipe should carry verbatim: ${sentence}`);
  }
});

// ── criterion 6: consumer-safe, self-contained, and shaped by a write-skills pass ──
test('the execute skill is consumer-safe and self-contained', () => {
  const skill = read(EXECUTE);
  const body = bodyOf(skill);

  assert.ok(!/\bADR-\d/.test(skill), 'the skill must not cite an internal ADR (skills are self-contained)');
  assert.equal(skill.match(/\$CLAUDE_PLUGIN_ROOT/g), null, 'every CLAUDE_PLUGIN_ROOT reference must be braced');
  assert.ok(!skill.includes('plugin/workflows/'), 'no path under plugin/workflows/ may be named');
  assert.ok(!/workflows\/execution-pipeline\.js/.test(skill), 'the retired engine path must not be named');

  for (const internal of ['docs/adr/', 'docs/design-decisions.md', 'docs/research/', 'docs/plans/', 'docs/designs/execute-skill', 'CLAUDE.md', 'README.md']) {
    assert.ok(!skill.includes(internal), `must not reference the-loop-internal document ${internal}`);
  }
  // the release-download URL in the install one-liner is consumer-facing; nothing else
  // may name this repo's author/org
  const withoutInstaller = skill.replaceAll(/^.*the-loop-installer\.sh.*$/gm, '');
  assert.ok(!/jatassi/i.test(withoutInstaller), "must not mention this repo's author/org");

  // no step defers to another skill's body for something this reader must do
  const otherSkills = ['begin', 'define', 'design', 'configure', 'onboard', 'release', 'diagnose', 'operate', 'code-quality', 'write-skills'];
  for (const other of otherSkills) {
    assert.ok(
      !new RegExp(String.raw`\`?${other}\`?\s+skill`, 'i').test(body),
      `the body must not defer to the ${other} skill`,
    );
  }

  // write-skills pass: folder matches the name, the description carries the triggers,
  // and "when to use" lives in the description rather than the body
  assert.equal(fmField(skill, 'name'), 'execute', 'the frontmatter name matches the folder name');
  const description = fmField(skill, 'description');
  for (const trigger of [/run the fix/i, /launch/i, /pipeline/i, /build/i, /execute/i]) {
    assert.match(description, trigger, `the description should fire on ${trigger}`);
  }
  assert.ok(!/^#+\s*When to use/im.test(body), 'triggers live in the description, not a "when to use" section');
});
