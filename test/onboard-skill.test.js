// onboard/onboard-skill-greenfield's acceptance, executable: the onboard bare-verb skill,
// its scenario detection, and the greenfield route. Prose-only footprint — every assertion
// reads the shipped SKILL.md text directly, the way a human or a downstream agent would.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(p, 'utf8');
const frontmatterName = (text) => text.match(/^name:\s*(\S+)\s*$/m)?.[1];
const ONBOARD = 'plugin/skills/onboard/SKILL.md';

// ── criterion 1: a bare-verb onboard skill whose frontmatter names its /begin reach ──
test('onboard is a bare-verb skill with frontmatter name onboard and a description naming its /begin reach', () => {
  assert.ok(existsSync(ONBOARD), `${ONBOARD} should exist`);
  const text = read(ONBOARD);
  assert.equal(frontmatterName(text), 'onboard');
  assert.match(text, /^description:.*\/begin/mi,
    'the description names the /begin reach the front door runs');
});

// ── criterion 2: the skill detects the scenario from the tree, no bespoke marker ──
test('onboard detects greenfield vs brownfield from the tree with no bespoke marker', () => {
  const text = read(ONBOARD);
  assert.match(text, /greenfield/i);
  assert.match(text, /brownfield/i);
  assert.match(text, /detect/i);
  // it reads the tree, not a stored flag/marker
  assert.match(text, /\btree\b/i);
  assert.match(text, /no bespoke marker|without a bespoke marker|no marker|derive|not a (stored )?marker/i,
    'detection is derived from the tree, never a bespoke stored marker');
});

// ── criterion 3: the greenfield route runs configure BEFORE Define → Design, and every
// configure question carries a recommended answer ──
test('the greenfield route runs the configure leg before Define then Design, with a recommended answer on every question', () => {
  const text = read(ONBOARD);

  // the configure leg runs via the configure skill / hooks-list
  assert.match(text, /configure/i);
  assert.match(text, /configure skill|hooks-list/i,
    'the configure leg runs via the configure skill / hooks-list');

  // ordering: configure leg is stated before Define, which precedes Design
  const configureIdx = text.search(/configure/i);
  const defineIdx = text.search(/\bDefine\b/);
  const designIdx = text.search(/\bDesign\b/);
  assert.ok(configureIdx >= 0 && defineIdx >= 0 && designIdx >= 0,
    'the route names the configure leg, Define, and Design');
  assert.ok(configureIdx < defineIdx,
    'the configure leg runs before handing off to Define');
  assert.ok(defineIdx < designIdx,
    'Define precedes Design');

  // every configure question carries a recommended answer
  assert.match(text, /recommend/i);
  assert.match(text, /every (configure )?question|each question|recommended answer/i,
    'every configure question carries a recommended answer');
});

// ── brownfield criterion 1: an assess-and-fill section that detects existing
// infrastructure across the five evidence classes and interviews only the gaps ──
test('the brownfield route assesses existing infrastructure across the evidence classes and interviews only the gaps', () => {
  const text = read(ONBOARD);

  // there is an assess-and-fill section for the brownfield route
  assert.match(text, /assess-and-fill/i,
    'the brownfield route has an assess-and-fill section');

  // it detects each of the five evidence classes
  assert.match(text, /package\.json/i, 'detects package.json scripts / task runners');
  assert.match(text, /\bCI\b|workflow/i, 'detects CI workflows');
  assert.match(text, /husky|pre-commit|hook system/i, 'detects hook systems');
  assert.match(text, /deploy|Dockerfile|release workflow/i, 'detects deploy machinery');
  assert.match(text, /observability/i, 'detects observability config');

  // it interviews only the gaps rather than re-asking what the tree already answers
  assert.match(text, /only the gaps|gaps only|interview(s)? the gaps|only where.*gap/i,
    'assess-and-fill interviews only the gaps the detection leaves open');
});

// ── brownfield criterion 2: recommend-and-confirm the settings-side hooks from
// evidence, every write human-confirmed — detection is never trusted silently ──
test('the brownfield route recommends-and-confirms the settings-side hooks from evidence with every write human-confirmed', () => {
  const text = read(ONBOARD);

  // the three settings-side hooks are named as the recommend-and-confirm targets
  assert.match(text, /test harness/i, 'test harness is a recommend-and-confirm target');
  assert.match(text, /\blint\b/i, 'lint is a recommend-and-confirm target');
  assert.match(text, /pre-commit/i, 'pre-commit is a recommend-and-confirm target');

  // recommend-and-confirm from evidence, never silent adoption
  assert.match(text, /recommend-and-confirm|recommend.{0,20}confirm/i,
    'the hooks are recommended-and-confirmed');
  assert.match(text, /human-confirmed|human confirms|confirm(s)? each write|never trusted silently|no silent/i,
    'every write is human-confirmed — detection is never trusted silently');
});

// ── brownfield criterion 3: fill the three recorded-binding sections from evidence +
// interview, `none` a legal per-section opt-out, staging a skeletal architecture.md if
// absent ──
test('the brownfield route fills the three recorded-binding sections with a none opt-out, staging a skeletal architecture.md if absent', () => {
  const text = read(ONBOARD);

  // the three recorded-binding section headings, exactly as the tree names them today
  assert.match(text, /## Validation runbook|`## Validation runbook`|Validation runbook/,
    'names the Validation runbook section');
  assert.match(text, /Release runbook/, 'names the Release runbook section');
  assert.match(text, /Operations toolkit/, 'names the Operations toolkit section');

  // filled from evidence plus interview
  assert.match(text, /evidence/i, 'the sections are filled from evidence');

  // `none` is a legal per-section opt-out
  assert.match(text, /\bnone\b/i);
  assert.match(text, /opt-out|opt out/i, '`none` is a recorded per-section opt-out');

  // a skeletal architecture.md is staged when it does not yet exist, for Design to complete
  assert.match(text, /docs\/architecture\.md/, 'references docs/architecture.md');
  assert.match(text, /skeletal|stage|staged/i,
    'stages a skeletal architecture.md when absent for Design to complete');
});

// ── brownfield criterion 4: hand off to Define then Design grounded in the existing
// code, doing no graph surgery ──
test('the brownfield route hands off to Define then Design grounded in existing code and does no graph surgery', () => {
  const text = read(ONBOARD);

  // grounded in the code that's there
  assert.match(text, /existing code|the code that'?s there|grounded in.*code/i,
    'the handoff is grounded in the existing code');

  // Define then Design, in order, within the brownfield route
  const assessIdx = text.search(/assess-and-fill/i);
  const brownfield = text.slice(assessIdx);
  const bDefine = brownfield.search(/\bDefine\b/);
  const bDesign = brownfield.search(/\bDesign\b/);
  assert.ok(bDefine >= 0 && bDesign >= 0 && bDefine < bDesign,
    'the brownfield route hands off to Define then Design, in that order');

  // no graph surgery during onboarding
  assert.match(text, /no graph surgery|graph (stays|remains).*Design|feature graph.*Design'?s output/i,
    'onboarding does no graph surgery — the feature graph stays Design’s output');
});

// ── criterion 4: the skill is write-skills-clean — frontmatter present, no internal ADR
// citations, every CLAUDE_PLUGIN_ROOT reference brace-wrapped ──
test('onboard SKILL.md is write-skills-clean: frontmatter, no ADR citations, braced CLAUDE_PLUGIN_ROOT', () => {
  const text = read(ONBOARD);
  assert.ok(frontmatterName(text), `${ONBOARD} needs a frontmatter name`);
  assert.match(text, /^description:\s*\S/m, `${ONBOARD} needs a frontmatter description`);
  assert.ok(!/\bADR-\d/.test(text), `${ONBOARD} must not cite an internal ADR (skills are self-contained)`);
  assert.equal(text.match(/\$CLAUDE_PLUGIN_ROOT/g), null,
    `${ONBOARD} must brace every CLAUDE_PLUGIN_ROOT reference`);
});
