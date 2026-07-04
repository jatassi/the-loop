import YAML from 'yaml';

import { findBlocks } from './blocks.js';

/** @typedef {import('./blocks.js').Span} Span */

/**
 * @typedef {Object} FeatureNode
 * @property {string} id
 * @property {string} title
 * @property {string} status
 * @property {string[]} depends_on    feature ids (graph edges)
 * @property {string|string[]} acceptance
 * @property {string[]} [notes]        design-time notes baked into the node; ride the launch snapshot
 */

/**
 * @typedef {Object} DesignModel
 * @property {number} designVersion
 * @property {FeatureNode[]} features
 * @property {{featureGraph: ({doc: YAML.Document, span: Span}|null)}} _blocks
 *           retained yaml Document + span — render()'s substrate; not for consumers
 */

/**
 * Parse the graph artifact (docs/design/graph.md) into a structural model. Lenient:
 * never throws on a doc whose YAML is well-formed (a missing block yields empty
 * arrays). Semantic problems — bad status, dangling edges, cycles — are validate()'s
 * job, not parse()'s.
 * @param {string} text
 * @returns {DesignModel}
 */
export function parse(text) {
  const blocks = findBlocks(text);
  const graph = parseBlock(blocks.featureGraph);

  return {
    designVersion: graph.js.design_version,
    features: (graph.js.features || []).map((f) => normalizeFeature(f)),
    _blocks: {
      featureGraph: blockRef(blocks.featureGraph, graph.doc),
    },
  };
}

// A block span → its retained YAML document + POJO view (absent block → empty view).
function parseBlock(span) {
  const doc = span ? YAML.parseDocument(span.inner) : null;
  return { doc, js: (doc && doc.toJS()) || {} };
}

const blockRef = (span, doc) => (span ? { doc, span } : null);

// POJO view normalization (ergonomics only). Default the edge array so consumers
// never branch on absent vs empty.
function normalizeFeature(f) {
  return {
    id: f.id,
    title: f.title,
    status: f.status,
    depends_on: f.depends_on || [],
    acceptance: f.acceptance,
    ...((f.notes != null) && { notes: f.notes }),
  };
}
