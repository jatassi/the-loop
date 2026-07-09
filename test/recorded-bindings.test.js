// The recorded-bindings status reader (src/recorded-bindings.js). Pure: every test
// passes in-memory architecture.md strings, never a path into the core (pure core —
// recordedBindingsStatus touches no fs). The real docs/architecture.md is only
// read here as a realistic "present" fixture.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import * as recordedBindings from '../plugin/src/recorded-bindings.js';
import { recordedBindingsStatus } from '../plugin/src/recorded-bindings.js';
import { sectionAfter } from '../plugin/src/replace-fenced-block.js';

test('recordedBindingsStatus reports present, absent, and opted-out from section text', () => {
  const text = [
    '# Fixture — Architecture',
    '',
    '## Validation procedure',
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
  assert.deepEqual(status.validationProcedure, { status: 'present', gap: null });
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
  assert.deepEqual(status.validationProcedure, { status: 'absent', gap: null });
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
    '## Validation procedure',
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
  assert.deepEqual(status.validationProcedure, { status: 'opted-out', gap: null });
  assert.deepEqual(status.releaseRunbook, { status: 'opted-out', gap: null });
  assert.deepEqual(status.operationsToolkit, { status: 'opted-out', gap: null });
});

test('present / opted-out bindings carry no gap wording', () => {
  const text = [
    '## Validation procedure',
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
  assert.equal(status.validationProcedure.gap, null);
  assert.equal(status.releaseRunbook.gap, null);
  assert.equal(status.operationsToolkit.gap, null);
  assert.equal(status.validationProcedure.status, 'present');
  assert.equal(status.releaseRunbook.status, 'opted-out');
  assert.equal(status.operationsToolkit.status, 'present');
});

test('this repo\'s docs/architecture.md has all three bindings present', () => {
  const text = readFileSync('docs/architecture.md', 'utf8');
  const status = recordedBindingsStatus(text);
  assert.deepEqual(status.validationProcedure, { status: 'present', gap: null });
  assert.deepEqual(status.releaseRunbook, { status: 'present', gap: null });
  assert.deepEqual(status.operationsToolkit, { status: 'present', gap: null });
});

test('this repo\'s Operations toolkit section binds deployed instance, deploy/rollback, and observability, sibling to the release and validation-procedure bindings, and reads present (operate-tooling repo-ops-toolkit-section)', () => {
  const text = readFileSync('docs/architecture.md', 'utf8');
  const body = sectionAfter(text, '## Operations toolkit');

  assert.notEqual(body, null, 'docs/architecture.md must carry an ## Operations toolkit section');
  assert.match(body, /installed plugin/i, 'deployed instance must be the installed plugin');
  assert.match(
    body,
    /deploy[^\n]*Release runbook/i,
    'deploy must route through the Release runbook\'s recorded chain',
  );
  assert.match(
    body,
    /rollback[^\n]*Release runbook/i,
    'rollback must route through the Release runbook\'s recorded chain',
  );
  assert.match(body, /human notices/i, 'observability must be recorded as "the human notices"');

  // Sibling to the release and validation-procedure bindings: same heading level,
  // both preceding headings present in the doc.
  const validationIdx = text.indexOf('## Validation procedure');
  const releaseIdx = text.indexOf('## Release runbook');
  const opsIdx = text.indexOf('## Operations toolkit');
  assert.ok(validationIdx !== -1 && releaseIdx !== -1 && opsIdx !== -1,
    'all three recorded-binding headings must be present at the same (##) level');
  assert.ok(opsIdx > validationIdx && opsIdx > releaseIdx,
    'Operations toolkit is a sibling section, ordered after the other two bindings');

  assert.deepEqual(recordedBindingsStatus(text).operationsToolkit, { status: 'present', gap: null });
});

test('reader is pure and never proposes writes — only status, no write-content exports', () => {
  // Only the status reader is exported; no function that returns markdown/section
  // content to write.
  assert.deepEqual(Object.keys(recordedBindings), ['recordedBindingsStatus']);
  assert.equal(typeof recordedBindings.recordedBindingsStatus, 'function');

  const text = [
    '## Validation procedure',
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
    '## Validation procedure',
    '',
    'procedure',
    '',
    '## Release runbook',
    '',
    'none',
  ].join('\n'));
});
