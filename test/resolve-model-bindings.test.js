// The model-binding resolver core (src/resolve-model-bindings.js). Pure: every test
// passes in-memory objects, never a file path (pure core — resolveModels touches no fs).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  bindingFor,
  EFFORTS,
  HOOK_INVENTORY,
  resolveFamily,
  resolveModels,
} from '../plugin/src/resolve-model-bindings.js';

test('resolveModels merges defaults < project < local, whole-entry replacement per role, stamping per-layer provenance', () => {
  const defaults = { build: { model: 'opus', effort: 'low' }, drive: { model: 'sonnet' } };
  const project = { build: { model: 'haiku' } }; // replaces the default entry wholesale (effort: low is gone)
  const local = { build: { model: 'opus', effort: 'high' } }; // beats project too

  const table = resolveModels({ defaults, project, local });
  assert.deepEqual(table.build, { model: 'opus', effort: 'high', provenance: 'local' });
  assert.deepEqual(table.drive, { model: 'sonnet', provenance: 'default' });

  const projectOnly = resolveModels({ defaults, project });
  assert.deepEqual(projectOnly.build, { model: 'haiku', provenance: 'project' });
});

test('bindingFor returns the bound entry, or the session fallback for an unbound role', () => {
  const table = resolveModels({ defaults: { drive: { model: 'sonnet' } } });
  assert.deepEqual(bindingFor(table, 'drive'), { model: 'sonnet', provenance: 'default' });
  assert.deepEqual(bindingFor(table, 'ghost'), { model: 'session', provenance: 'fallback' });
});

test('a bound executor rides the merge into the resolved entry untouched', () => {
  const defaults = { build: { model: 'opus', executor: 'my-executor' } };
  const local = { build: { model: 'sonnet', executor: 'my-executor' } };
  const table = resolveModels({ defaults, local });
  assert.deepEqual(table.build, { model: 'sonnet', executor: 'my-executor', provenance: 'local' });
});

// role-agent-binding: the optional agent field rides the same whole-entry merge and
// provenance stamp as model/effort/executor; agent+executor on one role is a named
// configuration gap (stamped, never thrown — the resolved view must still show it).
test('a bound agent rides the merge into the resolved entry with layer provenance', () => {
  const defaults = { validate: { model: 'opus' } };
  const project = { validate: { model: 'opus', agent: 'my-validator' } };
  const table = resolveModels({ defaults, project });
  assert.deepEqual(table.validate, { model: 'opus', agent: 'my-validator', provenance: 'project' });
});

test('agent+executor on one role is rejected as a named configuration gap without throwing', () => {
  const table = resolveModels({
    local: { validate: { model: 'opus', agent: 'my-validator', executor: 'grok' } },
  });
  assert.equal(table.validate.agent, 'my-validator');
  assert.equal(table.validate.executor, 'grok');
  assert.equal(table.validate.gap, 'agent-and-executor');
  assert.equal(table.validate.provenance, 'local');
});

test('resolveModels rejects a malformed entry, naming the role and the layer', () => {
  assert.deepEqual(EFFORTS, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.throws(() => resolveModels({ defaults: { build: 'opus' } }), /build.*default/);
  assert.throws(() => resolveModels({ defaults: { build: {} } }), /build.*default/);
  assert.throws(() => resolveModels({ project: { build: { model: 42 } } }), /build.*project/);
  assert.throws(() => resolveModels({ local: { build: { model: 'sonnet', effort: 'blazing' } } }), /build.*local/);
  assert.throws(() => resolveModels({ project: { plan: { model: 'session', agent: 7 } } }), /plan.*project/);
});

// --- configure: four layers, family-generic resolve, inventory fallback/block ---

test('resolveModels merges defaults < user < project < local, stamping user provenance', () => {
  const defaults = { build: { model: 'opus' }, drive: { model: 'sonnet' } };
  const user = { build: { model: 'haiku' }, plan: { model: 'sonnet', effort: 'low' } };
  const project = { build: { model: 'opus', effort: 'medium' } };
  const local = { drive: { model: 'opus' } };

  const table = resolveModels({ defaults, user, project, local });
  // user alone for plan
  assert.deepEqual(table.plan, { model: 'sonnet', effort: 'low', provenance: 'user' });
  // project beats user for build
  assert.deepEqual(table.build, { model: 'opus', effort: 'medium', provenance: 'project' });
  // local beats default for drive (user never set drive)
  assert.deepEqual(table.drive, { model: 'opus', provenance: 'local' });

  // user beats defaults when project/local omit the role
  const userOnly = resolveModels({
    defaults: { build: { model: 'opus', effort: 'low' } },
    user: { build: { model: 'haiku' } },
  });
  assert.deepEqual(userOnly.build, { model: 'haiku', provenance: 'user' });
});

const SINGLE_ENTRY_FAMILIES = [
  'interview',
  'testHarness',
  'lint',
  'precommit',
  'notification',
  'artifactStores',
];

test('resolveFamily covers all seven inventory families with whole-entry replacement per key', () => {
  // modelBindings: role-merge identical to resolveModels
  const modelLayers = {
    defaults: { build: { model: 'opus', effort: 'low' }, drive: { model: 'sonnet' } },
    user: { build: { model: 'haiku' } },
    project: { build: { model: 'opus' } },
    local: { drive: { model: 'opus', effort: 'high' } },
  };
  assert.deepEqual(resolveFamily('modelBindings', modelLayers), resolveModels(modelLayers));

  // every settings-layer family is declared in the inventory
  for (const family of ['modelBindings', ...SINGLE_ENTRY_FAMILIES]) {
    assert.ok(HOOK_INVENTORY[family], `HOOK_INVENTORY missing family "${family}"`);
    assert.ok(
      'fallback' in HOOK_INVENTORY[family] || 'block' in HOOK_INVENTORY[family],
      `"${family}" must declare fallback or block`,
    );
  }

  // single-entry families: higher layer replaces the whole entry (no field-level merge)
  for (const family of SINGLE_ENTRY_FAMILIES) {
    const defaults = { alpha: 1, beta: 2, keep: true };
    const project = { alpha: 99 }; // wholesale — beta/keep must not leak from defaults
    const resolved = resolveFamily(family, { defaults, project });
    assert.deepEqual(
      resolved,
      { alpha: 99, provenance: 'project' },
      `${family}: project must replace the whole entry, not merge fields`,
    );

    // user sits between defaults and project
    const withUser = resolveFamily(family, {
      defaults: { from: 'defaults' },
      user: { from: 'user' },
      local: { from: 'local' },
    });
    assert.deepEqual(withUser, { from: 'local', provenance: 'local' });

    const userWins = resolveFamily(family, {
      defaults: { from: 'defaults' },
      user: { from: 'user' },
    });
    assert.deepEqual(userWins, { from: 'user', provenance: 'user' });
  }
});

test('unbound fallback family resolves to declared fallback; unbound block family names the gap', () => {
  // (a) fallback-declared, unbound across all layers
  for (const family of SINGLE_ENTRY_FAMILIES) {
    const decl = HOOK_INVENTORY[family];
    assert.ok('fallback' in decl, `${family} should be fallback-declared`);
    const resolved = resolveFamily(family, {});
    assert.equal(resolved.provenance, 'fallback', `${family} unbound → provenance fallback`);
    if (typeof decl.fallback === 'object' && decl.fallback !== null && !Array.isArray(decl.fallback)) {
      const { provenance, ...content } = resolved;
      assert.equal(provenance, 'fallback');
      assert.deepEqual(content, decl.fallback);
    } else {
      // marker string (e.g. detected-convention) rides as `value`
      assert.deepEqual(resolved, { value: decl.fallback, provenance: 'fallback' });
    }
  }

  // modelBindings unbound roles stay role-level (bindingFor); family resolve is the empty table
  assert.deepEqual(resolveFamily('modelBindings', {}), {});
  assert.deepEqual(bindingFor({}, 'ghost'), { model: 'session', provenance: 'fallback' });

  // (b) block-declared family unbound → named gap, not throw
  assert.ok(HOOK_INVENTORY.exampleBlock, 'synthetic block family for schema coverage');
  assert.ok('block' in HOOK_INVENTORY.exampleBlock);
  const blocked = resolveFamily('exampleBlock', {});
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.family, 'exampleBlock');
  assert.match(blocked.gap, /exampleBlock/);
  assert.equal(blocked.provenance, undefined); // distinct from fallback shape

  // block family bound in a layer resolves like any other single-entry family
  const boundBlock = resolveFamily('exampleBlock', {
    project: { procedure: 'docs/validation.md' },
  });
  assert.deepEqual(boundBlock, { procedure: 'docs/validation.md', provenance: 'project' });
  assert.equal(boundBlock.blocked, undefined);
});
