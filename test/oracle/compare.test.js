// Unit tests for the parity-oracle comparison-rules module: pure assertion
// helpers that express "equivalent results" without subprocess or fixture knowledge.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  areExitCodesEqual,
  bytesEqual,
  isCliFieldEqual,
  isIso8601Shape,
  isStderrAbsent,
  isStderrPresent,
  jsonEqual,
  jsonFileEqual,
  jsonFilesEqual,
} from './compare.js';

// ── jsonEqual ──
test('jsonEqual: matching values ignore key order and formatting', () => {
  const compact = '{"a":1,"b":2}';
  const reordered = '{"b":2,"a":1}';
  const pretty = '{\n  "a": 1,\n  "b": 2\n}';
  const nestedA = { outer: { z: 1, a: [2, { k: 'v' }] }, n: null };
  const nestedB = { n: null, outer: { a: [2, { k: 'v' }], z: 1 } };

  assert.equal(jsonEqual(compact, reordered), true);
  assert.equal(jsonEqual(compact, pretty), true);
  assert.equal(jsonEqual(JSON.parse(compact), JSON.parse(reordered)), true);
  assert.equal(jsonEqual(nestedA, nestedB), true);
});

test('jsonEqual: mismatching values return false', () => {
  assert.equal(jsonEqual('{"a":1}', '{"a":2}'), false);
  assert.equal(jsonEqual({ a: 1 }, { a: 1, b: 2 }), false);
  assert.equal(jsonEqual([1, 2], [2, 1]), false);
  assert.equal(jsonEqual('not-json', '{"a":1}'), false);
});

// ── areExitCodesEqual ──
test('areExitCodesEqual: matching exit codes', () => {
  assert.equal(areExitCodesEqual(0, 0), true);
  assert.equal(areExitCodesEqual(1, 1), true);
});

test('areExitCodesEqual: mismatching exit codes', () => {
  assert.equal(areExitCodesEqual(0, 1), false);
  assert.equal(areExitCodesEqual(1, 0), false);
});

// ── stderr presence / absence ──
test('isStderrPresent: non-empty stderr passes; empty fails', () => {
  assert.equal(isStderrPresent('usage: the-loop <cmd>\n'), true);
  assert.equal(isStderrPresent('x'), true);
  assert.equal(isStderrPresent(''), false);
  assert.equal(isStderrPresent(null), false);
  assert.equal(isStderrPresent(), false);
});

test('isStderrAbsent: empty stderr passes; non-empty fails', () => {
  assert.equal(isStderrAbsent(''), true);
  assert.equal(isStderrAbsent(null), true);
  assert.equal(isStderrAbsent(), true);
  assert.equal(isStderrAbsent('refused: bad scope\n'), false);
  assert.equal(isStderrAbsent('x'), false);
});

// ── isIso8601Shape (preparedAt) ──
test('isIso8601Shape: well-formed ISO-8601 strings pass', () => {
  assert.equal(isIso8601Shape('2026-07-09T12:34:56.789Z'), true);
  assert.equal(isIso8601Shape('2026-07-09T12:34:56Z'), true);
  assert.equal(isIso8601Shape('2026-07-09T12:34:56.789+00:00'), true);
});

test('isIso8601Shape: malformed values fail', () => {
  assert.equal(isIso8601Shape('2026-07-09'), false); // plain date, no time
  assert.equal(isIso8601Shape(1_720_531_296_789), false); // Unix ms number
  assert.equal(isIso8601Shape('1720531296'), false); // Unix timestamp string
  assert.equal(isIso8601Shape('not-a-date'), false);
  assert.equal(isIso8601Shape(''), false);
  assert.equal(isIso8601Shape(null), false);
});

// ── isCliFieldEqual (per-binary) ──
test('isCliFieldEqual: matching per-binary expected value', () => {
  assert.equal(isCliFieldEqual('node plugin/bin/the-loop.js', 'node plugin/bin/the-loop.js'), true);
  assert.equal(isCliFieldEqual('the-loop', 'the-loop'), true);
});

test('isCliFieldEqual: mismatching per-binary expected value', () => {
  assert.equal(isCliFieldEqual('node plugin/bin/the-loop.js', 'the-loop'), false);
  assert.equal(isCliFieldEqual('the-loop', 'node plugin/bin/the-loop.js'), false);
});

// ── bytesEqual (--script-out) ──
test('bytesEqual: identical bytes match; any byte difference fails', () => {
  assert.equal(bytesEqual('exact output\n', 'exact output\n'), true);
  assert.equal(bytesEqual(Buffer.from('abc'), Buffer.from('abc')), true);
  assert.equal(bytesEqual('exact output\n', 'exact output\n '), false); // trailing whitespace
  assert.equal(bytesEqual('exact output\n', 'Exact output\n'), false); // single character
  assert.equal(bytesEqual(Buffer.from('ab'), Buffer.from('ac')), false);
});

// ── jsonFileEqual / jsonFilesEqual (filesystem effects) ──
test('jsonFileEqual: file content is JSON-equal to expected (key order/whitespace free)', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'oracle-compare-'));
  try {
    const filePath = path.join(root, 'status.json');
    writeFileSync(filePath, '{\n  "b": 2,\n  "a": 1\n}\n', 'utf8');

    assert.equal(jsonFileEqual(filePath, { a: 1, b: 2 }), true);
    assert.equal(jsonFileEqual(filePath, '{"a":1,"b":2}'), true);
    assert.equal(jsonFileEqual(filePath, { a: 1, b: 9 }), false);
    assert.equal(jsonFileEqual(path.join(root, 'missing.json'), { a: 1 }), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('jsonFilesEqual: set of relative paths under a fixture tree', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'oracle-compare-multi-'));
  try {
    mkdirSync(path.join(root, 'nested'), { recursive: true });
    writeFileSync(path.join(root, 'a.json'), '{"x":1,"y":2}', 'utf8');
    writeFileSync(path.join(root, 'nested', 'b.json'), '{\n  "y": 2,\n  "x": 1\n}', 'utf8');

    assert.equal(jsonFilesEqual(root, {
      'a.json': { x: 1, y: 2 },
      'nested/b.json': { x: 1, y: 2 },
    }), true);

    assert.equal(jsonFilesEqual(root, {
      'a.json': { x: 1, y: 2 },
      'nested/b.json': { x: 9, y: 2 },
    }), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
