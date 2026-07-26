// write-skills-doctrine's acceptance, executable: the write-skills skill also covers
// agent-definition authoring — a description that triggers on it, a deltas section
// inside the body's existing structure, and the Negation failure mode. Prose-only
// footprint (plugin/skills/write-skills/), so every assertion reads the shipped text
// directly, the way a human or a downstream authoring agent would.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const DIR = 'plugin/skills/write-skills';
const SKILL = `${DIR}/SKILL.md`;
const read = (p) => readFileSync(p, 'utf8');

const frontmatterDescription = (text) =>
  text.match(/^description:[ \t]*(.*(?:\n[ \t]+.*)*)$/m)?.[1].replaceAll(/\s+/g, ' ').trim();

// The body's `## ` headings, in file order, each with its own text.
const sections = (text) => {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  const out = [];
  for (const chunk of body.split(/^## /m).slice(1)) {
    const newline = chunk.indexOf('\n');
    out.push({ heading: chunk.slice(0, newline).trim(), text: chunk.slice(newline + 1) });
  }
  return out;
};

const headings = (text) => sections(text).map((s) => s.heading);
const section = (text, predicate) => sections(text).find((s) => predicate(s.heading));
// Markdown hard-wrapping is not meaning: match prose against the unwrapped text.
const prose = (text) => text.replaceAll(/\s+/g, ' ');

// ── criterion 1: the frontmatter description names agent-definition authoring
// alongside skill authoring, so a session creating or editing a file under
// plugin/agents/ triggers it ──
test('the write-skills description triggers on agent-definition authoring as well as skill authoring', () => {
  const description = frontmatterDescription(read(SKILL));
  assert.ok(description, `${SKILL} should carry a frontmatter description`);

  // still fires on skill authoring
  assert.match(description, /skill/i, 'the description should still name skill authoring');

  // and now on agent definitions, with the directory a session would be editing in
  assert.match(
    description,
    /agent definition/i,
    'the description should name agent-definition authoring',
  );
  assert.match(
    description,
    /`?agents\/`?/,
    'the description should name the agents/ directory so editing a file there triggers it',
  );
});

// ── criterion 2: the body carries a compact agent-definitions section stating the
// three deltas, placed within the existing structure rather than appended at the end ──
test('the body carries a compact agent-definition deltas section inside its existing structure', () => {
  const text = read(SKILL);
  const deltas = section(text, (h) => /agent definition/i.test(h));
  assert.ok(deltas, `${SKILL} should carry an agent-definitions section`);
  const said = prose(deltas.text);

  // delta 1: the description is a delegation trigger
  assert.match(said, /delegation trigger/i, 'delta 1: the description is a delegation trigger');
  assert.match(said, /spawn/i, 'delta 1 should say it decides whether the worker is spawned');

  // delta 2: the tools: list is part of the interface
  assert.match(said, /`tools:`/, 'delta 2 should name the `tools:` frontmatter list');
  assert.match(said, /interface/i, 'delta 2: the tools: list is part of the interface');

  // delta 3: the body is a system prompt read cold by a stateless worker
  assert.match(said, /system prompt/i, 'delta 3: the body is a system prompt');
  assert.match(said, /cold/i, 'delta 3 should say it is read cold');
  assert.match(said, /stateless/i, 'delta 3 should say the worker is stateless');
  assert.match(
    said,
    /no conversation history/i,
    'delta 3 should say there is no conversation history',
  );
  assert.match(
    said,
    /follow-up question/i,
    'delta 3 should say the worker cannot ask a follow-up question',
  );

  // compact
  const lines = deltas.text.trim().split('\n').length;
  assert.ok(lines <= 25, `the agent-definitions section should stay compact, got ${lines} lines`);

  // placed inside the existing structure: with the description/body guidance it
  // modifies, and never the trailing section
  const order = headings(text);
  const at = order.findIndex((h) => /agent definition/i.test(h));
  const body = order.findIndex((h) => /^Writing the body$/i.test(h));
  const hierarchy = order.findIndex((h) => /^Information hierarchy$/i.test(h));
  assert.ok(body !== -1 && hierarchy !== -1, 'the existing body and hierarchy sections should still exist');
  assert.ok(
    at > body && at < hierarchy,
    `the agent-definitions section should sit between "Writing the body" and "Information hierarchy", got order ${JSON.stringify(order)}`,
  );
  assert.ok(at < order.length - 1, 'the agent-definitions section should not be appended at the end');
});

// ── criterion 3: the Failure modes section carries Negation ──
test('Failure modes carries Negation — prompt the positive, prohibitions only as unphrasable guardrails paired with what to do instead', () => {
  const failures = section(read(SKILL), (h) => /^Failure modes$/i.test(h));
  assert.ok(failures, 'the Failure modes section should exist');

  const negation = failures.text
    .split(/^- /m)
    .find((entry) => /^\*\*Negation\*\*/.test(entry.trim()));
  assert.ok(negation, 'Failure modes should carry a Negation entry');
  const said = prose(negation);

  assert.match(said, /elephant/i, 'Negation should say steering by prohibition names the elephant');
  assert.match(said, /prohibition/i, 'Negation should name steering by prohibition');
  assert.match(said, /prompt the positive/i, 'Negation should say to prompt the positive');
  assert.match(
    said,
    /cannot be phrased positively/i,
    'Negation should keep a prohibition only where it cannot be phrased positively',
  );
  assert.match(
    said,
    /hard guardrail/i,
    'Negation should call the surviving prohibition a hard guardrail',
  );
  assert.match(
    said,
    /instead/i,
    'Negation should pair a surviving prohibition with what to do instead',
  );
});

// ── criterion 4: the skill pack stays self-contained — no ADR number, no path into
// the authoring repo's own docs, and its GLOSSARY.md companion still resolves ──
test('the write-skills pack stays self-contained for a consuming project that has only the plugin and the binary', () => {
  const files = readdirSync(DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${entry.parentPath}/${entry.name}`);
  assert.ok(files.length > 0, `${DIR} should ship files`);

  for (const file of files) {
    const text = read(file);
    assert.ok(!/\bADR-\d/.test(text), `${file} must not cite an internal ADR (skills are self-contained)`);
    assert.ok(
      !/docs\/(?:adr|designs?|briefs?|plans?|architecture|glossary)/i.test(text),
      `${file} must not point into the authoring repo's own docs`,
    );
  }

  // the disclosed reference still resolves from the skill
  const skill = read(SKILL);
  for (const link of skill.matchAll(/\]\((?!https?:)([^)#]+)/g)) {
    assert.ok(existsSync(`${DIR}/${link[1]}`), `${SKILL} points at ${link[1]}, which should exist`);
  }
  assert.match(skill, /\[`GLOSSARY\.md`\]\(GLOSSARY\.md\)/, 'the GLOSSARY.md companion should stay linked');
  assert.ok(existsSync(`${DIR}/GLOSSARY.md`), `${DIR}/GLOSSARY.md should exist`);
});

// ── criterion 5: Pruning and Failure modes stay in place and unrenamed, so a later
// authoring pass can fold judgment calls into them without restructuring ──
test('Pruning and Failure modes remain in place, unrenamed, with their existing content intact', () => {
  const text = read(SKILL);
  const order = headings(text);

  assert.ok(order.includes('Pruning'), 'the Pruning section should keep its name');
  assert.ok(order.includes('Failure modes'), 'the Failure modes section should keep its name');
  assert.ok(
    order.indexOf('Pruning') < order.indexOf('Failure modes'),
    'Pruning should still precede Failure modes',
  );

  const pruning = section(text, (h) => h === 'Pruning');
  assert.match(pruning.text, /single source of truth/i, 'Pruning should keep its single-source-of-truth rule');
  assert.match(pruning.text, /relevance/i, 'Pruning should keep its relevance check');
  assert.match(pruning.text, /no-op/i, 'Pruning should keep its no-op hunt');

  const failures = section(text, (h) => h === 'Failure modes');
  for (const mode of [
    'Premature completion',
    'Embargo',
    'Lucky pass',
    'Duplication',
    'Sediment',
    'War story',
    'Implementation index',
    'Sprawl',
    'No-op',
  ]) {
    assert.ok(
      failures.text.includes(`**${mode}**`),
      `Failure modes should still carry **${mode}** (nothing is cut here)`,
    );
  }
});
