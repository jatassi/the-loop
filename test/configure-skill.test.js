// configure/configure-skill's acceptance, executable: the configure skill, the /begin
// jump, and define's resolved-interview clause. Prose-only footprint — every assertion
// reads the shipped SKILL.md text directly, the way a human or a downstream agent would.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(p, 'utf8');
const frontmatterName = (text) => text.match(/^name:\s*(\S+)\s*$/m)?.[1];
const CONFIGURE = 'plugin/skills/configure/SKILL.md';
const BEGIN = 'plugin/skills/begin/SKILL.md';
const DEFINE = 'plugin/skills/define/SKILL.md';

// ── criterion 1: a bare-verb configure skill runs the recommended-answer interview
// over hooks-list/hooks-set ──
test('configure is a bare-verb skill running the detect→recommend→confirm interview over hooks-list/hooks-set', () => {
  assert.ok(existsSync(CONFIGURE), `${CONFIGURE} should exist`);
  const text = read(CONFIGURE);

  // bare-verb family: model-invoked, frontmatter name matches directory, /begin reach clause
  assert.equal(frontmatterName(text), 'configure');
  assert.match(text, /^description:.*\/begin/mi);

  // recommended-answer posture: detect from the repo, recommend, confirm
  assert.match(text, /detect/i);
  assert.match(text, /recommend/i);
  assert.match(text, /confirm/i);

  // the hooks-list resolved table prints first and is the entire no-op pass
  assert.match(text, /hooks-list/);
  assert.match(text, /no-op/i);
  assert.ok(text.indexOf('hooks-list') < text.indexOf('hooks-set'),
    'the resolved table (hooks-list) is shown before any hooks-set write');

  // each answer states its inferred destination layer, with a per-answer override
  assert.match(text, /layer/i);
  assert.match(text, /override/i);
  for (const layer of ['user', 'project', 'local']) {
    assert.match(text, new RegExp(String.raw`\b${layer}\b`), `the layer names should be stated (${layer})`);
  }

  // persists via hooks-set only on confirmation
  assert.match(text, /hooks-set/);
  assert.match(text, /only on (the human's )?confirmation/i);

  // notification answers point at the harness-native knobs, written only at the human's request
  assert.match(text, /preferredNotifChannel/);
  assert.match(text, /only at the human's request/i);
});

// ── criterion 2: /begin routes a configure jump to the configure skill ──
test('the begin jump list routes a configure jump to the configure skill', () => {
  const begin = read(BEGIN);
  // configure joins the explicit-jump enumeration
  assert.match(begin, /\/begin [^\n]*\bconfigure\b/);
  // a route bullet points a configure jump at the configure skill
  assert.match(begin, /`configure`[^\n]*→[^\n]*`configure` skill/);
});

// ── criterion 3: define's interview clause reads the resolved interview hook instead
// of hard-coding /grilling ──
test('define reads the resolved interview hook rather than hard-coding /grilling as the default', () => {
  const define = read(DEFINE);
  // the clause now reads the resolved inventory hook
  assert.match(define, /hooks-list/);
  assert.match(define, /interview port/);
  assert.match(define, /bound interview skill/);
  // /grilling survives only as the fallback binding id, not as a hard-coded default
  assert.match(define, /\/grilling/);
  assert.ok(!/`\/grilling`\s+unless/.test(define),
    'define should not hard-code /grilling as the unconditional default interview skill');
});

// ── criterion 4: the three touched skill files are write-skills-clean — proper
// frontmatter and self-contained (no internal-only ADR citations) ──
test('the three touched skill files carry proper frontmatter and cite no internal-only ADRs', () => {
  for (const f of [CONFIGURE, BEGIN, DEFINE]) {
    const text = read(f);
    assert.ok(frontmatterName(text), `${f} needs a frontmatter name`);
    assert.match(text, /^description:\s*\S/m, `${f} needs a frontmatter description`);
    assert.ok(!/\bADR-\d/.test(text), `${f} must not cite an internal ADR (skills are self-contained)`);
    assert.equal(text.match(/\$CLAUDE_PLUGIN_ROOT/g), null,
      `${f} must brace every CLAUDE_PLUGIN_ROOT reference`);
  }
});
