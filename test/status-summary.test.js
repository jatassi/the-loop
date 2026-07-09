// The status story (ADR-0037): rendered on demand from the parsed graph, printed to
// stdout by `the-loop status`, never written to disk — so renderStatusSummary is a
// pure model → string function and these tests pin its bytes.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as statusSummaryModule from '../plugin/src/status-summary.js';

const { renderStatusSummary } = statusSummaryModule;

const MODEL = {
  designVersion: 3,
  features: [
    { id: 'widget', title: 'Widget', status: 'designed', depends_on: [], acceptance: 'x' },
    { id: 'gadget', title: 'Gadget', status: 'validated', depends_on: [], acceptance: 'x' },
    { id: 'gizmo', title: 'Gizmo', status: 'designed', depends_on: ['gadget'], acceptance: 'x' },
    { id: 'sprocket', title: 'Sprocket', status: 'shipped', depends_on: [], acceptance: 'x' },
  ],
};

const EXPECTED = `# Status — projected from docs/feature-graph.md

Total: 4 feature(s) at design_version 3

- proposed: 0
- designed: 2
- validated: 1
- shipped: 1

**Next:** \`widget\`, \`gizmo\`

| feature | status | title |
|---|---|---|
| widget | designed | Widget |
| gadget | validated | Gadget |
| gizmo | designed | Gizmo |
| sprocket | shipped | Sprocket |
`;

test('renderStatusSummary renders counts, the dependency-ready Next line, and the feature table — deterministically', () => {
  assert.equal(renderStatusSummary(MODEL), EXPECTED);
  assert.equal(renderStatusSummary(MODEL), renderStatusSummary(MODEL)); // same model, same bytes
});

test('the four-stage counts render, proposed included', () => {
  const withBacklog = {
    designVersion: 1,
    features: [
      { id: 'backlog-item', title: 'Backlog item', status: 'proposed', depends_on: [] },
      { id: 'widget', title: 'Widget', status: 'designed', depends_on: [], acceptance: 'x' },
      { id: 'gadget', title: 'Gadget', status: 'validated', depends_on: [], acceptance: 'x' },
      { id: 'sprocket', title: 'Sprocket', status: 'shipped', depends_on: [], acceptance: 'x' },
    ],
  };
  assert.match(renderStatusSummary(withBacklog), /- proposed: 1\n- designed: 1\n- validated: 1\n- shipped: 1/);
});

test('with nothing dependency-ready, the Next line says so', () => {
  const drained = {
    designVersion: 1,
    features: [{ id: 'a', title: 'A', status: 'validated', depends_on: [], acceptance: 'x' }],
  };
  assert.match(renderStatusSummary(drained), /\*\*Next:\*\* nothing dependency-ready\./);
});

test('the v1 committed-ledger appenders are gone from the module surface', () => {
  for (const removed of ['appendRun', 'appendShip']) {
    assert.ok(!Object.hasOwn(statusSummaryModule, removed), `${removed} must not be exported`);
  }
});
