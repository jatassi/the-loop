import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

/**
 * Resolve a feature id against an in-memory model → the node + the interface contracts
 * it references. The pure id→slice lookup; knows nothing about files or layout.
 * @param {import('./parse.js').DesignModel} model
 * @param {string} id
 * @returns {{node: import('./parse.js').FeatureNode, contracts: import('./parse.js').Contract[]}}
 */
export function resolveIn(model, id) {
  const node = (model.features || []).find((f) => f.id === id);
  if (!node) throw new Error(`unknown feature id: ${id}`);
  const byId = new Map((model.contracts || []).map((c) => [c.id, c]));
  const contracts = (node.interfaces || []).map((cid) => byId.get(cid)).filter(Boolean);
  return { node, contracts };
}

/**
 * The compact feature-graph index the session seeds the Workflow with (ADR-0004):
 * ids, status, edges, interface-ids, and acceptance summaries — never contract bodies.
 * Keeps the workflow's `args` small; agents demand-read full slices via resolve().
 * @param {import('./parse.js').DesignModel} model
 */
export function extractIndex(model) {
  return {
    designVersion: model.designVersion,
    features: (model.features || []).map((f) => ({
      id: f.id,
      status: f.status,
      depends_on: f.depends_on || [],
      interfaces: f.interfaces || [],
      acceptance: f.acceptance,
    })),
  };
}

/**
 * The one layout-aware layer (ADR-0004: logical id ⟂ physical layout). Consumers pass
 * an id, never a path, so the single→split layout move (ADR-0003) is invisible here:
 * v1 is single-file; a split `design/` tree would change only loadDesignText().
 * @param {string} id
 * @param {{root?: string}} [opts]
 * @returns {{node: import('./parse.js').FeatureNode, contracts: import('./parse.js').Contract[]}}
 */
export function resolve(id, { root = 'docs/design' } = {}) {
  return resolveIn(parse(loadDesignText(root)), id);
}

function loadDesignText(root) {
  return readFileSync(join(root, 'design.md'), 'utf8');
}
