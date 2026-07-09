// setStatus — the one sanctioned way to flip a feature's status (ADR-0006): every
// mutation goes parse → mutate the retained document → render, never string surgery.

import { STATUS } from './feature-schema.js';

/**
 * Flip a single feature's status, in both the JS model and the retained YAML
 * document, so render() persists only that feature's status line. An unknown
 * feature id or a status outside the feature-node enum is refused, leaving the
 * model untouched.
 * @param {import('./parse-feature-graph.js').DesignModel} model
 * @param {string} featureId
 * @param {string} status
 */
export function setStatus(model, featureId, status) {
  const idx = (model.features || []).findIndex((f) => f.id === featureId);
  if (idx === -1) { throw new Error(`unknown feature id: ${featureId}`); }
  if (!STATUS.includes(status)) {
    throw new Error(`status must be one of ${STATUS.join('|')} (got ${JSON.stringify(status)})`);
  }
  if (!model._blocks || !model._blocks.featureGraph) {
    throw new Error('model has no feature graph block to mutate');
  }
  model.features[idx].status = status;
  model._blocks.featureGraph.doc.setIn(['features', idx, 'status'], status);
}
