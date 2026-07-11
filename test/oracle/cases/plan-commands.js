// Parity-oracle corpus: the plan subcommands (plan parse / plan check / plan task).
// Each dual-format case selects its fixture half by target — yamlRepo for the JS
// CLI (plan.md, 1-based covers), jsonRepo for the Rust binary (plan.json, 0-based
// covers) — so both binaries read their own format of the same shared definition.

import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { ALPHA, pairSetup, REFUSE } from '../case-setup.js';
import { EXAMPLE_DEFINITION, renderPlanJson, renderPlanMd } from '../fixtures.js';

const onAlpha = pairSetup(EXAMPLE_DEFINITION, ALPHA);

/** Alpha task contract — JS plan.md covers are 1-based; Rust plan.json covers are 0-based. */
const alphaTask = (target) => ({
  id: 'alpha-core', title: 'Implement alpha core',
  covers: target === 'rust' ? [0, 1] : [1, 2],
  acceptance: 'alpha core satisfies both feature criteria',
  footprint: ['src/alpha.js', 'test/alpha.test.js'],
  size: 's', depends_on: [], judgment_level: 'standard',
  wiring: 'foundational module the rest of the feature hangs on',
});

/** The valid fixture task (0-based covers definition) the defective plans start from. */
const VALID_TASK = EXAMPLE_DEFINITION.plans.alpha.tasks[0];

const defectivePlanPath = (target) => (target === 'rust'
  ? 'docs/plans/alpha/defect.json'
  : 'docs/plans/alpha/defect.md');

/**
 * Setup: the alpha fixture pair plus one defective plan written in the target's own
 * format at defectivePlanPath(target); pair with a target-aware argv naming it.
 * @param {{ design_version: number, tasks: object[] }} plan  0-based covers definition
 */
function withDefectivePlan(plan) {
  return ({ target }) => {
    const ctx = onAlpha({ target });
    writeFileSync(
      path.join(ctx.cwd, defectivePlanPath(target)),
      target === 'rust' ? renderPlanJson('alpha', plan) : renderPlanMd('alpha', plan),
    );
    return ctx;
  };
}

// Alpha has exactly two acceptance criteria, so 0-based index 2 (emitted as 3 for
// the JS 1-based half) is out of range on both targets.
const BAD_COVERS = { design_version: 1, tasks: [{ ...VALID_TASK, covers: [0, 2] }] };

const BAD_JUDGMENT = { design_version: 1, tasks: [{ ...VALID_TASK, judgment_level: 'urgent' }] };

const CYCLE = {
  design_version: 1,
  tasks: [
    { ...VALID_TASK, id: 'alpha-a', covers: [0], depends_on: ['alpha-b'] },
    { ...VALID_TASK, id: 'alpha-b', covers: [1], depends_on: ['alpha-a'] },
  ],
};

export const cases = [
  {
    command: 'plan parse',
    scenario: 'happy path',
    argv: ['plan', 'parse', 'alpha'],
    setup: onAlpha,
    expect: ({ target }) => ({
      exitCode: 0,
      stdout: { feature: 'alpha', designVersion: 1, tasks: [alphaTask(target)] },
    }),
  },
  {
    command: 'plan parse',
    scenario: 'refusal: missing plan file',
    argv: ['plan', 'parse', 'ghost'],
    setup: onAlpha,
    expect: REFUSE,
  },
  {
    command: 'plan check',
    scenario: 'happy path OK',
    argv: ['plan', 'check', 'alpha'],
    setup: onAlpha,
    expect: { exitCode: 0, stdoutMatch: /^OK\s+plan alpha: 1 task\(s\)/ },
  },
  {
    command: 'plan check',
    scenario: 'refusal: feature-id mismatch FAIL',
    argv: ({ target }) => [
      'plan', 'check', 'beta',
      target === 'rust' ? 'docs/plans/alpha/plan.json' : 'docs/plans/alpha/plan.md',
    ],
    setup: onAlpha,
    expect: { exitCode: 1, stdoutMatch: /FAIL plan beta: 1 task\(s\)/ },
  },
  {
    command: 'plan check',
    scenario: 'refusal: covers index out of range FAIL',
    argv: ({ target }) => ['plan', 'check', 'alpha', defectivePlanPath(target)],
    setup: withDefectivePlan(BAD_COVERS),
    expect: { exitCode: 1, stdoutMatch: /FAIL plan alpha: 1 task\(s\)/ },
  },
  {
    command: 'plan check',
    scenario: 'refusal: bad judgment level FAIL',
    argv: ({ target }) => ['plan', 'check', 'alpha', defectivePlanPath(target)],
    setup: withDefectivePlan(BAD_JUDGMENT),
    expect: { exitCode: 1, stdoutMatch: /FAIL plan alpha: 1 task\(s\)/ },
  },
  {
    command: 'plan check',
    scenario: 'refusal: task dependency cycle FAIL',
    argv: ({ target }) => ['plan', 'check', 'alpha', defectivePlanPath(target)],
    setup: withDefectivePlan(CYCLE),
    expect: { exitCode: 1, stdoutMatch: /FAIL plan alpha: 2 task\(s\)/ },
  },
  {
    command: 'plan task',
    scenario: 'happy path',
    argv: ['plan', 'task', 'alpha', 'alpha-core'],
    setup: onAlpha,
    expect: ({ target }) => ({
      exitCode: 0,
      stdout: {
        feature: 'alpha',
        design_version: 1,
        task: alphaTask(target),
        covers_criteria: ['alpha criterion one', 'alpha criterion two'],
      },
    }),
  },
  {
    command: 'plan task',
    scenario: 'refusal: unknown task id',
    argv: ['plan', 'task', 'alpha', 'no-such-task'],
    setup: onAlpha,
    expect: REFUSE,
  },
];
