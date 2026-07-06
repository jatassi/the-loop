// The run-presentation splice's pure core: derives a scope-and-target description for
// one run, and splices it into the canonical workflow script's `meta` literal — the
// harness reads a workflow's description only from that literal (no `args`
// interpolation), so a per-run description requires a per-run script copy whose meta
// line is rewritten before launch. The bin edge (bin/cli-commands.js) does the file
// I/O; everything here is a pure function over strings.

// The meta declaration must sit on one physical line (workflow-phase-grouping: the
// eslint preprocessor and the test shim's regex both pin it there) — this mirrors the
// same pattern test/execution-pipeline-meta.test.js uses to extract it.
const META_LINE = /^export const meta\b.*;$/m;
// A single-quoted JS string literal, handling backslash-escaped characters (including
// an escaped quote) the way the language itself does.
const DESCRIPTION_VALUE = /description: '(?:[^'\\]|\\.)*'/;

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
