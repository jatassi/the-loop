// calibration-capture/recall-docs acceptance: plan agent and design skill
// consult the target project's calibration digest when present. Prose-only
// footprint — every assertion reads the shipped .md text directly.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(p, 'utf8');
const calLines = (text) => text.split('\n').filter((line) => /calibrat/i.test(line));
const PLAN = 'plugin/agents/plan.md';
const DESIGN = 'plugin/skills/design/SKILL.md';

// ── criterion 1: plan agent biases sizing/decomposition with a prompt-carried
// calibration digest when present ──
test('plan.md tells the plan agent a calibration digest may ride the prompt and to bias sizing/decomposition with it when present', () => {
  const text = read(PLAN);

  // digest may ride the prompt (conditional, not always-present)
  assert.match(text, /calibration\s+digest/i);
  assert.match(text, /(?:may|when\s+(?:it\s+is\s+)?present|if\s+present|when\s+present)/i);

  // bias sizing (Step 1) and/or decomposition (Step 2) with it
  assert.match(text, /bias/i);
  assert.match(text, /siz(?:e|ing)|decompos/i);
});

// ── criterion 2: design skill step 3 consults docs/calibration/index.md when
// present (conditional, not a mandatory read) ──
test('design SKILL.md step 3 consults docs/calibration/index.md when present as an input to slicing', () => {
  const text = read(DESIGN);

  // Locate step 3 (slicing) and the text through the next numbered step
  const step3Match = text.match(
    /3\.\s+\*\*Slice features[\s\S]*?(?=\n4\.\s+\*\*|$)/,
  );
  assert.ok(step3Match, 'step 3 "Slice features" section should exist');
  const step3 = step3Match[0];

  assert.match(step3, /docs\/calibration\/index\.md/);
  // explicitly conditional — not "always read"
  assert.match(step3, /when\s+(?:it\s+is\s+)?present|if\s+present|if\s+it\s+exists/i);
  assert.ok(
    !/\balways\s+read\b/i.test(step3),
    'step 3 must not mandate always reading the calibration digest',
  );
});

// ── criterion 3: new calibration lines are self-contained (no the-loop meta-docs);
// frontmatter stays intact ──
test('calibration recall lines cite no internal meta-docs; frontmatter remains valid', () => {
  const plan = read(PLAN);
  const design = read(DESIGN);

  // frontmatter
  assert.match(plan, /^name:\s*\S+/m);
  assert.match(plan, /^tools:\s*Read, Grep, Glob, Bash, Write, Edit\s*$/m);
  assert.match(design, /^name:\s*\S+/m);
  assert.match(design, /^description:\s*\S/m);

  // new text = lines that mention calibration (what this task adds)
  for (const [file, lines] of [
    [PLAN, calLines(plan)],
    [DESIGN, calLines(design)],
  ]) {
    assert.ok(lines.length > 0, `${file} should contain calibration recall text`);
    for (const line of lines) {
      assert.ok(
        !/\bADR-\d/.test(line),
        `${file} calibration line must not cite ADR-N: ${line}`,
      );
      assert.ok(
        !/docs\/plans\//.test(line),
        `${file} calibration line must not reference docs/plans/: ${line}`,
      );
      assert.ok(
        !/docs\/designs\//.test(line),
        `${file} calibration line must not reference docs/designs/: ${line}`,
      );
    }
  }
});
