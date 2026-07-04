// appendNote — the one sanctioned way to append a design-time note to a feature node
// (mirrors setStatus, ADR-0006): every mutation goes parse → mutate the retained
// document → render, never string surgery.

/**
 * Append text to a feature node's notes array, in both the JS model and the
 * retained YAML document, so render() persists only that feature's notes.
 * Creates the notes key when absent. An unknown feature id or empty text is
 * refused, leaving the model untouched.
 * @param {import('./parse.js').DesignModel} model
 * @param {string} featureId
 * @param {string} text
 */
export function appendNote(model, featureId, text) {
  const idx = (model.features || []).findIndex((f) => f.id === featureId);
  if (idx === -1) { throw new Error(`unknown feature id: ${featureId}`); }
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error(`note text must be a non-empty string (got ${JSON.stringify(text)})`);
  }
  if (!model._blocks || !model._blocks.featureGraph) {
    throw new Error('model has no feature graph block to mutate');
  }
  const notes = [...(model.features[idx].notes || []), text];
  model.features[idx].notes = notes;
  model._blocks.featureGraph.doc.setIn(['features', idx, 'notes'], notes);
}
