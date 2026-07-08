#!/usr/bin/env bash
# Baseline normalization, not a trap: this parent carries two tests that depend on
# git history / retired doc trees ("frozen naming map" shells out to git against an
# old commit; the design-doc path sweep trips in a fresh-init fixture). Skip them by
# name so the seed suite is green and the unit's own criteria are the only signal.
# Applied identically for every model; both tests are outside this unit's footprint.
set -euo pipefail

FILE="test/design-docs-and-runbooks.test.js"
[ -f "$FILE" ] || { echo "baseline: $FILE missing" >&2; exit 1; }
node - "$FILE" <<'NODE'
const fs = require('node:fs');
const p = process.argv[2];
let s = fs.readFileSync(p, 'utf8');
const names = [
  'every feature design doc and probe pack landed at its new path, and the old dirs are gone',
  'the frozen naming map and the two founding design docs are byte-untouched',
];
for (const name of names) {
  const open = "test('" + name + "', () => {";
  if (!s.includes(open)) { console.error('baseline: test opener not found: ' + name); process.exit(1); }
  const skipped = "test('" + name + "', { skip: 'history-dependent doc pin — not satisfiable in this isolated worktree' }, () => {";
  s = s.replace(open, skipped);
}
fs.writeFileSync(p, s);
NODE

echo "baseline normalized: skipped two history-dependent doc-pin tests" >&2
