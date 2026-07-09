// Locate and surgically replace the machine-parseable ```yaml blocks inside a
// hybrid Markdown artifact — without touching any surrounding narrative.
// Dependency-free on purpose: this layer only finds fenced blocks by their section
// heading; parsing the YAML *content* is parse-feature-graph.js's job.

/**
 * @typedef {Object} Span
 * @property {string} inner      the block's inner text (between the fences, no trailing newline)
 * @property {number} innerStart character offset where inner begins
 * @property {number} innerEnd   character offset where inner ends (the newline before the closing fence)
 */

const HEADINGS = {
  featureGraph: '## Feature graph',
};

function escapeRe(s) {
  return s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Find the first ```yaml fenced block after a line-anchored heading.
 * @returns {Span|null}
 */
export function yamlBlockAfter(text, heading) {
  const head = new RegExp(String.raw`^${escapeRe(heading)}\s*$`, 'm').exec(text);
  if (!head) {return null;}
  const fence = /```ya?ml[^\n]*\n/g;
  fence.lastIndex = head.index + head[0].length;
  const open = fence.exec(text);
  if (!open) {return null;}
  const innerStart = open.index + open[0].length;
  const close = text.indexOf('\n```', innerStart);
  if (close === -1) {return null;}
  return { inner: text.slice(innerStart, close), innerStart, innerEnd: close };
}

/**
 * @param {string} text
 * @returns {{featureGraph: Span|null}}
 */
export function findBlocks(text) {
  return {
    featureGraph: yamlBlockAfter(text, HEADINGS.featureGraph),
  };
}

/**
 * Extract the prose under a line-anchored "## Heading" until the next "## " heading
 * (or end of text), heading line excluded, outer blank lines trimmed. The
 * execution-context assembler uses this to excerpt architecture.md's recorded
 * bindings (validation procedure, release runbook) verbatim — prose stays prose;
 * nothing here parses it.
 * @param {string} text
 * @param {string} heading  e.g. "## Validation procedure"
 * @returns {string|null}   null when the heading is absent
 */
export function sectionAfter(text, heading) {
  const head = new RegExp(String.raw`^${escapeRe(heading)}\s*$`, 'm').exec(text);
  if (!head) {return null;}
  const bodyStart = head.index + head[0].length;
  const next = /^## /m.exec(text.slice(bodyStart));
  const end = next ? bodyStart + next.index : text.length;
  return text.slice(bodyStart, end).replaceAll(/^\n+|\n+$/g, '');
}

/**
 * Splice newInner into a span; every byte outside [innerStart, innerEnd) is preserved.
 * @param {string} text
 * @param {Span} span
 * @param {string} newInner
 * @returns {string}
 */
export function replaceBlock(text, span, newInner) {
  return text.slice(0, span.innerStart) + newInner + text.slice(span.innerEnd);
}
