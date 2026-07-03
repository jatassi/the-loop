import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderLedger } from '../src/ledger.js';

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
    menu: ['split the task', 'relax the atomicity criterion'],
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

const EXPECTED = `## What this is
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
  - menu: split the task; relax the atomicity criterion
  - branch: loop/widget

## What's next
\`widget\`, \`gizmo\`

## Run history
2026-07-01: first hand-render.
`;

test('renderLedger preserves "## What this is"/"## Run history" byte-identically and regenerates "## Where we are"/"## What needs you"/"## What\'s next" from the graph and escalations', () => {
  assert.equal(renderLedger(MODEL, ESCALATIONS, PRIOR), EXPECTED);
});

test('renderLedger is deterministic — identical inputs render byte-identical output, twice', () => {
  const first = renderLedger(MODEL, ESCALATIONS, PRIOR);
  const second = renderLedger(MODEL, ESCALATIONS, PRIOR);
  assert.equal(first, second);
  assert.equal(first, EXPECTED);
});

test('a priorText missing a preserved section still renders, seeding a minimal placeholder for it', () => {
  const noRunHistory = '## What this is\nJust this, no run history section at all.\n';
  const text = renderLedger(MODEL, [], noRunHistory);
  assert.match(text, /^## What this is\nJust this, no run history section at all\./);
  const runHistoryIdx = text.indexOf('## Run history');
  assert.notEqual(runHistoryIdx, -1);
  assert.match(text.slice(runHistoryIdx), /^## Run history\n\S/); // seeded placeholder, not empty/crashed
});
