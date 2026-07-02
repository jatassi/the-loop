// The forensics scanner (Validate leg 1): deterministic tripwires over a feature
// branch's diff, its plan, and the completion reports — the moves a build agent is
// banned from making, detected as code so nothing can argue with the result. Hits are
// *presumed* findings: the validator triages each (confirm, or dismiss with a recorded
// justification); this layer only observes. Pure over in-memory models per
// docs/standards/pure-core-thin-cli.md — bin/spine.js gathers the git facts.

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
 * The last patch_id recorded in a validations file (docs/validations/<feature-id>.md)
 * — the dedup key: a diff whose patch-id matches needs no re-validation.
 * @param {string} text
 * @returns {string|null}
 */
export function latestPatchId(text) {
  let id = null;
  const entries = text.matchAll(/patch_id:\s*([0-9a-f]{40})/g);
  for (const m of entries) { id = m[1]; }
  return id;
}
