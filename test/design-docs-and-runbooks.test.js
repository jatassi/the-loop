// design-docs-and-runbooks: the runbook-genre rename's design-doc-scoped checks —
// every docs/validation/<id>/ dir carries a procedure.md (the new path constant,
// content-identical moves from docs/runbooks/<id>/runbook.md), and the swept-term
// list (old validation-sense headings/paths gone, the new ones present) holds
// across the living docs/designs/*/design.md corpus. Complements the broader
// living-surface regression in test/runbook-genre-rename.test.js.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(p, 'utf8');

// Same self-describing-narrative exclusion as test/runbook-genre-rename.test.js:
// these two design docs quote the old heading/path on purpose, to narrate a rename
// (this one, or the prior rename-sweep), not to use it as live vocabulary.
const SELF_DESCRIBING_DESIGN_DOCS = new Set(['operate-tooling', 'rename-sweep']);

test('every docs/validation/<id>/ directory carries a non-empty procedure.md — the new path constant', () => {
  assert.ok(existsSync('docs/validation'), 'docs/validation/ should exist post-rename');
  const ids = readdirSync('docs/validation').filter((id) => statSync(`docs/validation/${id}`).isDirectory());
  assert.ok(ids.length > 0, 'at least one validation-sense record should have moved');
  for (const id of ids) {
    const f = `docs/validation/${id}/procedure.md`;
    assert.ok(existsSync(f), `missing ${f}`);
    assert.ok(read(f).trim().length > 0, `${f} should not be empty`);
  }
});

test('living design docs speak the swept vocabulary: no stale validation-runbook terms, the new validation-procedure terms present somewhere', () => {
  const designFiles = readdirSync('docs/designs')
    .filter((id) => !SELF_DESCRIBING_DESIGN_DOCS.has(id))
    .map((id) => `docs/designs/${id}/design.md`)
    .filter((f) => existsSync(f));
  const corpus = designFiles.map((f) => read(f)).join('\n---\n');

  for (const stale of ['## Validation runbook', 'validation-runbook', 'docs/runbooks/<id>/runbook.md', 'docs/runbooks/<feature>/runbook.md']) {
    assert.equal(corpus.includes(stale), false, `retired term "${stale}" still present in a living design doc`);
  }
  for (const fresh of ['## Validation procedure', 'docs/validation/<id>/procedure.md']) {
    assert.ok(corpus.includes(fresh), `approved term "${fresh}" not found anywhere in the swept design-doc corpus`);
  }
});
