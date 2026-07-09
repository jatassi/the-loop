import { replaceBlock } from './replace-fenced-block.js';

// Stringify options pinned to the design doc's house style so that re-rendering an
// unchanged model reproduces the source byte-for-byte (no cosmetic git churn):
//   flowCollectionPadding:false → `[a, b]`, not `[ a, b ]`
//   lineWidth:0                 → never fold long titles / acceptance strings
const STRINGIFY = { flowCollectionPadding: false, lineWidth: 0 };

/**
 * Render a model back into its hybrid doc. Block-scoped and surgical: only the
 * machine-parseable YAML blocks are rewritten — from their retained yaml Documents,
 * so comments and key order survive — and every byte of narrative outside them is
 * preserved. render(text, parse(text)) is the identity. Works on any model whose
 * `_blocks` values are `{doc, span}` (the design doc and the plan artifact alike).
 *
 * @param {string} originalText
 * @param {{_blocks: Object}} model
 * @returns {string}
 */
export function render(originalText, model) {
  const blocks = (model && model._blocks) || {};
  const entries = Object.values(blocks).filter(Boolean);
  // Splice the later span first so earlier offsets stay valid after a length change.
  entries.sort((a, b) => b.span.innerStart - a.span.innerStart);

  let text = originalText;
  for (const { doc, span } of entries) {
    const rendered = doc.toString(STRINGIFY).replace(/\n$/, '');
    text = replaceBlock(text, span, rendered);
  }
  return text;
}
