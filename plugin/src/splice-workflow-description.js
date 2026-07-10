// The run-presentation splice's pure core: derives a scope-and-target description for
// one run, and splices both that description into the canonical workflow script's
// `meta` literal and the assembled execution context into the `EMBEDDED_CONTEXT`
// target — the harness reads a workflow's description only from the meta literal
// (no `args` interpolation), and the execution context rides the filesystem via
// the embedded literal rather than the lossy Workflow `args` channel. A per-run
// script copy is rewritten before launch. The bin edge (bin/cli-commands.js) does
// the file I/O; everything here is a pure function over strings.

// The meta declaration must sit on one physical line (workflow-phase-grouping: the
// eslint preprocessor and the test shim's regex both pin it there) — this mirrors the
// same pattern test/execution-pipeline-meta.test.js uses to extract it.
const META_LINE = /^export const meta\b.*;$/m;
// A single-quoted JS string literal, handling backslash-escaped characters (including
// an escaped quote) the way the language itself does.
const DESCRIPTION_VALUE = /description: '(?:[^'\\]|\\.)*'/;
// The embedded-context target must sit on one physical line as `const EMBEDDED_CONTEXT
// = null;` (trailing comment optional) — prepare-execution-context --script-out
// rewrites `null` to a JSON literal of the assembled context.
const EMBEDDED_CONTEXT_LINE = /^const EMBEDDED_CONTEXT = null;(?:\s*\/\/.*)?$/m;

/**
 * The scope-derived description: every in-scope feature id in scope order, past 5 ids
 * collapsed to the first 5 plus a `+<k> more` count, then the target branch.
 * @param {string[]} scope
 * @param {string} target
 * @returns {string}
 */
export function describeRun(scope, target) {
  const ids = scope.length > 5 ? [...scope.slice(0, 5), `+${scope.length - 5} more`] : scope;
  return `${ids.join(', ')} → ${target}`;
}

/**
 * Splice `description` into the canonical script's one-line `meta` declaration,
 * JSON-stringified so an arbitrary target-branch value (unlike feature ids, not
 * schema-pinned) can never break out of the literal. Refuses — throws, nothing
 * returned — when the script's meta line isn't found or doesn't carry the expected
 * `description: '…'` shape; never hands back an unspliced copy.
 * @param {string} scriptText  the canonical workflow script's full source text
 * @param {string} description  the value to splice in (already shaped by describeRun)
 * @returns {string} the script text with the description literal replaced
 */
export function spliceRunDescription(scriptText, description) {
  const metaMatch = scriptText.match(META_LINE);
  if (!metaMatch || !DESCRIPTION_VALUE.test(metaMatch[0])) {
    throw new Error("canonical workflow script's meta line does not carry the expected description: '…' shape — refusing to splice");
  }
  // A function replacer (never the raw string) so a `$`-bearing description — JSON.stringify
  // never escapes `$` — can't be misread as a $&/$1-style replacement pattern.
  const splicedLine = metaMatch[0].replace(DESCRIPTION_VALUE, () => `description: ${JSON.stringify(description)}`);
  return scriptText.slice(0, metaMatch.index) + splicedLine + scriptText.slice(metaMatch.index + metaMatch[0].length);
}

/**
 * Splice `executionContext` into the canonical script's one-line `EMBEDDED_CONTEXT`
 * declaration as a JSON literal, so the spliced script is self-contained and the
 * Workflow launch needs no `args`. Refuses — throws, nothing returned — when the
 * script does not carry the expected `const EMBEDDED_CONTEXT = null;` shape; never
 * hands back an unspliced copy.
 * @param {string} scriptText  the canonical workflow script's full source text
 * @param {Object} executionContext  the assembled execution context object
 * @returns {string} the script text with the embedded-context literal replaced
 */
export function spliceEmbeddedContext(scriptText, executionContext) {
  const match = scriptText.match(EMBEDDED_CONTEXT_LINE);
  if (!match) {
    throw new Error("canonical workflow script does not carry the expected EMBEDDED_CONTEXT = null shape — refusing to splice");
  }
  const splicedLine = `const EMBEDDED_CONTEXT = ${JSON.stringify(executionContext)};`;
  return scriptText.slice(0, match.index) + splicedLine + scriptText.slice(match.index + match[0].length);
}
