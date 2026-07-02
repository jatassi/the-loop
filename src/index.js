// The artifact spine's public surface: schemas, the parse/render round-trip, and the
// injection resolver (address-by-id). See docs/design/design.md (feature: artifact-spine).
export { findBlocks, replaceBlock } from './blocks.js';
export { parse } from './parse.js';
export { render } from './render.js';
export { extractIndex,resolve, resolveIn } from './resolve.js';
export { STATUS,validate } from './schema.js';
// /the-loop's orientation core (feature: the-loop-entry).
export { detectState, frontier, orient,propose } from './entry.js';
// The plan artifact — per-feature task contracts, the Plan → Build handoff (feature: plan).
export { parsePlan, planPath, TASK_SIZES,TASK_STATUS, validatePlan } from './plan.js';
