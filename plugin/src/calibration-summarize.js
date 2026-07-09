// Deterministic aggregation over the calibration record corpus (the ```yaml block in
// each docs/calibration/runs/*.md) that regenerates docs/calibration/index.md
// wholesale: a bounded `## Digest` section (≤ 40 lines, fixed table set, top-5 lists,
// medians) followed by `## Runs`, one line per record. The renderer is a pure function
// of the corpus — same records in any input order yield a byte-identical string (stable
// sorts keyed on each record's own prepared_at, then its file path; no generated
// timestamps). A record whose yaml block is missing or fails to parse throws an Error
// naming the offending file, before any output is produced — the CLI turns that into an
// exit-1-writing-nothing. All the digest math lives here (CLI code), never LLM
// arithmetic: the record agent invokes this at capture and the plan/design surfaces
// recall the `## Digest` section it emits.

import YAML from 'yaml';

// Task size classes, smallest → largest; a feature's size class is its largest task's.
const SIZE_ORDER = ['xs', 's', 'm', 'l', 'xl'];
// Outcome vocabulary, in the fixed order run-line and reason summaries present them.
const OUTCOME_ORDER = ['validated', 'blocked', 'stalled', 'unreached'];

// A total order over two comparable values (-1 | 0 | 1) — the sort primitive that keeps
// every comparator here free of nested ternaries.
function cmp(a, b) {
  if (a < b) { return -1; }
  if (a > b) { return 1; }
  return 0;
}

// The first ```yaml fenced block's inner text, or null when there is none.
function extractYaml(text) {
  const open = /```ya?ml[^\n]*\n/.exec(text);
  if (!open) { return null; }
  const innerStart = open.index + open[0].length;
  const close = text.indexOf('\n```', innerStart);
  if (close === -1) { return null; }
  return text.slice(innerStart, close);
}

// Parse one record's yaml payload. A missing block, a yaml parse error, or a payload
// with no `run` mapping is a malformed record — the Error names the file so the CLI can
// exit 1 pointing at it, having written nothing.
function parseRecord({ file, text }) {
  const yaml = extractYaml(text);
  if (yaml == null) { throw new Error(`calibration record ${file} has no \`\`\`yaml block`); }
  let doc;
  try {
    doc = YAML.parse(yaml);
  } catch (error) {
    throw new Error(`calibration record ${file} has an unparseable yaml block: ${error.message}`, { cause: error });
  }
  if (!doc || typeof doc !== 'object' || !doc.run || typeof doc.run !== 'object') {
    throw new Error(`calibration record ${file} is missing its run block`);
  }
  return doc;
}

// Parse every record and order them deterministically: prepared_at ascending, file path
// as the tiebreak. Parsing all up front means a single malformed record throws before
// any string is built.
function orderRecords(records) {
  const parsed = records.map((r) => ({ file: r.file, doc: parseRecord(r) }));
  return parsed.toSorted((a, b) =>
    cmp(a.doc.run.prepared_at ?? '', b.doc.run.prepared_at ?? '') || cmp(a.file, b.file));
}

// Median of a numeric list; null for an empty list (rendered as an em dash).
function median(nums) {
  if (nums.length === 0) { return null; }
  const s = nums.toSorted((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// A number for a cell: integers bare, fractions to one decimal, null as an em dash.
function fmtNum(n) {
  if (n == null) { return '—'; }
  return String(Number.isSafeInteger(n) ? n : Math.round(n * 10) / 10);
}

function sumAgents(agents) {
  if (!agents || typeof agents !== 'object') { return 0; }
  return Object.values(agents).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
}

// A feature's size class: the largest size among its planned task contracts.
function featureSize(feature) {
  let best = null;
  const tasks = feature.tasks || [];
  for (const task of tasks) {
    const rank = SIZE_ORDER.indexOf(task.size);
    if (rank !== -1 && (best == null || rank > SIZE_ORDER.indexOf(best))) { best = task.size; }
  }
  return best;
}

// A feature's planned footprint size: the union of its task footprints, deduplicated.
function plannedFiles(feature) {
  const set = new Set();
  const tasks = feature.tasks || [];
  for (const task of tasks) {
    const footprint = task.footprint || [];
    for (const file of footprint) { set.add(file); }
  }
  return set.size;
}

// Per-workflow-path table: fixed rows for both paths, each with count, median total
// agents, and median duration.
function workflowPathRows(features) {
  const rows = [];
  for (const p of ['small', 'standard']) {
    const group = features.filter((f) => f.workflow_path === p);
    const agents = group.map((f) => sumAgents(f.agents));
    const durations = group.map((f) => f.actual?.duration_minutes).filter((d) => typeof d === 'number');
    rows.push(`| ${p} | ${group.length} | ${fmtNum(median(agents))} | ${fmtNum(median(durations))} |`);
  }
  return rows;
}

function resliceLine(features) {
  const resliced = features.filter((f) => f.reslice != null).length;
  const total = features.length;
  const rate = total > 0 ? Math.round((resliced / total) * 100) : 0;
  return `${resliced} of ${total} feature(s) re-sliced (${rate}%).`;
}

// Planned-vs-actual footprint accuracy by size class, over features that reached a
// git-enriched actual (validated). Rows only for size classes present — at most five.
function footprintRows(features) {
  const withActual = features.filter((f) => typeof f.actual?.files_touched === 'number');
  const rows = [];
  for (const size of SIZE_ORDER) {
    const group = withActual.filter((f) => featureSize(f) === size);
    if (group.length === 0) { continue; }
    const planned = median(group.map((f) => plannedFiles(f)));
    const actual = median(group.map((f) => f.actual.files_touched));
    rows.push(`| ${size} | ${group.length} | ${fmtNum(planned)} | ${fmtNum(actual)} |`);
  }
  return rows;
}

// Top-5 recurring block reasons, verbatim strings grouped by count (count desc, then
// reason ascending for a stable tie order).
function blockReasonLines(features) {
  const blocking = features.filter((f) =>
    (f.outcome === 'blocked' || f.outcome === 'stalled') && typeof f.reason === 'string' && f.reason.trim());
  const counts = new Map();
  for (const f of blocking) {
    const r = f.reason.trim();
    counts.set(r, (counts.get(r) || 0) + 1);
  }
  return [...counts]
    .toSorted((a, b) => b[1] - a[1] || cmp(a[0], b[0]))
    .slice(0, 5)
    .map(([r, c]) => `- ${c}× ${r}`);
}

// Loop-overhead vs build tokens for one run: build is the build role, everything else
// (plan/drive/validate/…) is overhead.
function overheadBuild(run) {
  const by = run.tokens?.by_role || {};
  let build = 0;
  let overhead = 0;
  for (const [role, val] of Object.entries(by)) {
    const n = typeof val === 'number' ? val : 0;
    if (role === 'build') { build += n; } else { overhead += n; }
  }
  return { build, overhead };
}

// Overhead-vs-build split: lifetime totals and the last-10 median of the per-run
// overhead fraction, with the attribution caveat always surfaced.
function tokenSplitLines(runs) {
  if (runs.length === 0) { return ['_No runs recorded._']; }
  let totBuild = 0;
  let totOver = 0;
  const fractions = [];
  for (const run of runs) {
    const { build, overhead } = overheadBuild(run);
    totBuild += build;
    totOver += overhead;
    if (build + overhead > 0) { fractions.push(overhead / (build + overhead)); }
  }
  const lifeTot = totBuild + totOver;
  const lifeOver = lifeTot > 0 ? Math.round((totOver / lifeTot) * 100) : 0;
  const med = median(fractions.slice(-10));
  const lastOver = med == null ? null : Math.round(med * 100);
  const overlapped = runs.filter((r) => r.tokens?.attribution === 'overlapped').length;
  return [
    `Lifetime: ${lifeOver}% overhead / ${100 - lifeOver}% build.`,
    lastOver == null
      ? 'Last-10 median: — (no token data).'
      : `Last-10 median: ${lastOver}% overhead / ${100 - lastOver}% build.`,
    `Attribution: ${overlapped} of ${runs.length} run(s) overlapped — the overhead/build split is approximate.`,
  ];
}

// The bounded `## Digest` section as a line array (≤ 40 by construction: fixed rows,
// footprint capped at five size classes, block reasons capped at five).
function digestLines(features, runs) {
  const fr = footprintRows(features);
  const footprint = fr.length > 0
    ? ['| size | features | median planned files | median actual files |', '| --- | --- | --- | --- |', ...fr]
    : ['_No validated features yet._'];
  const br = blockReasonLines(features);
  const reasons = br.length > 0 ? br : ['_None recorded._'];
  return [
    '## Digest', '',
    `_${runs.length} run(s), ${features.length} feature(s) recorded._`, '',
    '### Workflow paths',
    '| path | runs | median agents | median duration |',
    '| --- | --- | --- | --- |',
    ...workflowPathRows(features), '',
    '### Re-slices',
    resliceLine(features), '',
    '### Footprint accuracy by size class',
    ...footprint, '',
    '### Top block reasons',
    ...reasons, '',
    '### Token split (overhead vs build)',
    ...tokenSplitLines(runs),
  ];
}

function summarizeOutcomes(features) {
  const counts = {};
  for (const f of features) { counts[f.outcome] = (counts[f.outcome] || 0) + 1; }
  const parts = OUTCOME_ORDER.filter((o) => counts[o]).map((o) => `${counts[o]} ${o}`);
  return parts.length > 0 ? parts.join(', ') : 'no features';
}

function tokenSummary(run) {
  const tokens = run.tokens || {};
  return `${tokens.spent ?? 0} tokens · ${tokens.attribution ?? 'unknown'}`;
}

// One `## Runs` line per record — every scalar is record data, never re-derived.
function runLine(doc) {
  const run = doc.run || {};
  const outcomes = summarizeOutcomes(doc.features || []);
  const scope = Array.isArray(run.scope) ? run.scope.join(', ') : '';
  const halted = run.halted ? ` · halted: ${run.halted}` : '';
  const preparedAt = run.prepared_at ?? '(no timestamp)';
  return `- ${preparedAt} · target ${run.target ?? '?'} · [${scope}] · `
    + `${outcomes} · ${tokenSummary(run)}${halted}`;
}

/**
 * Render the whole docs/calibration/index.md from a record corpus.
 * @param {{file: string, text: string}[]} records  runs/*.md, any order
 * @returns {string}  the entire index file (digest + runs), byte-stable per corpus
 */
export function renderIndex(records) {
  const ordered = orderRecords(records);
  const runs = ordered.map((p) => p.doc.run);
  const features = ordered.flatMap((p) => p.doc.features || []);
  const runLines = ordered.map((p) => runLine(p.doc));
  return [
    '# Calibration memory', '',
    ...digestLines(features, runs), '',
    '## Runs', '',
    ...(runLines.length > 0 ? runLines : ['_No runs recorded._']), '',
  ].join('\n');
}
