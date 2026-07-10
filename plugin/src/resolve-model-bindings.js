// Hook-family resolver core: merges shipped defaults with user, project, and local
// settings overrides across every settings-layer hook family, whole-entry replacement
// per key within a layer, stamping per-key provenance. Pure — no filesystem, no
// process, no clock (the pure-core/thin-CLI discipline). See docs/architecture.md
// (feature: model-selection / configure) and docs/designs/configure/design.md.

/** The effort enum a binding's `effort` field may take (absent inherits session effort). */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

/** Named configuration gap: a role binds both `agent` and `executor` (mutually exclusive). */
export const GAP_AGENT_AND_EXECUTOR = 'agent-and-executor';

// Layers in merge order, paired with the provenance stamp a key bound there gets.
// Order is defaults < user < project < local.
const LAYERS = [
  ['defaults', 'default'],
  ['user', 'user'],
  ['project', 'project'],
  ['local', 'local'],
];

/**
 * @typedef {Object} Binding
 * @property {string} model    a Claude alias, a full model id, or the literal "session"
 * @property {string} [effort] one of EFFORTS
 * @property {string} [executor] "agent" (default) or a registered executor id
 * @property {string} [agent]  a subagent type (harness registry resolves it; unbound → bundled)
 * @property {string} [gap]    a named configuration gap code when the entry is unusable as-is
 */

/**
 * A family's unbound behavior: exactly one of `fallback` or `block`.
 * - `fallback`: value returned when unbound in every layer (concrete object, or a
 *   marker string the CLI shell must resolve — e.g. `'detected-convention'`).
 * - `block`: when unbound, the consuming phase can't run; the resolver returns a
 *   named-gap shape rather than throwing.
 * @typedef {{ fallback: Object|string } | { block: true }} HookDeclaration
 */

/**
 * Settings-layer hook inventory: each family key under `"the-loop"` in settings,
 * plus a synthetic `exampleBlock` so the block-declaration path is real data (recorded
 * bindings elsewhere reuse this shape; they are not settings-layer families).
 * @type {Object<string, HookDeclaration>}
 */
export const HOOK_INVENTORY = {
  interview: { fallback: { skill: 'grilling' } },
  // Role-level session fallback lives in bindingFor; the family itself merges roles.
  modelBindings: { fallback: { model: 'session' } },
  testHarness: { fallback: 'detected-convention' },
  lint: { fallback: 'detected-convention' },
  precommit: { fallback: { system: 'none' } },
  notification: { fallback: { channel: 'chat' } },
  artifactStores: {
    fallback: {
      briefs: 'local',
      designs: 'local',
      features: 'local',
      runbooks: 'local',
      rcas: 'local',
      calibration: 'local',
    },
  },
  // Unbound → no provisioning on worktree-create (symlink retired; see ADR-0052).
  worktreeSetup: { fallback: { provisioning: 'none' } },
  // Synthetic: proves block handling; not a settings key consumers configure today.
  exampleBlock: { block: true },
};

/**
 * Merge binding layers into the resolved table
 * `{ <role>: Binding & { provenance } }`, defaults < user < project < local,
 * whole-entry replacement per role (a role bound in a higher layer replaces the entire
 * entry, no field-level merge). Throws on a malformed entry — non-object, missing or
 * non-string `model`, out-of-enum `effort`, non-string `agent` — naming the role and
 * the layer it came from. A role carrying both `agent` and `executor` is not thrown:
 * it is stamped with gap `agent-and-executor` so the resolved view still shows the
 * conflict. Omitting `user` (or passing `{}`) is byte-identical to the historical
 * three-layer merge.
 * @param {{defaults?: Object<string, Binding>, user?: Object<string, Binding>, project?: Object<string, Binding>, local?: Object<string, Binding>}} layers
 * @returns {Object<string, Binding & {provenance: 'default'|'user'|'project'|'local'}>}
 */
export function resolveModels({ defaults = {}, user = {}, project = {}, local = {} } = {}) {
  return mergeKeyedLayers({ defaults, user, project, local }, validateEntry, resolveEntry);
}

/**
 * Look up a role's bound entry, or the session fallback
 * (`{ model: "session", provenance: "fallback" }`) when the role isn't bound in any
 * layer — the resolver expresses the fallback; consumers make it visible.
 * Role-level only (inside the `modelBindings` family); family-level unbound behavior
 * for other families is handled by {@link resolveFamily}.
 * @param {Object<string, Binding & {provenance: string}>} table  a resolved table from resolveModels
 * @param {string} role
 * @returns {Binding & {provenance: string}}
 */
export function bindingFor(table, role) {
  return table[role] || { model: 'session', provenance: 'fallback' };
}

/**
 * Resolve one hook family across the four settings layers (defaults < user < project
 * < local), whole-entry replacement per key within a layer.
 *
 * - `modelBindings`: each layer value is a role→binding map; delegates to
 *   {@link resolveModels} (identical result). Role-level session fallback remains
 *   {@link bindingFor}'s concern.
 * - Every other inventory family: each layer value is the family's single entry object
 *   (or `undefined` if that layer does not set the family). A higher layer that sets
 *   the family replaces the lower layer's whole entry — no field-level merge.
 *
 * When unbound in every layer, consults {@link HOOK_INVENTORY}:
 * - fallback-declared → fallback content plus `provenance: 'fallback'`
 *   (object fallbacks are spread; string markers become `{ value, provenance }`)
 * - block-declared → `{ blocked: true, family, gap }` (expressible state, not an error)
 *
 * @param {string} family  a key in {@link HOOK_INVENTORY}
 * @param {{defaults?: *, user?: *, project?: *, local?: *}} [layers]
 * @returns {Object} resolved entry with `provenance`, the modelBindings role table, or a blocked gap
 */
export function resolveFamily(family, { defaults, user, project, local } = {}) {
  const declaration = HOOK_INVENTORY[family];
  if (!declaration) {
    throw new Error(`unknown hook family "${family}"`);
  }

  if (family === 'modelBindings') {
    return resolveModels({ defaults, user, project, local });
  }

  const entry = mergeSingleEntry(family, { defaults, user, project, local });
  if (entry) {
    return entry;
  }
  if ('fallback' in declaration) {
    return fallbackResult(declaration.fallback);
  }
  // block-declared
  return {
    blocked: true,
    family,
    gap: `${family} is not configured`,
  };
}

/**
 * Whole-entry replacement for a single-entry family: the highest layer that defines
 * the family wins entirely (no field-level merge). Returns null when unbound.
 * @param {string} family
 * @param {{defaults?: *, user?: *, project?: *, local?: *}} sources
 * @returns {(Object & {provenance: string}) | null}
 */
function mergeSingleEntry(family, sources) {
  let resolved = null;
  for (const [key, provenance] of LAYERS) {
    const layer = sources[key];
    if (layer === undefined) {
      continue;
    }
    if (typeof layer !== 'object' || layer === null || Array.isArray(layer)) {
      throw new Error(
        `family "${family}" in the ${provenance} layer must be an object entry (got ${JSON.stringify(layer)})`,
      );
    }
    resolved = { ...layer, provenance };
  }
  return resolved;
}

/**
 * Whole-entry replacement per key across layers. Each layer is a map of key → entry;
 * a key bound in a higher layer replaces the entire entry (no field-level merge).
 * @param {{defaults: Object, user: Object, project: Object, local: Object}} sources
 * @param {(entry: *, key: string, layer: string) => void} [validate]
 * @param {(entry: *, provenance: string) => Object} [transform]  defaults to a plain
 *   `{ ...entry, provenance }` stamp; callers needing extra per-entry derivation
 *   (e.g. the agent-and-executor gap stamp) pass their own.
 * @returns {Object<string, Object & {provenance: string}>}
 */
function mergeKeyedLayers(sources, validate, transform = (entry, provenance) => ({ ...entry, provenance })) {
  const table = {};
  for (const [key, provenance] of LAYERS) {
    const layer = sources[key] ?? {};
    for (const [entryKey, entry] of Object.entries(layer)) {
      if (validate) {
        validate(entry, entryKey, provenance);
      }
      table[entryKey] = transform(entry, provenance);
    }
  }
  return table;
}

/**
 * @param {Object|string} fallback
 * @returns {Object & {provenance: 'fallback'}}
 */
function fallbackResult(fallback) {
  if (typeof fallback === 'object' && fallback !== null && !Array.isArray(fallback)) {
    return { ...fallback, provenance: 'fallback' };
  }
  return { value: fallback, provenance: 'fallback' };
}

function resolveEntry(entry, provenance) {
  const resolved = { ...entry, provenance };
  if (entry.agent !== undefined && entry.executor !== undefined) {
    resolved.gap = GAP_AGENT_AND_EXECUTOR;
  }
  return resolved;
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
  if (entry.agent !== undefined && typeof entry.agent !== 'string') {
    throw new TypeError(`role "${role}" in the ${layer} layer has a non-string "agent" (got ${JSON.stringify(entry.agent)})`);
  }
}
