// The model-binding resolver core (src/resolve-model-bindings.js). Pure: every test
// passes in-memory objects, never a file path (pure core — resolveModels touches no fs).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bindingFor, EFFORTS, resolveModels } from '../plugin/src/resolve-model-bindings.js';

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

test('resolveModels rejects a malformed entry, naming the role and the layer', () => {
  assert.deepEqual(EFFORTS, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.throws(() => resolveModels({ defaults: { build: 'opus' } }), /build.*default/);
  assert.throws(() => resolveModels({ defaults: { build: {} } }), /build.*default/);
  assert.throws(() => resolveModels({ project: { build: { model: 42 } } }), /build.*project/);
  assert.throws(() => resolveModels({ local: { build: { model: 'sonnet', effort: 'blazing' } } }), /build.*local/);
});
