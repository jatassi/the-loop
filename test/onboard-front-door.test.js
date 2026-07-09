// onboard/onboard-front-door's acceptance, executable: the front door's onboard route
// hands off to the onboard skill instead of running define-then-design directly, and
// the explicit-jump enumeration grows to include both `/begin onboard` and
// `/begin configure`. Prose-only footprint — every assertion reads the shipped
// begin/SKILL.md text directly, the way a human or a downstream agent would.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(p, 'utf8');
const frontmatterName = (text) => text.match(/^name:\s*(\S+)\s*$/m)?.[1];
const BEGIN = 'plugin/skills/begin/SKILL.md';

// ── criterion 1: the onboard route points at the onboard skill (which runs
// configure, branches by scenario, and hands off) rather than define-then-design
// directly ──
test('the begin onboard route hands off to the onboard skill rather than running define then design directly', () => {
  const text = read(BEGIN);
  const routeLine = text.match(/^-\s*`onboard`\s*→.*(?:\n(?!-\s*`).*)*/m)?.[0];
  assert.ok(routeLine, 'a `- `onboard` → …` route bullet should exist');

  // it names the onboard skill as the destination, not define/design directly
  assert.match(routeLine, /`onboard` skill/);
  assert.ok(
    !/`onboard`\s*→\s*the\s*`define`\s*skill/.test(routeLine),
    'the onboard route should no longer jump straight to the define skill',
  );

  // the onboard skill's own contract is echoed here: runs configure, branches by
  // scenario, and hands off
  assert.match(routeLine, /configure/i);
  assert.match(routeLine, /branches by scenario|scenario/i);
  assert.match(routeLine, /hands off/i);
});

// ── criterion 2: the explicit-jump enumeration lists both `/begin onboard` and
// `/begin configure` ──
test('the explicit-jump enumeration lists both /begin onboard and /begin configure', () => {
  const text = read(BEGIN);
  const enumLine = text.match(/^.*explicit jump.*$/m)?.[0];
  assert.ok(enumLine, 'an "explicit jump" enumeration line should exist');
  assert.match(enumLine, /`\/begin [^`]*\bonboard\b[^`]*`/, 'the enumeration should include onboard');
  assert.match(enumLine, /`\/begin [^`]*\bconfigure\b[^`]*`/, 'the enumeration should include configure');
});

// ── criterion 3: begin stays write-skills-clean and does not stored-mark project
// state — its frontmatter is intact, it stays self-contained (no internal-only ADR
// citations, no bare $CLAUDE_PLUGIN_ROOT), and it never itself invokes the
// status-writing subcommand (`set-status`) — project state is derived from `status`,
// never stored-marked, from here ──
test('begin stays write-skills-clean and derives project state rather than stored-marking it', () => {
  const text = read(BEGIN);
  assert.equal(frontmatterName(text), 'begin');
  assert.match(text, /^description:\s*\S/m);
  assert.ok(!/\bADR-\d/.test(text), 'begin must not cite an internal ADR (skills are self-contained)');
  assert.equal(text.match(/\$CLAUDE_PLUGIN_ROOT/g), null,
    'every CLAUDE_PLUGIN_ROOT reference in begin must be braced');
  assert.ok(!/the-loop\.js"\s+set-status\b/.test(text),
    'begin should never itself invoke set-status — project state is derived, never stored-marked, from here');
});
