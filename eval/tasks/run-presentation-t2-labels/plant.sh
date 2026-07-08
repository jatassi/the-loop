#!/usr/bin/env bash
# Baseline normalization, not a trap: this parent carries one test that shells out
# to git history ("frozen naming map" pins docs against an old commit), which a
# fresh-init fixture can never satisfy. Skip it by name so the seed suite is green
# and the unit's own criteria are the only signal. Applied identically for every
# model; the skipped test is outside this unit's footprint and criteria.
set -euo pipefail

FILE="test/design-docs-and-runbooks.test.js"
[ -f "$FILE" ] || { echo "baseline: $FILE missing" >&2; exit 1; }
node - "$FILE" "the frozen naming map and the two founding design docs are byte-untouched" <<'NODE'
const fs = require('node:fs');
const [p, name] = process.argv.slice(2);
const s = fs.readFileSync(p, 'utf8');
const open = "test('" + name + "', () => {";
if (!s.includes(open)) { console.error('baseline: test opener not found: ' + name); process.exit(1); }
const skipped = "test('" + name + "', { skip: 'history-dependent doc pin — not satisfiable in this isolated worktree' }, () => {";
fs.writeFileSync(p, s.replace(open, skipped));
NODE

echo "baseline normalized: skipped history-dependent doc-pin test" >&2
