// The forensics scanner (Validate leg 1): deterministic tripwires over a feature
// branch's diff, its plan, and the completion reports — the moves a build agent is
// banned from making, detected as code so nothing can argue with the result. Hits are
// *presumed* findings: the validator triages each (confirm, or dismiss with a recorded
// justification); this layer only observes. Pure over in-memory models per
// docs/standards/pure-core-thin-cli.md — bin/spine.js gathers the git facts.

import YAML from 'yaml';

import { replaceBlock } from './blocks.js';

/**
 * @typedef {Object} DiffLine
 * @property {number} line  1-based line number (new file for added, old file for removed)
 * @property {string} text  the line's content, without the +/- marker
 */

/**
 * @typedef {Object} DiffFile
 * @property {string} path       repo-relative path (the post-image path for renames)
 * @property {'A'|'M'|'D'} status added | modified (incl. renamed) | deleted
 * @property {DiffLine[]} added
 * @property {DiffLine[]} removed
 */

/**
 * @typedef {Object} Hit
 * @property {string} tripwire  which rule fired
 * @property {string} path
 * @property {string} detail    the offending line or a one-line description
 * @property {number} [line]
 */

/**
 * Parse `git diff --unified=0 <base> <branch>` output into per-file line records.
 * Tolerates context lines, renames, and binary files (which yield no lines).
 * @param {string} text
 * @returns {DiffFile[]}
 */
export function parseUnifiedDiff(text) {
  const files = [];
  let f = null;
  const pos = { old: 0, new: 0 };
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      f = { path: null, oldPath: null, status: 'M', added: [], removed: [] };
      files.push(f);
      continue;
    }
    if (!f || consumeFileHeader(f, line)) { continue; }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) { pos.old = Number(hunk[1]); pos.new = Number(hunk[2]); continue; }
    consumeContentLine(f, line, pos);
  }
  for (const file of files) { file.path ||= file.oldPath; }
  return files.filter((file) => file.path != null);
}

// A hunk content line: +added, -removed, or context. Advances the line counters.
function consumeContentLine(f, line, pos) {
  if (line.startsWith('+') && !line.startsWith('+++')) {
    f.added.push({ line: pos.new, text: line.slice(1) });
    pos.new += 1;
  } else if (line.startsWith('-') && !line.startsWith('---')) {
    f.removed.push({ line: pos.old, text: line.slice(1) });
    pos.old += 1;
  } else if (line.startsWith(' ')) {
    pos.old += 1;
    pos.new += 1;
  }
}

// File-header lines between `diff --git` and the first hunk. Returns true when the
// line was header (consumed), so the caller never mistakes it for content.
function consumeFileHeader(f, line) {
  if (line.startsWith('new file mode')) { f.status = 'A'; return true; }
  if (line.startsWith('deleted file mode')) { f.status = 'D'; return true; }
  if (line.startsWith('--- ')) { f.oldPath = stripPathPrefix(line.slice(4)); return true; }
  if (line.startsWith('+++ ')) {
    const p = stripPathPrefix(line.slice(4));
    if (p) { f.path = p; }
    return true;
  }
  return /^(index |similarity |dissimilarity |rename |copy |old mode|new mode|Binary files )/.test(line);
}

function stripPathPrefix(p) {
  return p === '/dev/null' ? null : p.replace(/^[ab]\//, '');
}

const TEST_PATH = /(^|\/)tests?\/|\.test\.|\.spec\.|(^|\/)__tests__\//;

/** Is this path test code? (path heuristic; shared with the validator's instructions) */
export function isTestPath(p) {
  return TEST_PATH.test(p);
}

const CONFIG_NAMES = new Set(['package.json', 'Makefile', 'justfile', 'pyproject.toml', 'setup.cfg', 'tox.ini', 'pytest.ini']);
const CONFIG_PATTERN = /(^|\/)\.(?:eslintrc|nycrc|mocharc|babelrc)[^/]*$|(^|\/)(?:eslint|jest|vitest|ava|karma|playwright)[^/]*\.config\.[^/]+$|\.config\.[cm]?[jt]s$|^\.github\/workflows\//;

function isConfigPath(p) {
  const base = p.split('/').pop();
  return CONFIG_NAMES.has(base) || CONFIG_PATTERN.test(p);
}

// Tripwire patterns. Each is scoped tight: the noise budget lives in these regexes,
// not in downstream judgment.
const DISABLING = /\.(?:only|skip|todo)\s*\(|\b(?:xit|xdescribe|xtest)\s*\(/;
const SUPPRESSION = /eslint-disable|@ts-(?:ignore|nocheck|expect-error)|\bnoqa\b|type:\s*ignore|\bnolint\b|istanbul ignore|c8 ignore|pylint:\s*disable|rubocop:disable/;
const ENV_SNIFF = /NODE_ENV\s*[!=]==?\s*['"`]test['"`]|JEST_WORKER_ID|PYTEST_CURRENT_TEST|NODE_TEST_CONTEXT|VITEST_(?:POOL|WORKER)_ID/;
const EXIT_MANIPULATION = /process\.exit\s*\(|sys\.exit\s*\(|os\._exit\s*\(/;

/**
 * Run every tripwire. `plan` is the parsed plan artifact (may be null for a feature
 * built without one — plan-dependent tripwires then stay quiet rather than guess).
 * @param {{diff: DiffFile[], plan: (import('./plan.js').PlanModel|null)}} input
 * @returns {Hit[]}
 */
export function scan({ diff, plan }) {
  const tasks = (plan && plan.tasks) || [];
  return [
    ...existingTestMutation(diff),
    ...addedLineHits(diff, { tripwire: 'disabling-directive', pattern: DISABLING, keep: (f) => isTestPath(f.path) && f.status !== 'A' }),
    ...addedLineHits(diff, { tripwire: 'suppression-directive', pattern: SUPPRESSION, keep: () => true }),
    ...harnessTampering(diff, tasks),
    ...addedLineHits(diff, { tripwire: 'test-env-sniffing', pattern: ENV_SNIFF, keep: (f) => !isTestPath(f.path) }),
    ...addedLineHits(diff, { tripwire: 'exit-manipulation', pattern: EXIT_MANIPULATION, keep: (f) => isTestPath(f.path) }),
    ...footprintExcursions(tasks),
  ];
}

const hit = (tripwire, path, detail) => ({ tripwire, path, detail });

// Deletions or rewrites inside pre-existing test code. Pure additions are fine —
// extending a suite is normal work; shrinking or rewriting one is the builder
// editing its own graders.
function existingTestMutation(diff) {
  const hits = [];
  for (const f of diff) {
    if (!isTestPath(f.path) || f.status === 'A') { continue; }
    if (f.status === 'D') {
      hits.push(hit('existing-test-mutation', f.path, 'pre-existing test file deleted'));
    } else if (f.removed.length > 0) {
      hits.push({ ...hit('existing-test-mutation', f.path, `${f.removed.length} line(s) removed or rewritten in a pre-existing test file`), line: f.removed[0].line });
    }
  }
  return hits;
}

// One hit per added line matching a pattern, over the files `keep` admits.
function addedLineHits(diff, { tripwire, pattern, keep }) {
  const hits = [];
  for (const f of diff) {
    if (f.status === 'D' || !keep(f)) { continue; }
    for (const a of f.added) {
      if (pattern.test(a.text)) { hits.push({ ...hit(tripwire, f.path, a.text.trim()), line: a.line }); }
    }
  }
  return hits;
}

// Build/test/lint configuration changed by a diff whose plan never declared it.
// A planned config change sits in some task's footprint; an unplanned one is the
// classic evaluator-tampering vector.
function harnessTampering(diff, tasks) {
  const declared = new Set(tasks.flatMap((t) => t.footprint || []));
  const hits = [];
  for (const f of diff) {
    if (isConfigPath(f.path) && !declared.has(f.path)) {
      hits.push(hit('harness-tampering', f.path, 'build/test/lint configuration changed outside every declared task footprint'));
    }
  }
  return hits;
}

// footprint_actual beyond the task's lease, with no deviation naming the excursion.
// The completion report is the builder's own claim — this only checks it against itself.
function footprintExcursions(tasks) {
  const hits = [];
  for (const t of tasks) {
    if (!t.report) { continue; }
    const declared = new Set(t.footprint || []);
    const mentioned = (t.report.deviations || []).join('\n');
    const actual = t.report.footprint_actual || [];
    for (const p of actual) {
      if (!declared.has(p) && !mentioned.includes(p)) {
        hits.push(hit('footprint-excursion', p, `task ${t.id} touched a file outside its footprint without declaring the excursion`));
      }
    }
  }
  return hits;
}

/**
 * @typedef {Object} LatestEntry
 * @property {string|null} patch_id  the dedup key
 * @property {string|null} result    perfect | deviation | remediation-pending
 * @property {string|null} retried   the retry mark ("<date> — <reason>"), or null
 */

const VALIDATION_HEADING = /^## Validation\b.*$/gm;

/**
 * The span of the retained yaml block under the LAST `## Validation` heading in a
 * validations file (docs/validations/<feature-id>.md) — the substrate latestEntry
 * (read) and appendWaiver/stampRetried (mutate) all anchor to. Anchored to that
 * heading only, never to the last yaml block or the last `patch_id:` match, so a
 * file ending in a trailing `## Resolution` block (which carries its own patch_id)
 * still resolves to the Validation entry before it. Null when the file carries no
 * `## Validation` entry yet.
 * @param {string} text
 * @returns {import('./blocks.js').Span|null}
 */
function lastValidationSpan(text) {
  let heading = null;
  for (const m of text.matchAll(VALIDATION_HEADING)) { heading = m; }
  if (!heading) { return null; }
  const fence = /```ya?ml[^\n]*\n/g;
  fence.lastIndex = heading.index + heading[0].length;
  const open = fence.exec(text);
  if (!open) { return null; }
  const innerStart = open.index + open[0].length;
  const innerEnd = text.indexOf('\n```', innerStart);
  if (innerEnd === -1) { return null; }
  return { inner: text.slice(innerStart, innerEnd), innerStart, innerEnd };
}

/**
 * The judged entry under the LAST `## Validation` heading — the dedup key. Null-safe:
 * an absent/empty file, or one with no `## Validation` entry yet, yields null.
 * @param {string} text
 * @returns {LatestEntry|null}
 */
export function latestEntry(text) {
  const span = lastValidationSpan(text);
  if (!span) { return null; }
  const js = YAML.parse(span.inner) || {};
  return { patch_id: js.patch_id ?? null, result: js.result ?? null, retried: js.retried ?? null };
}

/**
 * Dedup means "no fresh judgment needed": the diff's own patch-id matches the latest
 * entry's, and that entry carries no retried mark — a mark means a human asked for a
 * fresh re-judgment despite the identical diff, so a marked match still dedups false.
 * @param {string|null} patchId
 * @param {LatestEntry|null} latest
 * @returns {boolean}
 */
export function isDeduped(patchId, latest) {
  return latest != null && patchId != null && patchId === latest.patch_id && latest.retried == null;
}

/**
 * Append a waiver to the waivers list of the entry under the LAST `## Validation`
 * heading in a validations file, creating the waivers key when the entry lacks one.
 * Waivers carry no expiry field — a recorded waiver is permanent for the feature
 * (ADR-0032). The retained yaml block is parsed, mutated, and spliced back, so every
 * byte outside that entry's own block (including a trailing non-Validation block) is
 * preserved. Throws — nothing written by any caller — on a missing/empty required
 * field, or a file with no `## Validation` entry yet.
 * @param {string} text
 * @param {{obligation: string, reason: string, approver: string}} waiver
 * @returns {string}
 */
export function appendWaiver(text, waiver) {
  const { obligation, reason, approver } = waiver || {};
  if (!obligation || !reason || !approver) {
    throw new Error('a waiver requires non-empty obligation, reason, and approver');
  }
  const span = lastValidationSpan(text);
  if (!span) { throw new Error('no "## Validation" entry to waive against'); }
  const doc = YAML.parseDocument(span.inner);
  const entry = { obligation, reason, approver };
  if (doc.hasIn(['waivers'])) { doc.addIn(['waivers'], entry); }
  else { doc.setIn(['waivers'], [entry]); }
  return replaceBlock(text, span, doc.toString().replace(/\n$/, ''));
}

/**
 * Set (or replace) the `retried` key on the entry under the LAST `## Validation`
 * heading — the mark ADR-0032's retry-on-validate-park resolution stamps so
 * isDeduped treats the match as dedup false despite an identical patch-id, letting
 * all four validator legs run fresh. Consumed by t7's `spine escalation resolve
 * retry`. Every byte outside that entry's own yaml block is preserved. Throws when
 * the file carries no `## Validation` entry yet.
 * @param {string} text
 * @param {string} mark  "<date> — <reason>"
 * @returns {string}
 */
export function stampRetried(text, mark) {
  const span = lastValidationSpan(text);
  if (!span) { throw new Error('no "## Validation" entry to stamp'); }
  const doc = YAML.parseDocument(span.inner);
  doc.setIn(['retried'], mark);
  return replaceBlock(text, span, doc.toString().replace(/\n$/, ''));
}
