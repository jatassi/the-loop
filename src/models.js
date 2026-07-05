// The model-binding resolver core: merges the shipped defaults table with project and
// local settings overrides, whole-entry replacement per role, stamping per-role
// provenance. Pure — no filesystem, no process, no clock
// (the pure-core/thin-CLI discipline). See docs/design/design.md
// (feature: model-selection) and config/model-bindings.json.

/** The effort enum a binding's `effort` field may take (absent inherits session effort). */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

// Layers in merge order, paired with the provenance stamp a role bound there gets.
const LAYERS = [
  ['defaults', 'default'],
  ['project', 'project'],
  ['local', 'local'],
];

/**
 * @typedef {Object} Binding
 * @property {string} model    a Claude alias, a full model id, or the literal "session"
 * @property {string} [effort] one of EFFORTS
 * @property {string} [via]    "agent" (default) or a registered executor id
 */

/**
 * Merge three binding layers into the resolved table
 * `{ <role>: Binding & { provenance } }`, defaults < project < local, whole-entry
 * replacement per role (a role bound in a higher layer replaces the entire entry, no
 * field-level merge). Throws on a malformed entry — non-object, missing or non-string
 * `model`, out-of-enum `effort` — naming the role and the layer it came from.
 * @param {{defaults?: Object<string, Binding>, project?: Object<string, Binding>, local?: Object<string, Binding>}} layers
 * @returns {Object<string, Binding & {provenance: 'default'|'project'|'local'}>}
 */
export function resolveModels({ defaults = {}, project = {}, local = {} } = {}) {
  const sources = { defaults, project, local };
  const table = {};
  for (const [key, provenance] of LAYERS) {
    const layer = sources[key];
    for (const [role, entry] of Object.entries(layer)) {
      validateEntry(entry, role, provenance);
      table[role] = { ...entry, provenance };
    }
  }
  return table;
}

/**
 * Look up a role's bound entry, or the session fallback
 * (`{ model: "session", provenance: "fallback" }`) when the role isn't bound in any
 * layer — the resolver expresses the fallback; consumers make it visible.
 * @param {Object<string, Binding & {provenance: string}>} table  a resolved table from resolveModels
 * @param {string} role
 * @returns {Binding & {provenance: string}}
 */
export function bindingFor(table, role) {
  return table[role] || { model: 'session', provenance: 'fallback' };
}

function validateEntry(entry, role, layer) {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new Error(`role "${role}" in the ${layer} layer must be an object binding (got ${JSON.stringify(entry)})`);
  }
  if (typeof entry.model !== 'string') {
    throw new TypeError(`role "${role}" in the ${layer} layer is missing a string "model" (got ${JSON.stringify(entry.model)})`);
  }
  if (entry.effort !== undefined && !EFFORTS.includes(entry.effort)) {
    throw new Error(`role "${role}" in the ${layer} layer has an out-of-enum effort (got ${JSON.stringify(entry.effort)}); must be one of ${EFFORTS.join('|')}`);
  }
}
