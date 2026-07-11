// Oracle corpus: the plan subcommands (plan parse / plan check / plan task) against
// plan.json fixtures (0-based covers — the only era since json-cutover).

import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { ALPHA, REFUSE, repoSetup } from '../case-setup.js';
import { EXAMPLE_DEFINITION, renderPlanJson } from '../fixtures.js';

const onAlpha = repoSetup(EXAMPLE_DEFINITION, ALPHA);

const ALPHA_TASK = {
  id: 'alpha-core', title: 'Implement alpha core',
  covers: [0, 1],
  acceptance: 'alpha core satisfies both feature criteria',
  footprint: ['src/alpha.js', 'test/alpha.test.js'],
  size: 's', depends_on: [], judgment_level: 'standard',
  wiring: 'foundational module the rest of the feature hangs on',
};

/** The valid fixture task (0-based covers definition) the defective plans start from. */
const VALID_TASK = EXAMPLE_DEFINITION.plans.alpha.tasks[0];

const DEFECT_PLAN_PATH = 'docs/plans/alpha/defect.json';

/**
 * Setup: the alpha fixture repo plus one defective plan at DEFECT_PLAN_PATH; pair
 * with an argv naming it.
 * @param {{ design_version: number, tasks: object[] }} plan  0-based covers definition
 */
function withDefectivePlan(plan) {
  return () => {
    const ctx = onAlpha();
    writeFileSync(path.join(ctx.cwd, DEFECT_PLAN_PATH), renderPlanJson('alpha', plan));
    return ctx;
  };
}

// Alpha has exactly two acceptance criteria, so index 2 is out of range.
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
    expect: {
      exitCode: 0,
      stdout: { feature: 'alpha', designVersion: 1, tasks: [ALPHA_TASK] },
    },
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
    argv: ['plan', 'check', 'beta', 'docs/plans/alpha/plan.json'],
    setup: onAlpha,
    expect: { exitCode: 1, stdoutMatch: /FAIL plan beta: 1 task\(s\)/ },
  },
  {
    command: 'plan check',
    scenario: 'refusal: covers index out of range FAIL',
    argv: ['plan', 'check', 'alpha', DEFECT_PLAN_PATH],
    setup: withDefectivePlan(BAD_COVERS),
    expect: { exitCode: 1, stdoutMatch: /FAIL plan alpha: 1 task\(s\)/ },
  },
  {
    command: 'plan check',
    scenario: 'refusal: bad judgment level FAIL',
    argv: ['plan', 'check', 'alpha', DEFECT_PLAN_PATH],
    setup: withDefectivePlan(BAD_JUDGMENT),
    expect: { exitCode: 1, stdoutMatch: /FAIL plan alpha: 1 task\(s\)/ },
  },
  {
    command: 'plan check',
    scenario: 'refusal: task dependency cycle FAIL',
    argv: ['plan', 'check', 'alpha', DEFECT_PLAN_PATH],
    setup: withDefectivePlan(CYCLE),
    expect: { exitCode: 1, stdoutMatch: /FAIL plan alpha: 2 task\(s\)/ },
  },
  {
    command: 'plan task',
    scenario: 'happy path',
    argv: ['plan', 'task', 'alpha', 'alpha-core'],
    setup: onAlpha,
    expect: {
      exitCode: 0,
      stdout: {
        feature: 'alpha',
        design_version: 1,
        task: ALPHA_TASK,
        covers_criteria: ['alpha criterion one', 'alpha criterion two'],
      },
    },
  },
  {
    command: 'plan task',
    scenario: 'refusal: unknown task id',
    argv: ['plan', 'task', 'alpha', 'no-such-task'],
    setup: onAlpha,
    expect: REFUSE,
  },
];
