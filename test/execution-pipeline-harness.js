// Executes a workflow script file the way a Claude Code Workflow would, but with stub
// harness globals in place of the real ones — agent/parallel/pipeline/log/args/budget —
// so execution-pipeline.js and its siblings are proven against the authored script itself,
// never a copy of it. No build step: the shipped script is the tested script. This
// module defines no test() cases itself, so bare `node --test` discovery finding it
// (it lives under test/) is a no-op pass.

import { readFileSync } from 'node:fs';

// A workflow script's only export is this single line: neutralized to a plain const so
// the rest of the file runs as an ordinary async-function body, where its top-level
// `return` — invalid at module scope — becomes the function's own return.
const META_LINE = /^(\s*)export const meta\b/m;

const parallel = () => {
  throw new Error('parallel() is not used by these workflow scripts');
};
const pipeline = () => {
  throw new Error('pipeline() is not used by these workflow scripts');
};

/**
 * @typedef {Object} ScriptedReply
 * @property {*} [returns]  the value agent() resolves to
 * @property {Error} [throws]  an error for agent() to reject with instead
 */

/**
 * Run a workflow script file under stub harness globals. Every call builds fresh
 * closures for the `agent`/`log` stubs and their recordings, so repeat runs of the same
 * file, scripted differently, never share state.
 *
 * `agentReplies` is either an array replayed in call order (fine for serial scripts),
 * or a function `(prompt, opts, index) => ScriptedReply` — the concurrency-safe form:
 * the v2 engine spawns in parallel, so tests key replies off `opts.label` instead of
 * depending on a call sequence.
 * @param {string} scriptPath
 * @param {{agentReplies?: ScriptedReply[]|((prompt: *, opts: *, index: number) => ScriptedReply), args?: *, budget?: *}} [options]
 * @returns {Promise<{result: *, spawns: Array<{prompt: *, opts: *}>, logs: string[]}>}
 */
export async function runWorkflowScript(scriptPath, options = {}) {
  const { agentReplies = [], args = {}, budget = {} } = options;
  const spawns = [];
  const logs = [];
  const replyFor = typeof agentReplies === 'function'
    ? agentReplies
    : (_prompt, _opts, index) => agentReplies[index];

  let next = 0;
  const agent = async (prompt, opts) => {
    const index = next;
    next += 1;
    spawns.push({ prompt, opts });
    const scripted = replyFor(prompt, opts, index);
    if (scripted?.throws) { throw scripted.throws; }
    return scripted ? scripted.returns : null;
  };
  const log = (...parts) => { logs.push(parts.join(' ')); };

  const body = readFileSync(scriptPath, 'utf8').replace(META_LINE, '$1const meta');
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const run = new AsyncFunction('agent', 'parallel', 'pipeline', 'log', 'args', 'budget', body);

  const result = await run(agent, parallel, pipeline, log, args, budget);
  return { result, spawns, logs };
}

/**
 * Reply router keyed by `agentType:label` (run-presentation: labels dropped their
 * agentType prefix, so a bare label alone no longer disambiguates plan from
 * validate on the same feature — the composite key is unique again):
 * `byLabel({'plan:alpha': {returns: …}, …})`. A spawn whose composite key has no
 * scripted reply resolves to null, which the engine records as a stall — tests
 * assert that explicitly when they mean it.
 * @param {Object<string, ScriptedReply>} table
 */
export function byLabel(table) {
  return (_prompt, opts) => table[`${opts.agentType}:${opts.label}`];
}
