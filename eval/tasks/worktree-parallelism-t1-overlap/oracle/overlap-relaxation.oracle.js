// Oracle for worktree-parallelism-t1-overlap — validates a plan whose two tasks share a
// footprint file with no ordering edge between them through the plan validator's public
// surface (parsePlan + validatePlan). At the parent state this raises the unordered-overlap
// error; after the relaxation it validates clean. The fixture is otherwise valid (coverage
// complete, sizes and edges sound), so the ONLY thing standing between it and a clean pass
// is the overlap rule.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse } from '../src/parse.js';
import { parsePlan, validatePlan } from '../src/plan.js';

const DESIGN = parse(`## Feature graph

\`\`\`yaml
design_version: 2
features:
  - id: widget
    title: Widget
    status: designed
    acceptance: [renders a widget, persists a widget]
\`\`\`
`);

// t1 and t2 both edit src/render.js, and neither orders before the other (both depends_on
// []). That is precisely the shape the retired lint used to reject.
const PLAN = `# Plan — widget

## Tasks

\`\`\`yaml
feature: widget
design_version: 2
tasks:
  - id: t1
    title: Render pipeline
    covers: [1]
    acceptance: given a widget model, rendering returns markup
    footprint: [src/render.js, test/render.test.js]
    size: s
    depends_on: []
  - id: t2
    title: Persistence
    covers: [2]
    acceptance: a saved widget round-trips through render
    footprint: [src/save.js, src/render.js]
    size: xs
    depends_on: []
\`\`\`
`;

test('criterion 1: a plan whose unordered tasks share a footprint file passes plan check clean', () => {
  const model = parsePlan(PLAN);
  const r = validatePlan(model, DESIGN);
  assert.ok(!r.errors.map((e) => e.code).includes('unordered-overlap'), 'the unordered-overlap rule is gone, not merely quiet here');
  assert.deepEqual(r.errors, [], 'no plan-check errors at all');
  assert.equal(r.ok, true);
});
