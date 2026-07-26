// interactive-execution's acceptance, executable: the attended counterpart to the
// launch surface is its own skill, /begin routes the attended proposal kind to it by
// name, the launch surface says why its own scope is safe, the consumer orientation
// names the new record field, and no `execution` marker rides this repo's own graph
// while the binary that would drop it is still the installed one. Prose-only footprint —
// every assertion reads the shipped text directly, the way a downstream agent would,
// the same posture as execute-skill.test.js.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(p, 'utf8');
const SKILL = 'plugin/skills/interactive-execution/SKILL.md';
const BEGIN = 'plugin/skills/begin/SKILL.md';
const EXECUTE = 'plugin/skills/execute/SKILL.md';
const USING = 'plugin/skills/using-the-loop/SKILL.md';
const GRAPH = 'docs/feature-graph.json';

/** Collapse line wrapping so assertions pin sentences, not the column they broke at. */
const squish = (text) => text.replaceAll(/\s+/g, ' ').trim();
const frontmatter = (text) => text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
const bodyOf = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, '');
const fmField = (text, field) => frontmatter(text).match(new RegExp(String.raw`^${field}:\s*(.+)$`, 'm'))?.[1] ?? '';

// ── criterion 1: the skill exists, and its frontmatter declares a routable
// description and every tool the attended recipe reaches for ──
test('the interactive-execution skill exists with a routable description and the tools its recipe uses', () => {
  assert.ok(existsSync(SKILL), `${SKILL} should exist`);
  const skill = read(SKILL);

  assert.match(frontmatter(skill), /^name:\s*interactive-execution\s*$/m, 'frontmatter name should be interactive-execution');

  const description = fmField(skill, 'description');
  for (const trigger of [/interactive/i, /attended|together/i, /session/i, /feature/i]) {
    assert.match(description, trigger, `the description should fire on ${trigger}`);
  }

  const tools = fmField(skill, 'allowed-tools');
  for (const tool of ['the-loop', 'git', 'Read', 'Write', 'Edit', 'Agent']) {
    assert.ok(tools.includes(tool), `allowed-tools should cover ${tool}, got ${JSON.stringify(tools)}`);
  }
});

// ── criterion 2 (scope half): a human-typed id, else interactiveReady from the
// orientation JSON; a model-initiated invocation presents and waits; an empty ready
// set stops ──
test('the skill resolves scope from a typed id or interactiveReady, gates a model-initiated session, and stops on an empty ready set', () => {
  const body = squish(bodyOf(read(SKILL)));

  assert.match(body, /human typed/i, 'the body should branch on the human having typed the id');
  assert.match(body, /the-loop status --json/, 'a bare invocation should read the ready set from `the-loop status --json`');
  assert.match(body, /`interactiveReady`/, 'the body should name the interactiveReady field it reads');
  assert.match(
    body,
    /empty `interactiveReady`[^.]*say so and stop/i,
    'an empty ready set should be reported and stop the session',
  );

  assert.match(body, /a model reached for it/i, 'the body should branch on a model-initiated invocation');
  assert.match(body, /present the .{0,40}scope and the target branch/i, 'a model-initiated session should present scope and target branch');
  assert.match(body, /wait for the human's confirm/i, 'a model-initiated session should wait for the human confirm');
});

// ── criterion 2 (recipe half): context assembly through the attended door, the session
// worktree and its commit subject, and the hand-off to the ordinary validate agent ──
test('the skill assembles context through the interactive door, works a loop/<id> worktree turn by turn, and hands off to the validate agent', () => {
  const body = squish(bodyOf(read(SKILL)));

  assert.ok(
    body.includes('the-loop prepare-execution-context --features <id> --target-branch <ref> --interactive'),
    'the body should quote the prepare-execution-context call with --features, --target-branch, and --interactive',
  );
  assert.match(body, /refuse/i, 'the body should say the command refuses on a gate failure');

  assert.ok(
    body.includes('the-loop worktree-create loop/<id> --base-branch <target>'),
    'the body should quote the worktree-create call for the session branch',
  );
  assert.match(body, /turn by turn/i, 'the session is worked turn by turn with the human');
  assert.ok(body.includes('`<id>/feature: <what landed>`'), 'the commit subject convention should be quoted');

  // the hand-off: the ordinary validate agent, against loop/<id>, with the fields the
  // execution context supplies
  assert.match(body, /spawn the ordinary `validate` agent/i, 'the hand-off should spawn the ordinary validate agent');
  assert.match(body, /against `loop\/<id>`/, 'the hand-off should name the branch being validated');
  for (const field of [
    /feature id and title/i,
    /target branch/i,
    /worktree-create integrate--<id> --base-branch <target>/,
    /merge, in order/i,
    /cli/i,
    /acceptance criteria/i,
    /validation-procedure binding/i,
    /design doc/i,
  ]) {
    assert.match(body, field, `the hand-off should carry the execution-context field ${field}`);
  }
  assert.match(body, /relay/i, "the skill should relay the validator's verdict");
});

// ── criterion 3: the validate protocol has one home and is not restated here, and the
// spliced-script recipe stays the launch surface's alone ──
test('the skill points at the validate agent for the protocol instead of restating it, and never names --script-out', () => {
  const skill = read(SKILL);
  const body = squish(bodyOf(skill));

  assert.ok(!skill.includes('--script-out'), 'the attended door has no spliced script; --script-out must not appear');

  // the protocol's own sentences live on the agent definition — not copied here
  for (const restated of ['set-status', 'squash', 'eslint-disable', 'test-gated merge policy', 'docs/validation/']) {
    assert.ok(!skill.includes(restated), `the validate protocol's "${restated}" must not be restated here`);
  }
  assert.match(
    body,
    /(protocol|procedure)[^.]*validate agent|validate agent[^.]*(protocol|procedure)/i,
    'the body should name the validate agent definition as the protocol home',
  );
});

// ── criterion 4: /begin routes the attended proposal kind here by name, the launch
// surface states why its own scope is already safe, and the consumer orientation names
// the new record field ──
test('/begin routes advance-interactive to the skill by name, execute states its scope excludes attended features, and using-the-loop names the field', () => {
  const begin = read(BEGIN);
  const routes = squish(begin.slice(begin.indexOf('**Routes**')));
  assert.match(
    routes,
    /`advance-interactive` → the `interactive-execution` skill/,
    'the advance-interactive proposal should route to the `interactive-execution` skill by name',
  );

  const execute = squish(read(EXECUTE));
  assert.match(
    execute,
    /eligible set already excludes[^.]*interactive/i,
    'the launch surface should state in one line that its eligible-set scope already excludes attended features',
  );

  const using = squish(read(USING));
  assert.match(using, /`execution`/, "the consumer orientation's account of the feature record should name the execution field");
  assert.match(using, /`autonomous`/, 'it should name the autonomous value');
  assert.match(using, /`interactive`/, 'it should name the interactive value');
  assert.match(using, /absent/i, 'it should state that an absent key means autonomous');
});

// ── criterion 5: hygiene — this repo's graph stays marker-free while the installed
// binary would still drop the key, and the new surface cites nothing a consuming
// project cannot reach ──
test('no feature record carries an execution key yet, and the skill cites no ADR number or this-repo docs path', () => {
  const graph = JSON.parse(read(GRAPH));
  const marked = graph.features.filter((f) => Object.hasOwn(f, 'execution')).map((f) => f.id);
  assert.deepEqual(
    marked,
    [],
    'no feature record may carry an `execution` key yet — an older binary drops it silently on set-status',
  );

  const skill = read(SKILL);
  assert.ok(!/\bADR-\d/.test(skill), 'the skill must not cite an internal ADR (skills are self-contained)');
  for (const internal of ['docs/adr/', 'docs/designs/', 'docs/plans/']) {
    assert.ok(!skill.includes(internal), `must not reference this repo's own ${internal}`);
  }
});
