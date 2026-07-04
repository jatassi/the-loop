// The model-binding resolver core (src/models.js) and the shipped default table
// (config/model-bindings.json). Pure: every test passes in-memory objects, never a
// file path (docs/standards/pure-core-thin-cli.md — resolveModels touches no fs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { bindingFor, EFFORTS, resolveModels } from '../src/models.js';

const DEFAULTS_PATH = path.resolve('config/model-bindings.json');

test('config/model-bindings.json ships exactly the ten pinned default rows, each shaped per the model-binding contract', () => {
  const defaults = JSON.parse(readFileSync(DEFAULTS_PATH, 'utf8'));
  assert.deepEqual(Object.keys(defaults).toSorted((a, b) => a.localeCompare(b)), [
    'build.complex', 'build.rote', 'build.standard', 'derive', 'design.alternative',
    'design.reader', 'drive', 'plan', 'plan.audit', 'validate',
  ]);
  assert.deepEqual(defaults.plan, { model: 'session' });
  assert.deepEqual(defaults['plan.audit'], { model: 'opus' });
  assert.deepEqual(defaults['build.rote'], { model: 'grok-build', via: 'grok' });
  assert.deepEqual(defaults['build.standard'], { model: 'sonnet' });
  assert.deepEqual(defaults['build.complex'], { model: 'opus' });
  assert.deepEqual(defaults.drive, { model: 'sonnet' });
  assert.deepEqual(defaults.derive, { model: 'opus', effort: 'low' });
  assert.deepEqual(defaults.validate, { model: 'sonnet' });
  assert.deepEqual(defaults['design.reader'], { model: 'sonnet' });
  assert.deepEqual(defaults['design.alternative'], { model: 'opus' });
  // shape check: resolveModels accepts the shipped table as a valid defaults layer
  assert.doesNotThrow(() => resolveModels({ defaults }));
});

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

test('a bound via rides the merge into the resolved entry untouched', () => {
  const defaults = { build: { model: 'opus', via: 'my-executor' } };
  const local = { build: { model: 'sonnet', via: 'my-executor' } };
  const table = resolveModels({ defaults, local });
  assert.deepEqual(table.build, { model: 'sonnet', via: 'my-executor', provenance: 'local' });
});

test('resolveModels rejects a malformed entry, naming the role and the layer', () => {
  assert.deepEqual(EFFORTS, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.throws(() => resolveModels({ defaults: { build: 'opus' } }), /build.*default/);
  assert.throws(() => resolveModels({ defaults: { build: {} } }), /build.*default/);
  assert.throws(() => resolveModels({ project: { build: { model: 42 } } }), /build.*project/);
  assert.throws(() => resolveModels({ local: { build: { model: 'sonnet', effort: 'blazing' } } }), /build.*local/);
});
