// The runbook-genre-rename completeness regression (operate-tooling design's
// "mandatory completeness regression test" — both prior build attempts shipped a
// green suite while the sweep was actually incomplete). Both assertions here are
// dynamic: they re-list/re-grep the live tree at test time rather than pinning a
// frozen count or file list, so a future stray old-path record or unswept surface
// fails this test.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const read = (p) => readFileSync(p, 'utf8');

test('docs/runbooks/*/runbook.md re-lists empty — every validation-sense record has moved to docs/validation/*/procedure.md', () => {
  const entries = existsSync('docs/runbooks') ? readdirSync('docs/runbooks', { recursive: true }) : [];
  const found = entries.filter((entry) => entry.endsWith(`${path.sep}runbook.md`) || entry === 'runbook.md');
  assert.deepEqual(found, [], `stale validation-sense record(s) still at docs/runbooks/: ${found.join(', ')}`);
});

// The living surfaces named by the rename's sweep bar (operate-tooling design, "The
// rename"): plugin/skills/, plugin/agents/, plugin/src, plugin/workflows, living
// docs/designs/*/design.md, docs/architecture.md, docs/feature-graph.md acceptance
// strings, README.md — everything except the excluded historical records
// (docs/adr/, docs/research/, docs/briefs/, docs/releases/, docs/bugs/) and the
// pinned eval corpus.
//
// Two design docs are self-describing narratives of a rename (not ambient system
// prose) and are excluded from the corpus the same way a historical record would
// be: docs/designs/operate-tooling/design.md narrates *this* rename and must quote
// both the old and new headings/paths to describe the mapping; docs/designs/rename-
// sweep/design.md narrates the *prior*, already-shipped rename-sweep's own
// contemporaneous invariants (accurate to the vocabulary of the tree at the time it
// ran, not to today's). Likewise, docs/feature-graph.md's operate-tooling acceptance
// bullets are this very task's own contract text, which must quote the old heading
// to describe what it's replaced by.
const SELF_DESCRIBING_DESIGN_DOCS = new Set(['operate-tooling', 'rename-sweep']);

// Stale, validation-sense signatures. None of these may survive on a living surface;
// only the operational genre (Release runbook, docs/runbooks/<topic>.md pointers,
// the artifactStores `runbooks` family, "runbook pointers"/"routed runbook" prose)
// may remain — and none of it matches these patterns.
const STALE_PATTERNS = [
  [/##\s*Validation runbook\b/, 'the retired "## Validation runbook" heading'],
  [/validation-runbook\b/i, 'the retired "validation-runbook" compound'],
  [/validation runbook\b/i, 'the retired "validation runbook" phrase'],
  [/runbook\.md/, 'a validation-sense "runbook.md" filename (docs/runbooks/<id>/runbook.md)'],
  [/docs\/runbooks\/(?!<topic>)/, 'a docs/runbooks/ path other than the operational docs/runbooks/<topic>.md pointer'],
  [/feature'?s runbook\b/i, 'a bare "runbook" naming a feature\'s validation record'],
  [/orphaned (fix )?runbook\b/i, 'a bare "runbook" naming a fix\'s validation record'],
  [/standalone runbook\b/i, 'a bare "runbook" naming a standalone validation record'],
  [/no existing test or runbook\b/i, 'a bare "runbook" naming a regression-catching validation record'],
];

function assertSwept(corpus, label) {
  for (const [pattern, what] of STALE_PATTERNS) {
    const m = corpus.match(pattern);
    assert.equal(m, null, `${label}: found ${what} — "${m?.[0]}"`);
  }
}

// Every .md/.js file live under a directory, recursively.
function filesUnder(dir) {
  const entries = readdirSync(dir, { recursive: true });
  return entries
    .map((rel) => path.join(dir, rel))
    .filter((full) => /\.(md|js|rs)$/.test(full) && statSync(full).isFile());
}

test('every living surface greps clean of validation-sense "runbook"/"docs/runbooks" — only the operational genre remains', () => {
  // plugin/skills/, plugin/agents/, plugin/workflows, cli/src: every .md, .js, and
  // .rs file, read fresh from the live tree (plugin/src retired at json-cutover).
  const surfaceFiles = ['plugin/skills', 'plugin/agents', 'plugin/workflows', 'cli/src'].flatMap((dir) => filesUnder(dir));
  for (const full of surfaceFiles) {
    assertSwept(read(full), full);
  }

  // living docs/designs/<id>/design.md, minus the two self-describing narratives.
  const designFiles = readdirSync('docs/designs')
    .filter((id) => !SELF_DESCRIBING_DESIGN_DOCS.has(id))
    .map((id) => `docs/designs/${id}/design.md`)
    .filter((f) => existsSync(f));
  for (const f of designFiles) {
    assertSwept(read(f), f);
  }

  assertSwept(read('docs/architecture.md'), 'docs/architecture.md');
  assertSwept(read('README.md'), 'README.md');

  // docs/feature-graph.json acceptance strings, minus operate-tooling's own — that
  // record's contract text must quote the old heading/path to describe what
  // replaced it.
  const graph = JSON.parse(read('docs/feature-graph.json'));
  const graphMinusOperateTooling = JSON.stringify({
    ...graph,
    features: graph.features.filter((f) => f.id !== 'operate-tooling'),
  });
  assertSwept(graphMinusOperateTooling, 'docs/feature-graph.json (outside operate-tooling\'s own record)');
});
