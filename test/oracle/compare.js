// Parity-oracle comparison rules: pure assertion helpers that express
// "equivalent results" between CLI runs. No subprocesses, no case/fixture
// knowledge — a driver imports these and calls them per-case for a verdict.
//
// Contract of equivalence (from the parity-oracle design):
//   - stdout / written JSON artifacts: JSON-value equality (key order +
//     formatting irrelevant)
//   - exit codes: exact ===
//   - stderr: presence/absence on refusal paths only (wording not compared)
//   - preparedAt: ISO-8601 shape, not a specific instant
//   - execution-context `cli`: per-binary expected value (caller supplies it)
//   - --script-out: byte equality (same input script, pure string splice)

import { readFileSync } from 'node:fs';
import path from 'node:path';

/** ISO-8601 datetime shape, e.g. 2026-07-09T12:34:56.789Z or with offset. */
const ISO_8601_SHAPE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Coerce a value to a JSON value for comparison. JSON strings are parsed so
 * formatting/key-order differences disappear; already-parsed values pass through.
 * @param {unknown} value
 * @returns {unknown}
 */
function toJsonValue(value) {
  if (typeof value === 'string') {
    return JSON.parse(value);
  }
  return value;
}

/**
 * Structural equality of JSON values: object key order is ignored; array order
 * and primitive identity matter. Mirrors what deep-equal would do on parsed JSON.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function valuesEqual(a, b) {
  if (Object.is(a, b)) {
    return true;
  }
  if (a === null || b === null) {
    return a === b;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (Array.isArray(a)) {
    return arrayEqual(a, b);
  }
  if (typeof a === 'object') {
    return objectEqual(a, b);
  }
  return false;
}

/** @param {unknown[]} a @param {unknown} b */
function arrayEqual(a, b) {
  if (!Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  for (const [i, item] of a.entries()) {
    if (!valuesEqual(item, b[i])) {
      return false;
    }
  }
  return true;
}

/** @param {object} a @param {unknown} b */
function objectEqual(a, b) {
  if (typeof b !== 'object' || b === null || Array.isArray(b)) {
    return false;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  const setB = new Set(keysB);
  for (const key of keysA) {
    if (!setB.has(key) || !valuesEqual(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

/**
 * JSON-value equality that ignores key order and formatting.
 * Accepts already-parsed values or JSON text strings.
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean} true when values are JSON-equal; false on mismatch or unparseable input
 */
export function jsonEqual(left, right) {
  try {
    return valuesEqual(toJsonValue(left), toJsonValue(right));
  } catch {
    return false;
  }
}

/**
 * Exact exit-code equality (===). Named so callers document intent.
 * @param {number} actual
 * @param {number} expected
 * @returns {boolean}
 */
export function areExitCodesEqual(actual, expected) {
  return actual === expected;
}

/**
 * Refusal-path check: stderr is non-empty (a refusal was emitted).
 * Wording is not compared — only presence.
 * @param {string | null | undefined} stderr
 * @returns {boolean}
 */
export function isStderrPresent(stderr) {
  return typeof stderr === 'string' && stderr.length > 0;
}

/**
 * Refusal-path check: stderr is empty (no refusal).
 * null/undefined are treated as empty.
 * @param {string | null | undefined} stderr
 * @returns {boolean}
 */
export function isStderrAbsent(stderr) {
  return !isStderrPresent(stderr);
}

/**
 * preparedAt shape check: ISO-8601 datetime string (not a specific wall-clock value).
 * Accepts fractional seconds and Z or ±HH:MM offsets; rejects plain dates and numbers.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isIso8601Shape(value) {
  return typeof value === 'string' && ISO_8601_SHAPE.test(value);
}

/**
 * execution-context `cli` field check against a per-binary expected value.
 * The caller supplies the expected string (e.g. `the-loop` vs a custom install path);
 * this module holds no binary knowledge.
 * @param {unknown} actual
 * @param {unknown} expected
 * @returns {boolean}
 */
export function isCliFieldEqual(actual, expected) {
  return actual === expected;
}

/**
 * Byte-equality for --script-out output (exact string/buffer equality, no JSON normalization).
 * @param {string | Buffer | Uint8Array} left
 * @param {string | Buffer | Uint8Array} right
 * @returns {boolean}
 */
export function bytesEqual(left, right) {
  if (typeof left === 'string' && typeof right === 'string') {
    return left === right;
  }
  return Buffer.from(left).equals(Buffer.from(right));
}

/**
 * Read one file and compare its content to an expected JSON value via jsonEqual.
 * @param {string} filePath absolute (or cwd-relative) path to the file
 * @param {unknown} expected already-parsed JSON value or JSON text
 * @returns {boolean}
 */
export function jsonFileEqual(filePath, expected) {
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return false;
  }
  return jsonEqual(text, expected);
}

/**
 * Read files under a fixture root and compare each to an expected JSON value.
 * @param {string} rootDir fixture directory root
 * @param {Record<string, unknown>} expectedByRelativePath map of relative path → expected JSON
 * @returns {boolean} true only when every path's content is JSON-equal to its expected value
 */
export function jsonFilesEqual(rootDir, expectedByRelativePath) {
  for (const [rel, expected] of Object.entries(expectedByRelativePath)) {
    if (!jsonFileEqual(path.join(rootDir, rel), expected)) {
      return false;
    }
  }
  return true;
}
