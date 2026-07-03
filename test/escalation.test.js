import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseEscalation } from '../src/escalation.js';

const FULL = `# Escalation — widget

Prose narrative describing what happened.

## Escalation

\`\`\`yaml
feature: widget
phase: build
kind: feature
deviation: contract asked for an atomic rename fs can't guarantee
menu:
  - split the task
  - relax the atomicity criterion
branch: loop/widget
\`\`\`
`;

const BARE = `# Escalation — widget

## Escalation

\`\`\`yaml
feature: widget
phase: plan
kind: environment
\`\`\`
`;

test('parseEscalation reads the pinned keys from the yaml block under "## Escalation", defaulting menu to [] and absent scalars to null', () => {
  assert.deepEqual(parseEscalation(FULL), {
    feature: 'widget',
    phase: 'build',
    kind: 'feature',
    deviation: "contract asked for an atomic rename fs can't guarantee",
    menu: ['split the task', 'relax the atomicity criterion'],
    branch: 'loop/widget',
  });
  assert.deepEqual(parseEscalation(BARE), {
    feature: 'widget',
    phase: 'plan',
    kind: 'environment',
    deviation: null,
    menu: [],
    branch: null,
  });
});

test('text with no Escalation heading, or a heading with no fenced yaml block, returns null rather than throwing', () => {
  assert.equal(parseEscalation('# Escalation — widget\n\nJust prose, no heading at all.\n'), null);
  assert.equal(parseEscalation('# Escalation — widget\n\n## Escalation\n\nNo fenced block under the heading.\n'), null);
});
