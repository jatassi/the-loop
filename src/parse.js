import YAML from 'yaml';
import { findBlocks } from './blocks.js';

/** @typedef {import('./blocks.js').Span} Span */

/**
 * @typedef {Object} FeatureNode
 * @property {string} id
 * @property {string} title
 * @property {string} status
 * @property {string[]} depends_on    feature ids (graph edges)
 * @property {string[]} interfaces    contract ids it owns/touches
 * @property {string|string[]} acceptance
 * @property {number} [design_version] node-level drift stamp; absent → inherits the doc default
 */

/**
 * @typedef {Object} Contract
 * @property {string} id    the addressable handle (the only machine-parsed field)
 * @property {string} body  verbatim shape sketch (prose, not parsed further)
 */

/**
 * @typedef {Object} DesignModel
 * @property {number} designVersion
 * @property {FeatureNode[]} features
 * @property {Contract[]} contracts
 * @property {{featureGraph: ({doc: YAML.Document, span: Span}|null), contracts: ({doc: YAML.Document, span: Span}|null)}} _blocks
 *           retained yaml Documents + spans — render()'s substrate; not for consumers
 */

/**
 * Parse a hybrid design doc into a structural model. Lenient: never throws on a doc
 * whose YAML is well-formed (a missing block yields empty arrays). Semantic problems
 * — bad status, dangling edges, cycles — are validate()'s job, not parse()'s.
 * @param {string} text
 * @returns {DesignModel}
 */
export function parse(text) {
  const blocks = findBlocks(text);

  const graphDoc = blocks.featureGraph ? YAML.parseDocument(blocks.featureGraph.inner) : null;
  const graph = (graphDoc && graphDoc.toJS()) || {};
  const features = (graph.features || []).map(normalizeFeature);

  const contractsDoc = blocks.contracts ? YAML.parseDocument(blocks.contracts.inner) : null;
  const contractsJs = (contractsDoc && contractsDoc.toJS()) || {};
  const contracts = (contractsJs.contracts || []).map((c) => ({ id: c.id, body: c.body }));

  return {
    designVersion: graph.design_version,
    features,
    contracts,
    _blocks: {
      featureGraph: blocks.featureGraph ? { doc: graphDoc, span: blocks.featureGraph } : null,
      contracts: blocks.contracts ? { doc: contractsDoc, span: blocks.contracts } : null,
    },
  };
}

// POJO view normalization (ergonomics only). Default the edge arrays so consumers
// never branch on absent vs empty. We do NOT inject a design_version a node lacks —
// keeping the view faithful to the doc; the doc-level default is applied on read.
function normalizeFeature(f) {
  return {
    id: f.id,
    title: f.title,
    status: f.status,
    depends_on: f.depends_on || [],
    interfaces: f.interfaces || [],
    acceptance: f.acceptance,
    ...(f.design_version != null ? { design_version: f.design_version } : {}),
  };
}
