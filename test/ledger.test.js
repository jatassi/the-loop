import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appendRun, appendShip, renderLedger } from '../src/ledger.js';

const MODEL = {
  designVersion: 3,
  features: [
    { id: 'widget', title: 'Widget', status: 'designed', depends_on: [], acceptance: 'x' },
    { id: 'gadget', title: 'Gadget', status: 'validated', depends_on: [], acceptance: 'x' },
    { id: 'gizmo', title: 'Gizmo', status: 'planned', depends_on: ['gadget'], acceptance: 'x' },
    { id: 'sprocket', title: 'Sprocket', status: 'planned', depends_on: ['widget'], acceptance: 'x' },
  ],
};

const ESCALATIONS = [
  {
    feature: 'widget',
    phase: 'build',
    kind: 'feature',
    deviation: "contract asked for an atomic rename fs can't guarantee",
    menu: [
      { resolution: 'fix-in-place', option: 'split the task' },
      { resolution: null, option: 'relax the atomicity criterion' },
    ],
    branch: 'loop/widget',
  },
];

const PRIOR = `## What this is
Test-loop: a fixture ledger for renderLedger.

## Where we are
stale counts — will be regenerated

## What needs you
stale — will be regenerated

## What's next
stale — will be regenerated

## Run history
2026-07-01: first hand-render.
`;

const SEEDED_TITLE = '# Ledger — projected from design.md (feature graph)\n\n';

// The five sections as rendered from MODEL/ESCALATIONS/PRIOR — what follows any
// preamble, seeded or preserved.
const BODY = `## What this is
Test-loop: a fixture ledger for renderLedger.

## Where we are
Total: 4 (design_version 3)

- designed: 1
- planned: 2
- building: 0
- validated: 1
- shipped: 0
- parked: 0
- drifted: 0

## What needs you
- **widget** (build): contract asked for an atomic rename fs can't guarantee
  - menu: [fix-in-place] split the task; [?] relax the atomicity criterion
  - branch: loop/widget

## What's next
\`widget\`, \`gizmo\`

## Run history
2026-07-01: first hand-render.
`;

// PRIOR carries nothing before its first "## " heading, so renders seed the title.
const EXPECTED = `${SEEDED_TITLE}${BODY}`;

test('renderLedger preserves "## What this is"/"## Run history" byte-identically and regenerates "## Where we are"/"## What needs you"/"## What\'s next" from the graph and escalations', () => {
  assert.equal(renderLedger(MODEL, ESCALATIONS, PRIOR), EXPECTED);
});

test('renderLedger is deterministic — identical inputs render byte-identical output, twice', () => {
  const first = renderLedger(MODEL, ESCALATIONS, PRIOR);
  const second = renderLedger(MODEL, ESCALATIONS, PRIOR);
  assert.equal(first, second);
  assert.equal(first, EXPECTED);
});

test('content before priorText\'s first "## " heading is preserved byte-identically at the top of the render', () => {
  const title = '# Ledger — test-loop · established at a hand-render\n\n';
  const out = renderLedger(MODEL, ESCALATIONS, `${title}${PRIOR}`);
  assert.equal(out, `${title}${BODY}`);
});

test('an empty priorText seeds the standard title line, one blank line, then the sections', () => {
  const out = renderLedger(MODEL, ESCALATIONS, '');
  const firstHeading = /^## /m.exec(out);
  assert.equal(out.slice(0, firstHeading.index), '# Ledger — projected from design.md (feature graph)\n\n');
});

test('a priorText missing a preserved section still renders, seeding a minimal placeholder for it', () => {
  const noRunHistory = '## What this is\nJust this, no run history section at all.\n';
  const text = renderLedger(MODEL, [], noRunHistory);
  assert.ok(text.startsWith(`${SEEDED_TITLE}## What this is\nJust this, no run history section at all.`));
  const runHistoryIdx = text.indexOf('## Run history');
  assert.notEqual(runHistoryIdx, -1);
  assert.match(text.slice(runHistoryIdx), /^## Run history\n\S/); // seeded placeholder, not empty/crashed
});

const RUN_HISTORY_PRIOR = `## What this is
Fixture for appendRun.

## Run history
2026-07-01: first hand-render.
`;

test('appendRun inserts one bullet as the first content after "## Run history", fields in fixed order with empty segments omitted, and preserves every other byte', () => {
  const full = appendRun(RUN_HISTORY_PRIOR, {
    date: '2026-07-04',
    run: 'wf_999',
    completed: ['alpha', 'beta'],
    parked: ['gamma'],
    stalled: ['delta'],
    halted: { reason: 'budget-exhausted', detail: 'ran out of tokens' },
    budget: { spent: 500, remaining: 100 },
  });
  assert.equal(full, `## What this is
Fixture for appendRun.

## Run history
- 2026-07-04 | wf_999 | completed: alpha, beta | parked: gamma | stalled: delta | halted: budget-exhausted — ran out of tokens | budget: 500/100
2026-07-01: first hand-render.
`);

  const minimal = appendRun(RUN_HISTORY_PRIOR, { date: '2026-07-04', run: 'wf_1' });
  assert.equal(minimal, `## What this is
Fixture for appendRun.

## Run history
- 2026-07-04 | wf_1
2026-07-01: first hand-render.
`);
});

test('appendRun is deterministic — the same summary always renders the same bytes', () => {
  const summary = { date: '2026-07-04', run: 'wf_1', completed: ['alpha'] };
  assert.equal(appendRun(RUN_HISTORY_PRIOR, summary), appendRun(RUN_HISTORY_PRIOR, summary));
});

test('appendRun throws, nothing to insert, when date or run is missing from the summary', () => {
  assert.throws(() => appendRun(RUN_HISTORY_PRIOR, { run: 'wf_1' }));
  assert.throws(() => appendRun(RUN_HISTORY_PRIOR, { date: '2026-07-04' }));
});

test('appendRun throws when priorText has no "## Run history" heading', () => {
  assert.throws(() => appendRun('## What this is\nNo run history here.\n', { date: '2026-07-04', run: 'wf_1' }));
});

test('appendShip inserts one bullet as the first content after "## Run history" in the pinned format, appending rollback_verified only when entry.rollback_verified is defined, and preserves every other byte', () => {
  const deployed = appendShip(RUN_HISTORY_PRIOR, {
    date: '2026-07-04',
    ship: 3,
    outcome: 'deployed',
    features: ['alpha', 'beta'],
  });
  assert.equal(deployed, `## What this is
Fixture for appendRun.

## Run history
- 2026-07-04 | ship-3 | deployed | features: alpha, beta
2026-07-01: first hand-render.
`);

  const rolledBack = appendShip(RUN_HISTORY_PRIOR, {
    date: '2026-07-04',
    ship: 3,
    outcome: 'rolled-back',
    features: ['alpha'],
    rollback_verified: false,
  });
  assert.equal(rolledBack, `## What this is
Fixture for appendRun.

## Run history
- 2026-07-04 | ship-3 | rolled-back | features: alpha | rollback_verified: false
2026-07-01: first hand-render.
`);
});

test('appendShip throws, nothing to insert, when date, ship, or outcome is missing from the entry', () => {
  assert.throws(() => appendShip(RUN_HISTORY_PRIOR, { ship: 3, outcome: 'deployed' }));
  assert.throws(() => appendShip(RUN_HISTORY_PRIOR, { date: '2026-07-04', outcome: 'deployed' }));
  assert.throws(() => appendShip(RUN_HISTORY_PRIOR, { date: '2026-07-04', ship: 3 }));
});

test('appendShip throws when priorText has no "## Run history" heading, priorText unmodified', () => {
  const noHeading = '## What this is\nNo run history here.\n';
  assert.throws(() => appendShip(noHeading, { date: '2026-07-04', ship: 1, outcome: 'deployed' }));
  assert.equal(noHeading, '## What this is\nNo run history here.\n');
});
