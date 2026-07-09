// The recorded-bindings status reader (src/recorded-bindings.js). Pure: every test
// passes in-memory architecture.md strings, never a path into the core (pure core —
// recordedBindingsStatus touches no fs). The real docs/architecture.md is only
// read here as a realistic "present" fixture.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import * as recordedBindings from '../plugin/src/recorded-bindings.js';
import { recordedBindingsStatus } from '../plugin/src/recorded-bindings.js';

test('recordedBindingsStatus reports present, absent, and opted-out from section text', () => {
  const text = [
    '# Fixture — Architecture',
    '',
    '## Validation runbook',
    '',
    'Bring up the fixture, exercise the CLI, tear down.',
    '',
    '## Release runbook',
    '',
    'none',
    '',
    // operations toolkit heading deliberately omitted → absent
  ].join('\n');

  const status = recordedBindingsStatus(text);
  assert.deepEqual(status.validationRunbook, { status: 'present', gap: null });
  assert.deepEqual(status.releaseRunbook, { status: 'opted-out', gap: null });
  assert.deepEqual(status.operationsToolkit, {
    status: 'absent',
    gap: 'lazy retrofit (operate-tooling)',
  });
});

test('absent release-runbook and operations-toolkit carry named gap wording; validation does not', () => {
  const text = [
    '# Fixture — Architecture',
    '',
    // all three headings absent
    '## Something else',
    '',
    'narrative only',
  ].join('\n');

  const status = recordedBindingsStatus(text);
  assert.deepEqual(status.validationRunbook, { status: 'absent', gap: null });
  assert.deepEqual(status.releaseRunbook, {
    status: 'absent',
    gap: 'blocked — no guessed deploys',
  });
  assert.deepEqual(status.operationsToolkit, {
    status: 'absent',
    gap: 'lazy retrofit (operate-tooling)',
  });
});

test('opted-out is whole-section body "none" (trimmed, case-insensitive) for every binding', () => {
  const text = [
    '## Validation runbook',
    '',
    'NONE',
    '',
    '## Release runbook',
    '',
    '  none  ',
    '',
    '## Operations toolkit',
    '',
    'None',
  ].join('\n');

  const status = recordedBindingsStatus(text);
  assert.deepEqual(status.validationRunbook, { status: 'opted-out', gap: null });
  assert.deepEqual(status.releaseRunbook, { status: 'opted-out', gap: null });
  assert.deepEqual(status.operationsToolkit, { status: 'opted-out', gap: null });
});

test('present / opted-out bindings carry no gap wording', () => {
  const text = [
    '## Validation runbook',
    '',
    'some procedure',
    '',
    '## Release runbook',
    '',
    'none',
    '',
    '## Operations toolkit',
    '',
    'deploy targets and capabilities',
  ].join('\n');

  const status = recordedBindingsStatus(text);
  assert.equal(status.validationRunbook.gap, null);
  assert.equal(status.releaseRunbook.gap, null);
  assert.equal(status.operationsToolkit.gap, null);
  assert.equal(status.validationRunbook.status, 'present');
  assert.equal(status.releaseRunbook.status, 'opted-out');
  assert.equal(status.operationsToolkit.status, 'present');
});

test('this repo\'s docs/architecture.md has all three bindings present', () => {
  const text = readFileSync('docs/architecture.md', 'utf8');
  const status = recordedBindingsStatus(text);
  assert.deepEqual(status.validationRunbook, { status: 'present', gap: null });
  assert.deepEqual(status.releaseRunbook, { status: 'present', gap: null });
  assert.deepEqual(status.operationsToolkit, { status: 'present', gap: null });
});

test('reader is pure and never proposes writes — only status, no write-content exports', () => {
  // Only the status reader is exported; no function that returns markdown/section
  // content to write.
  assert.deepEqual(Object.keys(recordedBindings), ['recordedBindingsStatus']);
  assert.equal(typeof recordedBindings.recordedBindingsStatus, 'function');

  const text = [
    '## Validation runbook',
    '',
    'procedure',
    '',
    '## Release runbook',
    '',
    'none',
  ].join('\n');

  const first = recordedBindingsStatus(text);
  const second = recordedBindingsStatus(text);
  assert.deepEqual(first, second);
  // input string is never mutated
  assert.equal(text, [
    '## Validation runbook',
    '',
    'procedure',
    '',
    '## Release runbook',
    '',
    'none',
  ].join('\n'));
});
