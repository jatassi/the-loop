// fix-plan-commit-gate-blind-spot criterion 1: plan.md's footprint guidance
// carries a landing-constraint invariant so hub-merge edits under a whole-project
// commit gate never split ahead of their implementer as a standalone task.
// Prose-only footprint — asserts on the shipped plan.md text directly.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const PLAN = 'plugin/agents/plan.md';
const text = () => readFileSync(PLAN, 'utf8');

test('plan.md footprint requires hub-merge edits under a whole-project commit gate land with or after their implementer', () => {
  const plan = text();

  // Landing-constraint invariant: every task's single commit must pass the gate alone
  assert.match(plan, /every task'?s? single commit must pass/i);
  assert.match(plan, /commit gate standalone/i);

  // Whole-project commit gate named and tied to plan-prompt surfacing (allow line wraps)
  assert.match(plan, /whole-project\s+commit gate/i);
  assert.match(plan, /pre-commit hook/i);
  assert.match(plan, /surfaced in the plan prompt/i);

  // Registration/hub-merge split rule: same task/commit as implementer, or ordered after via depends_on
  assert.match(plan, /hub (?:merge|member)|registration edit/i);
  assert.match(plan, /same task\/commit/i);
  assert.match(plan, /depends_on/);
  assert.match(plan, /after the implementer/i);

  // Must NOT leave the old unconditional relaxation: "fine left unordered, since the
  // merge point resolves it under the test-gated merge policy" without qualification.
  assert.ok(
    !/fine left unordered,\s*since the merge point resolves/i.test(plan),
    'old unconditional registration-sharing relaxation must be gone or qualified',
  );

  // Merge-point relaxation resolves textual conflicts only — does not land unlandable commits
  assert.match(plan, /textual\s+conflicts? only/i);
  assert.match(plan, /individually-unlandable/i);
});
