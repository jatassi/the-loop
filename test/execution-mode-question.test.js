// interactive-feature-type/t5's acceptance, executable: `execution` is the human's
// answer, so the two producer surfaces — design (a promotion batch) and diagnose (one
// fix record) — must *ask* for it and may never infer it. Prose-only footprint: every
// assertion reads the shipped skill bodies directly, the way a downstream agent would,
// the same posture as execute-skill.test.js and skills-and-command-sweep.test.js.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(p, 'utf8');
const DESIGN = 'plugin/skills/design/SKILL.md';
const DIAGNOSE = 'plugin/skills/diagnose/SKILL.md';

/** Collapse line wrapping so assertions pin sentences, not the column they broke at. */
const squish = (text) => text.replaceAll(/\s+/g, ' ').trim();

/**
 * The execution-mode passage of a skill: from the first mention of the field through
 * the end of the one-line test. Assertions that must hold *in the passage* (rather
 * than anywhere in the file) read this slice.
 */
const modePassage = (text) => {
  const start = text.indexOf('Execution mode');
  assert.notEqual(start, -1, 'the skill should carry an "Execution mode" question');
  const end = text.indexOf('make them look', start);
  assert.notEqual(end, -1, 'the one-line test should follow the question');
  return squish(text.slice(start, end + 200));
};

/** The six recommendation criteria, keyed by the phrase each must be recognizable by. */
const CRITERIA = [
  [/\*\*Taste\.\*\*/, /visual design|copy, tone|naming|ergonomics/i],
  [/\*\*The work \*?is\*? the decision\.?\*?\*?/, /set of rulings/i],
  [/\*\*Adjudication-shaped acceptance\.\*\*/, /whose subject is a human act/i],
  [/\*\*Only a person can see it\.\*\*/, /validator's environment cannot reach/i],
  [/open fork|unwritten preference/i, /cannot be specified has to be attended/i],
  [/\*\*Hard to reverse and cheap to get subtly wrong\.\*\*/, /schema migrations|auth and permissions/i],
];

/** Criteria 1 and 3's shared inline payload: values, default, six criteria, one-line test. */
const assertCarriesTheCriteriaInline = (label, text) => {
  const passage = modePassage(text);

  // both values, and absent-means-autonomous
  assert.match(text, /`autonomous`\s*\|\s*`interactive`|`autonomous \| interactive`/, `${label}: both values should be stated`);
  assert.match(squish(text), /\*\*Absent means `autonomous`\*\*/, `${label}: absent-means-autonomous should be stated`);

  // all six recommendation criteria, inline
  for (const [heading, gist] of CRITERIA) {
    assert.match(passage, heading, `${label}: the recommendation criteria should carry ${heading}`);
    assert.match(passage, gist, `${label}: the ${heading} criterion should carry its substance (${gist})`);
  }

  // the one-line test, both halves
  assert.match(
    passage,
    /would the human want to look at the result before it lands — and can the acceptance criteria make them look\?/i,
    `${label}: the one-line test should be carried verbatim`,
  );
  assert.match(passage, /Yes and no means `interactive`/i, `${label}: the one-line test should say which answer means interactive`);
};

// ── criterion 1: design requires the author to ask, forbids inferring, and carries the
// values, the default, all six criteria, and the one-line test inline ──
test('design requires the human be asked for the execution mode and never infers it', () => {
  const design = read(DESIGN);
  const squished = squish(design);

  assert.match(squished, /the human's answer, never yours to infer/i, 'design should forbid inferring the answer');
  assert.match(
    squished,
    /an agent deciding for itself which work it may run unattended is the wrong party/i,
    'design should say why the question belongs to the human',
  );
  assert.match(modePassage(design), /which of these should the pipeline build on its own/i, 'design should pose the question in the human\'s words');

  assertCarriesTheCriteriaInline('design', design);
});

// ── criterion 2: once per promotion batch, each flagged feature with the criterion that
// flagged it, the rest defaulted to autonomous, an invitation to flip — and posed even
// when nothing is flagged ──
test('design poses the execution-mode question once per promotion batch, flagged or not', () => {
  const design = read(DESIGN);
  const squished = squish(design);
  const passage = modePassage(design);

  assert.match(squished, /once,? for the whole batch|once per (promotion )?batch/i, 'the question should be posed once for the batch');
  assert.match(squished, /every feature this pass promotes/i, 'the batch should be every feature the pass promotes');

  // each flagged feature is listed with the criterion that flagged it
  assert.match(passage, /Recommended:.*`<id>`\s*\*\*interactive\*\*.*criterion that flagged it/i,
    'the question should list each flagged feature with the criterion that flagged it');
  assert.match(passage, /Everything else \*\*autonomous\*\*/, 'the unflagged rest should default to autonomous');
  assert.match(passage, /Flip any of them/i, 'the human should be invited to flip any of them');

  // posed even when nothing is flagged
  assert.match(squished, /even when you flag nothing/i, 'the question should be posed even when nothing is flagged');
  assert.match(
    squished,
    /A question that disappears when the recommendation is "no" is not a question/i,
    'design should say why the unflagged pass still gets the question',
  );
  assert.match(squished, /unflagged batch is exactly where a wrong default sticks silently/i, 'design should name the silent-default hazard');
});

// ── criterion 3: diagnose poses the same question for its one fix-<slug> record at
// writeup, with the same payload inline, the autonomous-is-usual note, and no skipping ──
test('diagnose poses the same execution-mode question for its one fix record', () => {
  const diagnose = read(DIAGNOSE);
  const squished = squish(diagnose);

  // at writeup — inside step 4, where the fix record is written, ahead of the gate
  const writeup = diagnose.indexOf('## 4 · Write the RCA doc and the fix');
  const gate = diagnose.indexOf('## 5 · Gate');
  const at = diagnose.indexOf('Execution mode');
  assert.ok(at > writeup && at < gate, 'the question should be posed at fix-record writeup, before the gate');
  assert.match(squish(diagnose.slice(writeup, gate)), /fix-<slug>/, 'the question should be scoped to the one fix-<slug> record');

  assert.match(squished, /the human's answer, never yours to infer/i, 'diagnose should forbid inferring the answer');
  assert.match(modePassage(diagnose), /should the pipeline build this fix on its own/i, 'diagnose should pose the question for the one fix');

  // most fixes are autonomous, and why
  assert.match(
    squished,
    /most fixes are: a regression test is exactly the artifact an agent can drive/i,
    'diagnose should note that most fixes are autonomous because a regression test is what an agent can drive',
  );

  // posed even when nothing is flagged
  assert.match(squished, /Ask anyway, every time, even when you flag nothing/i, 'diagnose should pose the question even when nothing is flagged');

  assertCarriesTheCriteriaInline('diagnose', diagnose);
});

// ── criterion 4: the record shape each skill shows names `execution`, its two values,
// and the absent-means-autonomous default ──
test('the record shape each skill shows carries execution, its values, and the default', () => {
  for (const [label, path] of [['design', DESIGN], ['diagnose', DIAGNOSE]]) {
    const text = read(path);
    const block = text.match(/```json\n([\s\S]*?)```/g)
      ?.find((b) => b.includes('"status"'));
    assert.ok(block, `${label}: should show a feature record shape`);
    assert.match(block, /"execution":\s*"(autonomous|interactive)"/, `${label}: the record shape should name execution`);
    assert.match(
      block,
      /"status":[^\n]*\n\s*"execution":[^\n]*\n\s*"depends_on":/,
      `${label}: execution should sit between status and depends_on, the canonical order`,
    );

    // the two values and the default are stated where the shape is explained
    const after = squish(text.slice(text.indexOf(block) + block.length, text.indexOf(block) + block.length + 1400));
    assert.match(after, /`execution` is `autonomous \| interactive`/, `${label}: both values should be stated with the shape`);
    assert.match(after, /\*\*Absent means `autonomous`\*\*/, `${label}: the default should be stated with the shape`);
  }
});

// ── criterion 6: both files stay consumer-safe — no bare ADR number, and the new
// passage points at no document at all ──
test('neither producer surface cites an ADR number or a path into the-loop\'s own docs', () => {
  for (const [label, path] of [['design', DESIGN], ['diagnose', DIAGNOSE]]) {
    const text = read(path);
    assert.ok(!/\bADR-\d/.test(text), `${label}: must not cite a bare ADR number (skills are self-contained)`);
    for (const internal of ['docs/plans/', 'docs/designs/interactive-feature-type', 'docs/design-decisions.md', 'CLAUDE.md']) {
      assert.ok(!text.includes(internal), `${label}: must not reference the-loop-internal ${internal}`);
    }
    // the execution-mode passage stands alone: it names no document, so nothing about
    // it can rot into a pointer at a repo the reader does not have
    assert.ok(!/docs\//.test(modePassage(text)), `${label}: the execution-mode passage should name no document path`);
  }
});
