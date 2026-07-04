// The forensics scanner: every tripwire fires on its banned move and stays quiet on
// the legitimate neighbor of that move — the noise budget lives in these cases.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import YAML from 'yaml';

import { appendWaiver, isDeduped, latestEntry, parseUnifiedDiff, scan, stampRetried } from '../src/validate.js';

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

// A minimal `## Validation` entry, the shape src/validate.js's latestEntry reads.
const entryBlock = (patchId, { result = 'perfect', retried } = {}) => `
## Validation — patch_id \`${patchId}\`

\`\`\`yaml
feature: widget
patch_id: ${patchId}
result: ${result}${retried ? `\nretried: ${JSON.stringify(retried)}` : ''}
\`\`\`
`;

test('latestEntry: absent/empty file, or one with no entries yet, is null-safe', () => {
  assert.equal(latestEntry(''), null);
  assert.equal(latestEntry('# Validations\n\nno entries yet\n'), null);
});

test('latestEntry: reads the LAST entry — patch_id/result surfaced, retried null when absent', () => {
  const text = `# Validations\n${entryBlock('a'.repeat(40), { result: 'deviation' })}${entryBlock('b'.repeat(40), { result: 'perfect' })}`;
  assert.deepEqual(latestEntry(text), { patch_id: 'b'.repeat(40), result: 'perfect', retried: null });
});

test('latestEntry: a retried mark on the latest entry is surfaced verbatim', () => {
  const text = `# Validations\n${entryBlock('a'.repeat(40), { result: 'perfect', retried: '2026-07-03 — human retry directive' })}`;
  assert.deepEqual(latestEntry(text), { patch_id: 'a'.repeat(40), result: 'perfect', retried: '2026-07-03 — human retry directive' });
});

test('latestEntry anchors to `## Validation` headings only, not a trailing `## Resolution` block', () => {
  const validationPatch = 'a'.repeat(40);
  const resolutionPatch = 'c'.repeat(40); // a different patch_id inside the trailing non-Validation block
  const text = `# Validations\n${entryBlock(validationPatch, { result: 'deviation' })}
## Resolution — patch_id \`${resolutionPatch}\` (human authority)

\`\`\`yaml\nresolution: human-merge\npatch_id: ${resolutionPatch}\n\`\`\`\n`;
  assert.deepEqual(latestEntry(text), { patch_id: validationPatch, result: 'deviation', retried: null });
});

test('isDeduped: true only for an unmarked patch-id match; a retried mark, a mismatch, or no prior entry is false', () => {
  const unmarked = { patch_id: 'a'.repeat(40), result: 'perfect', retried: null };
  const marked = { patch_id: 'a'.repeat(40), result: 'deviation', retried: '2026-07-03 — retry' };
  assert.equal(isDeduped('a'.repeat(40), unmarked), true);
  assert.equal(isDeduped('a'.repeat(40), marked), false);
  assert.equal(isDeduped('b'.repeat(40), unmarked), false);
  assert.equal(isDeduped('a'.repeat(40), null), false);
});

// The full yaml object of the LAST entry — an oracle independent of src/validate.js's
// own anchoring, since latestEntry only surfaces patch_id/result/retried and these
// tests need to see the waivers list it doesn't expose.
function lastEntryFull(text) {
  let heading = null;
  for (const m of text.matchAll(/^## Validation\b.*$/gm)) { heading = m; }
  return YAML.parse(/```yaml\n([\s\S]*?)\n```/.exec(text.slice(heading.index))[1]);
}

test('appendWaiver creates the waivers key when absent and appends to an existing list on a repeat call; no expiry field rides along', () => {
  const text = `# Validations\n${entryBlock('a'.repeat(40))}`;
  const first = { obligation: 'criterion 4', reason: 'unrelated pre-existing regression', approver: 'Jackson Atassi' };
  const onceWaived = appendWaiver(text, first);
  assert.deepEqual(lastEntryFull(onceWaived).waivers, [first]);

  const second = { obligation: 'criterion 2', reason: 'flaky probe channel', approver: 'Jackson Atassi' };
  const twiceWaived = appendWaiver(onceWaived, second);
  assert.deepEqual(lastEntryFull(twiceWaived).waivers, [first, second]);
});

test('appendWaiver refuses a missing required field, or a file with no "## Validation" entry yet', () => {
  const text = `# Validations\n${entryBlock('a'.repeat(40))}`;
  assert.throws(() => appendWaiver(text, { obligation: 'x', reason: 'y' })); // approver missing
  assert.throws(() => appendWaiver('# Validations\n\nno entries yet\n', { obligation: 'x', reason: 'y', approver: 'z' }));
});

test('stampRetried sets the retried key when absent, and replaces it when already present', () => {
  const text = `# Validations\n${entryBlock('a'.repeat(40))}`;
  const stamped = stampRetried(text, '2026-07-03 — human retry directive');
  assert.equal(latestEntry(stamped).retried, '2026-07-03 — human retry directive');

  const restamped = stampRetried(stamped, '2026-07-05 — a second retry');
  assert.equal(latestEntry(restamped).retried, '2026-07-05 — a second retry');
});

test('appendWaiver and stampRetried both anchor to the LAST "## Validation" heading, leaving a trailing "## Resolution" block byte-identical', () => {
  const validationPatch = 'a'.repeat(40);
  const resolutionPatch = 'c'.repeat(40); // a different patch_id inside the trailing non-Validation block
  const trailer = `\n## Resolution — patch_id \`${resolutionPatch}\` (human authority)\n\n\`\`\`yaml\nresolution: human-merge\npatch_id: ${resolutionPatch}\n\`\`\`\n`;
  const text = `# Validations\n${entryBlock(validationPatch, { result: 'deviation' })}${trailer}`;
  const waiver = { obligation: 'crit', reason: 'reason', approver: 'approver' };

  const waived = appendWaiver(text, waiver);
  assert.ok(waived.endsWith(trailer));
  assert.deepEqual(lastEntryFull(waived).waivers, [waiver]);

  const stamped = stampRetried(text, '2026-07-04 — retry');
  assert.ok(stamped.endsWith(trailer));
  assert.equal(latestEntry(stamped).retried, '2026-07-04 — retry');
});
