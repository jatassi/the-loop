// The forensics scanner: every tripwire fires on its banned move and stays quiet on
// the legitimate neighbor of that move — the noise budget lives in these cases.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { latestPatchId, parseUnifiedDiff, scan } from '../src/validate.js';

// Minimal unified-diff builders (what `git diff --unified=0` emits).
const modified = (path, { added = [], removed = [] } = {}) => [
  `diff --git a/${path} b/${path}`,
  'index 1111111..2222222 100644',
  `--- a/${path}`,
  `+++ b/${path}`,
  `@@ -10,${removed.length} +10,${added.length} @@`,
  ...removed.map((t) => `-${t}`),
  ...added.map((t) => `+${t}`),
  '',
].join('\n');

const created = (path, lines) => [
  `diff --git a/${path} b/${path}`,
  'new file mode 100644',
  'index 0000000..2222222',
  '--- /dev/null',
  `+++ b/${path}`,
  `@@ -0,0 +1,${lines.length} @@`,
  ...lines.map((t) => `+${t}`),
  '',
].join('\n');

const deleted = (path, lines) => [
  `diff --git a/${path} b/${path}`,
  'deleted file mode 100644',
  'index 2222222..0000000',
  `--- a/${path}`,
  '+++ /dev/null',
  `@@ -1,${lines.length} +0,0 @@`,
  ...lines.map((t) => `-${t}`),
  '',
].join('\n');

const tripwires = (diffText, plan = null) =>
  scan({ diff: parseUnifiedDiff(diffText), plan }).map((h) => h.tripwire);

test('parseUnifiedDiff models added/removed lines with statuses and numbers', () => {
  const files = parseUnifiedDiff(
    modified('src/a.js', { added: ['new line'], removed: ['old line'] }) +
    created('src/b.js', ['line one', 'line two']) +
    deleted('src/c.js', ['gone']),
  );
  assert.equal(files.length, 3);
  const [a, b, c] = files;
  assert.deepEqual([a.status, b.status, c.status], ['M', 'A', 'D']);
  assert.deepEqual(a.added, [{ line: 10, text: 'new line' }]);
  assert.deepEqual(a.removed, [{ line: 10, text: 'old line' }]);
  assert.deepEqual(b.added.map((l) => l.line), [1, 2]);
  assert.equal(c.removed.length, 1);
});

test('existing-test-mutation: fires on rewrites and deletions of pre-existing tests only', () => {
  assert.deepEqual(tripwires(modified('test/x.test.js', { removed: ['assert.equal(a, 1);'], added: ['assert.ok(a);'] })), ['existing-test-mutation']);
  assert.deepEqual(tripwires(deleted('test/x.test.js', ['whole file'])), ['existing-test-mutation']);
  assert.deepEqual(tripwires(modified('test/x.test.js', { added: ['test("more", () => {});'] })), []);
  assert.deepEqual(tripwires(created('test/new.test.js', ['test("fresh", () => {});'])), []);
});

test('disabling-directive: fires on .only/.skip/x-prefixed added to existing tests', () => {
  assert.deepEqual(tripwires(modified('test/x.test.js', { added: ['it.only("just this", () => {});'] })), ['disabling-directive']);
  assert.deepEqual(tripwires(modified('test/x.test.js', { added: ['xdescribe("quietly off", () => {});'] })), ['disabling-directive']);
  assert.deepEqual(tripwires(created('test/new.test.js', ['it.only("fresh file", () => {});'])), []);
});

test('suppression-directive: fires anywhere in the diff', () => {
  assert.deepEqual(tripwires(modified('src/a.js', { added: ['// eslint-disable-next-line complexity'] })), ['suppression-directive']);
  assert.deepEqual(tripwires(modified('src/a.py', { added: ['x = f()  # noqa'] })), ['suppression-directive']);
  assert.deepEqual(tripwires(modified('src/a.js', { added: ['const disabled = true;'] })), []);
});

test('harness-tampering: config changes fire unless a task footprint declares them', () => {
  const plan = { tasks: [{ id: 't1', footprint: ['eslint.config.js'], report: null }] };
  assert.deepEqual(tripwires(modified('eslint.config.js', { added: ['rule off'] })), ['harness-tampering']);
  assert.deepEqual(tripwires(modified('.github/workflows/ci.yml', { added: ['- run: true'] })), ['harness-tampering']);
  assert.deepEqual(tripwires(modified('eslint.config.js', { added: ['rule off'] }), plan), []);
  assert.deepEqual(tripwires(modified('src/config.js', { added: ['export const config = 1;'] })), []);
});

test('test-env-sniffing: fires in source, not in tests, on test-detection patterns only', () => {
  assert.deepEqual(tripwires(modified('src/a.js', { added: ["if (process.env.NODE_ENV === 'test') { return; }"] })), ['test-env-sniffing']);
  assert.deepEqual(tripwires(modified('src/a.js', { added: ['if (process.env.JEST_WORKER_ID) { return; }'] })), ['test-env-sniffing']);
  assert.deepEqual(tripwires(modified('test/a.test.js', { added: ["if (process.env.NODE_ENV === 'test') { return; }"] })), []);
  assert.deepEqual(tripwires(modified('src/a.js', { added: ["if (process.env.NODE_ENV === 'production') { warm(); }"] })), []);
});

test('exit-manipulation: fires on process.exit added to test code', () => {
  assert.deepEqual(tripwires(modified('test/setup.js', { added: ['process.exit(0);'] })), ['exit-manipulation']);
  assert.deepEqual(tripwires(modified('src/cli.js', { added: ['process.exit(1);'] })), []);
});

test('footprint-excursion: undeclared actual paths fire; deviation-declared ones do not', () => {
  const plan = { tasks: [{
    id: 't1', footprint: ['src/a.js'],
    report: { result: 'built', footprint_actual: ['src/a.js', 'src/b.js'], deviations: [] },
  }] };
  const declared = { tasks: [{
    id: 't1', footprint: ['src/a.js'],
    report: { result: 'built', footprint_actual: ['src/a.js', 'src/b.js'], deviations: ['had to touch src/b.js to re-export the new symbol'] },
  }] };
  assert.deepEqual(tripwires('', plan), ['footprint-excursion']);
  assert.deepEqual(tripwires('', declared), []);
});

test('a clean diff with a clean plan scans to zero hits', () => {
  const plan = { tasks: [{ id: 't1', footprint: ['src/a.js'], report: { result: 'built', footprint_actual: ['src/a.js'], deviations: [] } }] };
  const text = modified('src/a.js', { added: ['export const two = 2;'] }) + created('test/two.test.js', ['test("two", () => {});']);
  assert.deepEqual(scan({ diff: parseUnifiedDiff(text), plan }), []);
});

test('latestPatchId: absent → null; multiple entries → the last one wins', () => {
  assert.equal(latestPatchId('# Validations\n\nno entries yet\n'), null);
  const two = `patch_id: ${'a'.repeat(40)}\n…later…\npatch_id: ${'b'.repeat(40)}\n`;
  assert.equal(latestPatchId(two), 'b'.repeat(40));
});
