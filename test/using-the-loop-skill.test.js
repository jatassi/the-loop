// using-the-loop-skill acceptance, executable: the consumer-session orientation
// skill — frontmatter triggers, three-move body, CLI/path fidelity, consumer
// safety, and the dedup sweep. Prose-only footprint — every assertion reads the
// shipped SKILL.md text directly, the way a human or a downstream agent would.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const read = (p) => readFileSync(p, 'utf8');
const frontmatterName = (text) => text.match(/^name:\s*(\S+)\s*$/m)?.[1];
const frontmatterDescription = (text) => {
  const m = text.match(/^description:\s*(?:"([^"]*)"|'([^']*)'|(.+))\s*$/m);
  if (!m) {
    return;
  }
  return m[1] ?? m[2] ?? m[3];
};
const bodyOf = (text) => {
  const end = text.indexOf('\n---', 3);
  assert.ok(end !== -1, 'SKILL.md needs closed YAML frontmatter');
  return text.slice(end + '\n---'.length).replace(/^\s*\n/, '');
};

const SKILL_DIR = 'plugin/skills/using-the-loop';
const SKILL = path.join(SKILL_DIR, 'SKILL.md');

// Skill directory names that must not be named as invocable reaches in the body.
// (Listed only in this test's exclusion logic — not required in the skill itself.)
const OTHER_BUNDLED_SKILLS = [
  'onboard',
  'configure',
  'define',
  'design',
  'diagnose',
  'release',
  'operate',
  'code-quality',
  'write-skills',
];

// Phase-model words that Move 1 must carry as the phase sequence — bare phase
// names, not skill reaches. The "no other skill" check allows these as bare
// words in that sentence and bans every skill-invocation form.
const PHASE_MODEL_WORDS = new Set(['define', 'design', 'diagnose', 'release', 'operate']);

const LOOP_OWNED_PATHS = [
  'docs/feature-graph.json',
  'docs/architecture.md',
  'docs/briefs/',
  'docs/designs/<id>/design.md',
  'docs/glossary.md',
  'docs/adr/',
  'docs/bugs/',
  'docs/runbooks/<topic>.md',
  'docs/validation/',
  'docs/releases/',
  'docs/calibration/',
  'docs/adapters/',
];

const CLI_COMMANDS = ['status', 'list', 'hooks-list', 'models-list'];

const assertNoSkillReach = (body, name) => {
  // Slash-command form is /name followed by space, <, backtick, or end — not a
  // longer path segment like docs/designs/…/design.md (where /design is a prefix).
  const slashCmd = new RegExp(`/${name}(?:\\s|<|\`|$)`);
  assert.ok(!slashCmd.test(body),
    `body must not name /${name} — only /begin is the named reach`);
  assert.ok(!new RegExp(String.raw`\b${name}\s+skill\b`, 'i').test(body),
    `body must not name the ${name} skill`);
  assert.ok(!new RegExp(`\`${name}\`\\s+skill`, 'i').test(body),
    `body must not name the \`${name}\` skill`);
};

const assertCliSubcommand = (topHelp, cmd) => {
  const listed = new RegExp(String.raw`^\s+${cmd}\b`, 'm').test(topHelp)
    || topHelp.includes(`  ${cmd} `)
    || new RegExp(String.raw`\b${cmd}\b`).test(topHelp);
  assert.ok(listed,
    `the-loop --help must list the ${cmd} subcommand (named in the skill body)`);
  const sub = execFileSync('the-loop', [cmd, '--help'], { encoding: 'utf8' });
  assert.ok(sub.length > 0, `the-loop ${cmd} --help should produce help text`);
  const firstLine = sub.split('\n', 1)[0] ?? '';
  assert.ok(!/unrecognized|error:/i.test(firstLine),
    `the-loop ${cmd} --help should not error`);
};

const assertPathIsPhaseOwned = (body, phaseSkillText, p) => {
  const bare = p.replace(/\/$/, '');
  assert.ok(body.includes(p) || body.includes(bare), `body should name ${p}`);
  const inTree = existsSync(p) || existsSync(bare);
  const stem = bare.replace(/\.json$/, '').replace(/\.md$/, '');
  const inPhaseSkills = phaseSkillText.includes(p)
    || phaseSkillText.includes(stem)
    || phaseSkillText.includes(p.replace('feature-graph.json', 'feature-graph'));
  assert.ok(inTree || inPhaseSkills,
    `${p} must exist in docs/ or be named by a phase skill as something phases write`);
};

const theLoopHelp = () => {
  try {
    return execFileSync('the-loop', ['--help'], { encoding: 'utf8' });
  } catch (error) {
    const lib = read('cli/src/lib.rs');
    const about = lib.match(/about\s*=\s*"([^"]+)"/)?.[1] ?? '';
    assert.ok(about, `the-loop --help failed and no about= in lib.rs: ${error.message}`);
    return about;
  }
};

// ── criterion 1: skill exists, frontmatter name, directory ships only SKILL.md ──
test('using-the-loop ships as a single-file skill with frontmatter name using-the-loop', () => {
  assert.ok(existsSync(SKILL), `${SKILL} should exist`);
  const text = read(SKILL);
  assert.equal(frontmatterName(text), 'using-the-loop');

  assert.ok(statSync(SKILL_DIR).isDirectory(), `${SKILL_DIR} should be a directory`);
  const entries = readdirSync(SKILL_DIR);
  assert.deepEqual(entries, ['SKILL.md'],
    `${SKILL_DIR} must contain exactly SKILL.md — no references/ or other files`);
  assert.ok(!existsSync(path.join(SKILL_DIR, 'references')),
    `${SKILL_DIR} must not ship a references/ subdirectory`);
});

// ── criterion 2: description ≤ 400 chars and names all three trigger families ──
test('frontmatter description is ≤ 400 chars and names all three trigger families', () => {
  const text = read(SKILL);
  const description = frontmatterDescription(text);
  assert.ok(description, `${SKILL} needs a frontmatter description`);
  assert.ok(description.length <= 400,
    `description is ${description.length} chars; must be ≤ 400`);

  // (a) concrete entry moments
  assert.match(description, /new feature or idea/i,
    'trigger family (a): starting a new feature or idea');
  assert.match(description, /reported bug/i,
    'trigger family (a): fixing a reported bug');
  assert.match(description, /preparing a release/i,
    'trigger family (a): preparing a release');
  assert.match(description, /deciding what to build next/i,
    'trigger family (a): deciding what to build next');

  // (b) protective moment — loop-owned docs/, naming feature-graph.json
  assert.match(description, /docs\//,
    'trigger family (b): loop-owned docs/ artifacts');
  assert.match(description, /feature-graph\.json/,
    'trigger family (b): names feature-graph.json concretely');
  assert.match(description, /before (creating|editing|deleting)/i,
    'trigger family (b): before creating/editing/deleting');

  // (c) how-this-project-is-set-up orientation curiosity
  assert.match(description, /how this project is set up/i,
    'trigger family (c): how this project is set up');
  assert.match(description, /organized|developed/i,
    'trigger family (c): organized / developed');
});

// ── criterion 3: body ≤ 150 lines, path table + rule, /begin only, tier-2 map ──
test('body is ≤ 150 lines with the loop-owned table, /begin entry, no other skills, and the tier-2 map', () => {
  const text = read(SKILL);
  const body = bodyOf(text);
  const lineCount = body.split('\n').length;
  assert.ok(lineCount <= 150, `body is ${lineCount} lines; must be ≤ 150`);

  for (const p of LOOP_OWNED_PATHS) {
    assert.ok(body.includes(p), `body path table must include ${p}`);
  }
  assert.match(body, /\| Path \| What it is \|/i);
  assert.match(body, /\|---\|/);

  assert.match(body, /never hand-edit|must never be hand-edited|never hand.edit/i,
    'rule: feature-graph.json must never be hand-edited');
  assert.match(body, /owning phases|amended only through|amend.*through.*owning/i,
    'rule: prose artifacts amended only through their owning phases');
  assert.match(body, /clean up|stale/i,
    'rule: do not "clean up" paths that look stale');

  assert.match(body, /define\s*(→|->)\s*design\s*(→|->)\s*build\s*(→|->)\s*validate\s*(→|->)\s*release/i,
    'phase model: define → design → build → validate → release');
  assert.match(body, /diagnose/i, 'phase model: bugs enter via diagnose');
  assert.match(body, /operate/i, 'phase model: deployed instances via operate');

  assert.match(body, /\/begin/, 'body names /begin as the entry point');
  assert.match(body, /\/begin\s*<phase>|\/begin\s+<phase>/,
    'body names /begin <phase> for a straight phase jump');
  assert.match(body, /single entry|one entry|entry point/i,
    'body states /begin is the entry point');

  for (const name of OTHER_BUNDLED_SKILLS) {
    assertNoSkillReach(body, name);
  }
  for (const name of OTHER_BUNDLED_SKILLS) {
    if (PHASE_MODEL_WORDS.has(name)) {
      continue;
    }
    assert.ok(!new RegExp(String.raw`\b${name}\b`).test(body),
      `body must not mention ${name} at all (not a phase-model word)`);
  }

  assert.match(body, /the-loop status/);
  assert.match(body, /--json/);
  assert.match(body, /the-loop list/);
  assert.match(body, /the-loop hooks-list/);
  assert.match(body, /the-loop models-list/);

  assert.ok(body.includes('docs/architecture.md'), 'tier-2: architecture narrative');
  assert.ok(body.includes('docs/designs/<id>/design.md'), 'tier-2: feature design');
  assert.ok(body.includes('docs/glossary.md'), 'tier-2: vocabulary');
  assert.match(body, /git log/i, 'tier-2: git log for history');
  assert.match(body, /deeper engagement is\s*`?\/begin`?/i,
    'close with deeper engagement is /begin');
});

// ── criterion 4: every CLI invocation and docs/ path is real ──
test('every CLI command named in the body exists, and every docs/ path is phase-owned', () => {
  const body = bodyOf(read(SKILL));
  const topHelp = theLoopHelp();

  for (const cmd of CLI_COMMANDS) {
    assertCliSubcommand(topHelp, cmd);
  }
  const statusHelp = execFileSync('the-loop', ['status', '--help'], { encoding: 'utf8' });
  assert.match(statusHelp, /--json/, 'status --help must document --json');

  const phaseSkillText = [
    'define', 'design', 'diagnose', 'release', 'operate', 'configure', 'begin',
  ].map((s) => read(path.join('plugin/skills', s, 'SKILL.md'))).join('\n');

  // Path stems used for phase-ownership (designs/ not designs/<id>/design.md).
  const ownershipPaths = [
    'docs/feature-graph.json',
    'docs/architecture.md',
    'docs/briefs/',
    'docs/designs/',
    'docs/glossary.md',
    'docs/adr/',
    'docs/bugs/',
    'docs/runbooks/<topic>.md',
    'docs/validation/',
    'docs/releases/',
    'docs/calibration/',
    'docs/adapters/',
  ];
  for (const p of ownershipPaths) {
    assertPathIsPhaseOwned(body, phaseSkillText, p);
  }
});

// ── criterion 5: consumer-safe — no ADR numbers, no internal docs, no this-repo ──
test('skill is consumer-safe: no ADR numbers, no the-loop-internal docs, no project-specific content', () => {
  const text = read(SKILL);
  assert.ok(!/\bADR-\d{4}\b/.test(text),
    'must not cite ADR numbers (e.g. ADR-0040)');
  assert.ok(!/\bADR-\d+\b/.test(text),
    'must not cite any ADR-N form');

  for (const internal of [
    'docs/design-decisions.md',
    'docs/TODO.md',
    'docs/research/',
    'design-decisions',
    'Claude.md',
    'AGENTS.md',
  ]) {
    assert.ok(!text.includes(internal),
      `must not reference the-loop-internal document ${internal}`);
  }

  assert.ok(!/jatassi/i.test(text), "must not mention this repo's author/org");
  assert.ok(!/plugin-dir-restructure|rename-sweep|parity-oracle/i.test(text),
    "must not mention this repo's internal feature names");
  assert.ok(!/\bthis repository\b/i.test(text),
    'must not refer to this repository specifically');
});

// ── criterion 6: dedup sweep — no verbatim orientation-trigger sentences elsewhere ──
test('dedup sweep: begin/onboard/configure descriptions and CLI help carry no verbatim orientation triggers from using-the-loop', () => {
  const skillText = read(SKILL);
  const description = frontmatterDescription(skillText);
  assert.ok(description, 'need the new skill description to check against');

  // Phrases distinctive of the new skill's orientation trigger surface. If a
  // sweep were skipped and these were copied into other surfaces, the check
  // fails — do not assert something trivially true.
  const distinctivePhrases = [
    'how this project is set up',
    'or deciding what to build next',
    'loop-owned `docs/` artifacts',
    'starting a new feature or idea',
    'fixing a reported bug, preparing a release',
  ];

  const surfaces = {
    'plugin/skills/begin/SKILL.md': read('plugin/skills/begin/SKILL.md'),
    'plugin/skills/onboard/SKILL.md': read('plugin/skills/onboard/SKILL.md'),
    'plugin/skills/configure/SKILL.md': read('plugin/skills/configure/SKILL.md'),
    'the-loop --help': theLoopHelp(),
    'cli/src/lib.rs about': read('cli/src/lib.rs'),
  };

  for (const [surface, content] of Object.entries(surfaces)) {
    for (const phrase of distinctivePhrases) {
      assert.ok(!content.includes(phrase),
        `${surface} must not carry the using-the-loop orientation phrase ${JSON.stringify(phrase)}`);
    }
    assert.ok(!content.includes(description),
      `${surface} must not contain the using-the-loop description verbatim`);
  }
});
