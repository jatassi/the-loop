// Executor playbooks (config/executors/<id>.md): narrative operational lore around one
// fenced yaml machine block under the exact heading "## Machine block" — the same
// heading-then-fence pattern as the escalation record (replace-fenced-block.js). Pure
// — no filesystem, no process (the pure-core/thin-CLI discipline); plugin/bin/the-loop.js
// reads the files and passes text in. See docs/plans/executor-delegation/plan.md
// ("Pinned conventions") for the field spec this module is the authoritative
// implementation of. A playbook present in the registry directory is never leniently
// skipped: any defect is a hard error naming the file and the offending field.

import path from 'node:path';

import YAML from 'yaml';

import { yamlBlockAfter } from './replace-fenced-block.js';

const HEADING = '## Machine block';
const WORKTREE_MODES = ['native', 'driver-made'];
// The only roles whose spawn consults `executor`: the build tiers and, since the
// 2026-07-08 bakeoff (ADR-0047), validate. Off-rubric tiers are the routing-surface
// subset with no recorded eval evidence behind delegation — build.rote cleared the
// original ADR-0031 head-to-head, build.standard and validate cleared the eval/
// bakeoff rubric; build.complex has never been evaluated.
const ROUTING_SURFACE = new Set(['build.rote', 'build.standard', 'build.complex', 'validate']);
const OFF_RUBRIC_TIERS = new Set(['build.complex']);
// Held apart from the throw sites below as plain strings (not template literals):
// interpolating them keeps the literal {model}/{prompt}/{worktree}/{ref} placeholder
// text out of any template literal's own quasis, which is exactly what a forgotten
// "$" before "{" would look like.
const MODEL_PROMPT_HINT = 'both {model} and {prompt} placeholders';
const WORKTREE_REF_HINT = '{worktree} or {ref}';

/**
 * @typedef {Object} AuthSmoke
 * @property {string} run     the auth smoke-test command
 * @property {string} expect  substring the command's output must contain to count as authed
 */

/**
 * @typedef {Object} ExecutorRecord
 * @property {string} id             equals the playbook's filename stem
 * @property {string} command        the CLI binary
 * @property {string[]} models       executor model ids a binding may name
 * @property {string} worktree       native | driver-made
 * @property {string} invocation     template carrying {model}, {prompt}, and at
 *                                   least one of {worktree}/{ref}
 * @property {string} availability   a version-check command
 * @property {AuthSmoke} auth_smoke
 * @property {number} concurrency    positive integer
 * @property {string} [effort_flag]  an invocation fragment; absent means no effort knob
 */

function requireString(value, field, file) {
  if (typeof value !== 'string') {
    throw new TypeError(`${file}: "${field}" must be a string (got ${JSON.stringify(value)})`);
  }
}

function checkId(id, file, stem) {
  requireString(id, 'id', file);
  if (id !== stem) {
    throw new Error(`${file}: "id" must equal the filename stem "${stem}" (got ${JSON.stringify(id)})`);
  }
}

function checkModels(models, file) {
  const isValid = Array.isArray(models) && models.length > 0 && models.every((m) => typeof m === 'string');
  if (!isValid) {
    throw new Error(`${file}: "models" must be a non-empty string array (got ${JSON.stringify(models)})`);
  }
}

function checkWorktree(worktree, file) {
  if (!WORKTREE_MODES.includes(worktree)) {
    throw new Error(`${file}: "worktree" must be one of ${WORKTREE_MODES.join('|')} (got ${JSON.stringify(worktree)})`);
  }
}

function checkInvocation(invocation, file) {
  requireString(invocation, 'invocation', file);
  if (!invocation.includes('{model}') || !invocation.includes('{prompt}')) {
    throw new Error(`${file}: "invocation" must contain ${MODEL_PROMPT_HINT} (got ${JSON.stringify(invocation)})`);
  }
  if (!invocation.includes('{worktree}') && !invocation.includes('{ref}')) {
    throw new Error(`${file}: "invocation" must contain ${WORKTREE_REF_HINT} (got ${JSON.stringify(invocation)})`);
  }
}

function checkAuthSmoke(authSmoke, file) {
  const isValid = typeof authSmoke === 'object' && authSmoke !== null
    && typeof authSmoke.run === 'string' && typeof authSmoke.expect === 'string';
  if (!isValid) {
    throw new Error(`${file}: "auth_smoke" must be a { run, expect } map of strings (got ${JSON.stringify(authSmoke)})`);
  }
}

function checkConcurrency(concurrency, file) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error(`${file}: "concurrency" must be a positive integer (got ${JSON.stringify(concurrency)})`);
  }
}

function checkEffortFlag(effortFlag, file) {
  if (effortFlag !== undefined && typeof effortFlag !== 'string') {
    throw new Error(`${file}: "effort_flag" must be a string when present (got ${JSON.stringify(effortFlag)})`);
  }
}

/**
 * Parse one executor playbook's machine block.
 * @param {string} text  the playbook's full Markdown text
 * @param {string} file  path used in error messages and checked against "id"
 * @returns {ExecutorRecord}
 */
export function parseExecutor(text, file) {
  const span = yamlBlockAfter(text, HEADING);
  if (!span) {
    throw new Error(`${file}: no fenced yaml block found under "${HEADING}"`);
  }
  const js = YAML.parse(span.inner) || {};

  checkId(js.id, file, path.parse(file).name);
  requireString(js.command, 'command', file);
  checkModels(js.models, file);
  checkWorktree(js.worktree, file);
  checkInvocation(js.invocation, file);
  requireString(js.availability, 'availability', file);
  checkAuthSmoke(js.auth_smoke, file);
  checkConcurrency(js.concurrency, file);
  checkEffortFlag(js.effort_flag, file);

  return {
    id: js.id,
    command: js.command,
    models: js.models,
    worktree: js.worktree,
    invocation: js.invocation,
    availability: js.availability,
    auth_smoke: { run: js.auth_smoke.run, expect: js.auth_smoke.expect },
    concurrency: js.concurrency,
    ...(js.effort_flag !== undefined && { effort_flag: js.effort_flag }),
  };
}

/**
 * Parse many playbooks into the registry keyed by id.
 * @param {{file: string, text: string}[]} entries
 * @returns {Object<string, ExecutorRecord>}
 */
export function parseExecutors(entries) {
  const registry = {};
  const fileOf = {};
  for (const { file, text } of entries) {
    const record = parseExecutor(text, file);
    if (Object.hasOwn(registry, record.id)) {
      throw new Error(`duplicate executor id "${record.id}" in ${fileOf[record.id]} and ${file}`);
    }
    registry[record.id] = record;
    fileOf[record.id] = file;
  }
  return registry;
}

/**
 * @typedef {Object} Issue
 * @property {string} code
 * @property {string} message
 * @property {string} where  the role id the issue names
 */

/**
 * Validate a resolved model table's `executor` bindings against the executor
 * registry. An `executor` of "agent" or absent is the explicit default and is never
 * checked. Errors and warnings both accumulate across every role; this never throws.
 * @param {Object<string, import('./resolve-model-bindings.js').Binding & {provenance: string}>} table
 * @param {Object<string, ExecutorRecord>} registry
 * @returns {{errors: Issue[], warnings: Issue[]}}
 */
export function validateBindings(table, registry) {
  const errors = [];
  const warnings = [];

  for (const [role, binding] of Object.entries(table)) {
    const { executor } = binding;
    if (executor === undefined || executor === 'agent') {
      continue;
    }

    if (!ROUTING_SURFACE.has(role)) {
      warnings.push({
        code: 'no-routing-surface',
        message: `role "${role}" binds executor "${executor}" but sits outside the routing surface (build.rote, build.standard, build.complex, validate); executor is never consulted there`,
        where: role,
      });
    } else if (OFF_RUBRIC_TIERS.has(role)) {
      warnings.push({
        code: 'off-rubric-tier',
        message: `role "${role}" binds executor "${executor}" on a tier with no recorded eval evidence behind delegation; the workflow routes it anyway`,
        where: role,
      });
    }

    const executorRecord = registry[executor];
    if (!executorRecord) {
      errors.push({
        code: 'unregistered-executor',
        message: `role "${role}" binds executor "${executor}", which names no registered executor`,
        where: role,
      });
      continue;
    }

    if (!executorRecord.models.includes(binding.model)) {
      errors.push({
        code: 'model-outside-playbook',
        message: `role "${role}" binds model "${binding.model}" via executor "${executor}", outside that playbook's models list`,
        where: role,
      });
    }

    if (binding.effort !== undefined && executorRecord.effort_flag === undefined) {
      warnings.push({
        code: 'ignored-effort',
        message: `role "${role}" sets effort "${binding.effort}" on executor "${executor}", which carries no effort_flag; the effort is ignored`,
        where: role,
      });
    }
  }

  return { errors, warnings };
}
