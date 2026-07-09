// The artifact spine's public surface: schemas, the parse/render round-trip, and the
// execution-context assembler's pure core. See docs/architecture.md.
export { parseExecutor, parseExecutors, validateBindings } from './executor-registry.js';
export { ID_PATTERN, STATUS, validate } from './feature-schema.js';
export { parse } from './parse-feature-graph.js';
// The plan artifact — per-feature task contracts, the Plan → Build handoff.
export { JUDGMENT_LEVELS, parsePlan, planPath, resolveTask, TASK_SIZES, validatePlan } from './plan.js';
// The execution-context assembler's pure core — scope gates, git-derived task state,
// execution-context shape.
export { assembleExecutionContext, builtTaskIds, checkScope, featureBranch, taskBranch, taskCommitPrefix } from './prepare-execution-context.js';
// /begin's orientation core.
export { detectState, eligibleSet, machineOrientation, propose } from './propose-next-action.js';
export { findBlocks, replaceBlock, sectionAfter, yamlBlockAfter } from './replace-fenced-block.js';
// The model-binding resolver — role → model/effort/executor merge across defaults <
// project < local layers, with provenance.
export { bindingFor, EFFORTS, resolveModels } from './resolve-model-bindings.js';
// The run-presentation splice — scope-derived description shaping + the meta-line splice.
export { describeRun, spliceRunDescription } from './splice-workflow-description.js';
// The status story, rendered on demand — never written to disk.
export { renderStatusSummary } from './status-summary.js';
export { render } from './write-feature-graph.js';
