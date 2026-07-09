// ADR-0042 replaced the conflicts-impossible posture at every merge point with the
// test-gated merge policy: a textual conflict is resolved only with a resolution
// serving both sides' stated intents, proven by the merged suite going green;
// otherwise it's a semantic conflict, blocked with the conflicting paths named. This
// pins that no loop surface still reads as promising conflict-free merges, and that
// the surfaces naming the posture (agents/build.md, agents/validate.md,
// workflows/execution-pipeline.js) actually carry it — straight off their source
// text, the same way execution-pipeline-meta.test.js pins the workflow's own meta
// declaration.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (rel) => readFileSync(rel, 'utf8');

const RETIRED_PROMISES = [
  /clean merge is expected/i,
  /a real conflict means the plan is wrong/i,
  /a merge conflict is a real finding/i,
  /clean by construction/i,
  /footprint-disjoint by plan-check construction/i,
];

test('no loop surface still promises a conflict-free merge', () => {
  for (const rel of ['plugin/agents/build.md', 'plugin/agents/validate.md', 'plugin/workflows/execution-pipeline.js']) {
    const text = read(rel);
    for (const pattern of RETIRED_PROMISES) {
      assert.ok(!pattern.test(text), `${rel} still matches the retired promise ${pattern}`);
    }
  }
});

test('the build agent resolves its sibling-branch merge under the test-gated merge policy, proven by the suite going green, else blocked naming the paths', () => {
  const text = read('plugin/agents/build.md');
  assert.ok(text.includes('resolve only when you can state both'));
  assert.ok(text.includes('sides\' intents and write a resolution that serves both'));
  assert.ok(text.includes('The resolution counts only if the suite goes'));
  assert.ok(text.includes('return blocked, kind `feature`, naming the conflicting paths'));
});

test('the validate agent carries the test-gated merge policy at both the integration merge and the publish-rebase retry', () => {
  const text = read('plugin/agents/validate.md');
  assert.ok(text.includes('Merge the\nlisted branches in order, apply the test-gated merge policy to any textual conflict'));
  assert.ok(text.includes('both branches\' tests must ride the merged tree'));
  const rebaseLine = text.split('\n').find((l) => l.includes('rebase onto its new tip'));
  assert.ok(rebaseLine && rebaseLine.includes('test-gated merge policy'), 'the publish-rebase retry line must carry the same posture');
});

test('the scheduler stops promising the sibling merge is clean by construction', () => {
  const text = read('plugin/workflows/execution-pipeline.js');
  assert.ok(text.includes('test-gated merge policy'));
  assert.ok(text.includes('disjointness is the plan\'s bias, not law'));
});
