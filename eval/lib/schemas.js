// Return-shape contracts for models under evaluation — mirrors the schemas the
// production pipeline enforces (workflows/execution-pipeline.js) so eval results
// transfer to the real build/validate roles.
const strings = (...names) => Object.fromEntries(names.map((n) => [n, { type: 'string' }]));
const stringArray = { type: 'array', items: { type: 'string' } };

export const BUILD_SCHEMA = {
  type: 'object',
  properties: {
    result: { enum: ['built', 'blocked'] },
    ...strings('task', 'summary', 'kind', 'detail'),
    deviations: stringArray,
    options: stringArray,
  },
  required: ['result', 'task'],
};

export const VALIDATE_SCHEMA = {
  type: 'object',
  properties: {
    result: { enum: ['validated', 'fail', 'blocked'] },
    ...strings('feature', 'summary', 'kind', 'detail'),
    findings: stringArray,
    options: stringArray,
  },
  required: ['result', 'feature'],
};

export const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    preferred: { enum: ['A', 'B', 'tie'] },
    ...strings('rationale'),
  },
  required: ['preferred', 'rationale'],
};
