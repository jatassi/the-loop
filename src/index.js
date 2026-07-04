// The artifact spine's public surface: schemas, the parse/render round-trip, and the
// launch assembler's pure core. See docs/design/design.md.
export { findBlocks, replaceBlock, sectionAfter, yamlBlockAfter } from './blocks.js';
export { parse } from './parse.js';
export { render } from './render.js';
export { ID_PATTERN, STATUS, validate } from './schema.js';
// /the-loop's orientation core.
export { detectState, frontier, orient, propose } from './entry.js';
// The plan artifact — per-feature task contracts, the Plan → Build handoff.
export { parsePlan, planPath, resolveTask, TASK_SIZES, TASK_TIERS, validatePlan } from './plan.js';
// The launch assembler's pure core — scope gates, git-derived task state, snapshot shape.
export { assembleSnapshot, builtTaskIds, checkScope, featureBranch, taskBranch, taskCommitPrefix } from './launch.js';
// The status story, rendered on demand — never written to disk.
export { renderLedger } from './ledger.js';
// The model-binding resolver — role → model/effort/via merge across defaults <
// project < local layers, with provenance.
export { bindingFor, EFFORTS, resolveModels } from './models.js';
// Executor playbooks — parsing and binding-validation.
export { parseExecutor, parseExecutors, validateBindings } from './executors.js';
