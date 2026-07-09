// operate-tooling/ops-toolkit-interview: plugin/skills/design/SKILL.md gains the
// third recorded binding. These assertions read the skill's prose directly (the
// way a human or a downstream agent reading the skill would) — no code touches
// SKILL.md, so the file's text is the whole surface under test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(p, 'utf8');

test('design/SKILL.md\'s recorded-bindings list grows from two to three: validation procedure, release runbook, operations toolkit', () => {
  const skill = read('plugin/skills/design/SKILL.md');

  assert.match(skill, /\bthree\b[^.]*recorded bindings/);
  assert.ok(!/\btwo\b[^.]*recorded bindings/.test(skill), 'stale "two recorded bindings" should be gone');

  assert.match(skill, /## Validation procedure/);
  assert.match(skill, /## Release runbook/);
  assert.match(skill, /## Operations toolkit/);
});

test('the interview asks the ops-toolkit questions and "how will you know something\'s wrong?", offering a recommendation fitted to the project with skip/none legal', () => {
  const skill = read('plugin/skills/design/SKILL.md');

  // deployment targets, capabilities tagged read/mutate, observability, runbook
  // pointers, never-do — the template's five ingredients, asked about.
  assert.match(skill, /deployment targets/i);
  assert.match(skill, /tagged\s+`?read`?\s+or\s+`?mutate`?/i);
  assert.match(skill, /how will you know something's wrong\?/i);
  assert.match(skill, /runbook pointers/i);
  assert.match(skill, /never-do/i);

  // a recommendation fitted to the project, and "skip" a legal recommendation
  assert.match(skill, /fitted to the project/i);
  assert.match(skill, /\bskip\b/i);
});

test('instructs recording the answers as a `## Operations toolkit` section holding deployment targets, read/mutate-tagged capabilities, an apprisal path naming the routed runbook, runbook pointers, and a never-do list — or a recorded opt-out', () => {
  const skill = read('plugin/skills/design/SKILL.md');

  assert.match(skill, /apprisal path names? the runbook it routes to/i);
  assert.match(skill, /recorded opt-out/i);

  // the opt-out applies to the operations-toolkit section too, not only the
  // other two bindings — "none" named in the same breath as the toolkit heading
  const toolkitIdx = skill.indexOf('## Operations toolkit');
  assert.ok(toolkitIdx !== -1, '## Operations toolkit should be named as a heading');
  const afterHeadingMention = skill.slice(toolkitIdx, toolkitIdx + 1200);
  assert.match(afterHeadingMention, /\bnone\b/i);
});
