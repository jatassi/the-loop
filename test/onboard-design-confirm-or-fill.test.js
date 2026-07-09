// onboard/design-confirm-or-fill's acceptance, executable: the design skill's
// recorded-binding interviews confirm-or-fill instead of re-asking from scratch, plus
// the lint-policy elicitation and the stack-time capture of the settings-side project
// hooks. Prose-only footprint — every assertion reads the shipped SKILL.md text
// directly, the way a human or a downstream agent would.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(p, 'utf8');
const frontmatterName = (text) => text.match(/^name:\s*(\S+)\s*$/m)?.[1];
const DESIGN = 'plugin/skills/design/SKILL.md';

// ── criterion 1: recorded-binding interviews confirm-or-fill when a section already
// exists instead of re-asking from scratch ──
test('recorded-binding interviews confirm-or-fill when a section already exists', () => {
  const text = read(DESIGN);
  assert.match(text, /confirm-or-fill/, 'the confirm-or-fill wording is present');
  assert.match(text, /already carries content|section already exists/i,
    'the confirm-or-fill clause names the already-present case');
  assert.match(text, /rather than re-asking from scratch|instead of re-asking from scratch/i,
    'it states the alternative it replaces: re-asking from scratch');
  assert.match(text, /interview only the gaps/i,
    'a present section is filled for gaps only, not re-interviewed wholesale');
});

// ── criterion 2a: the lint-policy elicitation — recommend a stricter policy per
// stack, land it in the project's real lint config ──
test('design gains the lint-policy elicitation: recommend stricter per stack, land it in the real lint config', () => {
  const text = read(DESIGN);
  assert.match(text, /lint-policy elicitation/i, 'the lint-policy elicitation is named');
  assert.match(text, /stricter/i, 'it recommends the stricter policy');
  assert.match(text, /per stack|chosen stack/i, 'the recommendation is per stack');
  assert.match(text, /real lint config/i, 'the policy lands in the project\'s real lint config');
  assert.match(text, /never\s+a\s+parallel\s+policy\s+blob|not\s+a\s+parallel\s+policy\s+blob/i,
    'the policy is never recorded as a parallel policy blob');
});

// ── criterion 2b: stack-time capture of the settings-side project hooks (test
// harness, lint, pre-commit) once the stack is chosen ──
test('design captures the settings-side project hooks (test harness, lint, pre-commit) once the stack is chosen', () => {
  const text = read(DESIGN);
  assert.match(text, /stack is chosen|stack is known/i,
    'the capture is timed to when the stack is chosen');
  assert.match(text, /test harness/i);
  assert.match(text, /\bpre-commit\b/i);
  assert.match(text, /\blint\b/i);
  assert.match(text, /hooks-set/, 'the capture persists via hooks-set, like configure\'s families');
  for (const family of ['testHarness', 'lint', 'precommit']) {
    assert.ok(text.includes(family), `the ${family} family should be named`);
  }
});

// ── criterion 3: design stays write-skills-clean ──
test('design/SKILL.md stays write-skills-clean: frontmatter, description, and braced CLAUDE_PLUGIN_ROOT', () => {
  const text = read(DESIGN);
  assert.equal(frontmatterName(text), 'design');
  assert.match(text, /^description:\s*\S/m, 'design needs a frontmatter description');
  assert.equal(text.match(/\$CLAUDE_PLUGIN_ROOT/g), null,
    'design must brace every CLAUDE_PLUGIN_ROOT reference');
});
