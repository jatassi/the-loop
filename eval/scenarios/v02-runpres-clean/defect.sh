#!/usr/bin/env bash
# v02-runpres-clean — NO planted defect. This landing commit carries one pre-existing,
# feature-unrelated failing test (a rename-sweep doc-path pin that references the retired
# docs/design/ tree — absent from both HEAD~1 and HEAD, outside run-presentation's diff),
# which makes the landing's own `node --test` red before any judging. Skip it so the suite
# is green; the feature itself and all four criteria are the pristine landing tree.
set -euo pipefail

FILE="test/design-docs-and-runbooks.test.js"
[ -f "$FILE" ] || { echo "baseline: $FILE missing" >&2; exit 1; }
node - "$FILE" "the frozen naming map and the two founding design docs are byte-untouched" <<'NODE'
const fs = require('node:fs');
const [p, name] = process.argv.slice(2);
const s = fs.readFileSync(p, 'utf8');
const open = "test('" + name + "', () => {";
if (!s.includes(open)) { console.error('baseline: stale test opener not found: ' + name); process.exit(1); }
const skipped = "test('" + name + "', { skip: 'pre-existing rename-sweep staleness, unrelated to the feature under review' }, () => {";
fs.writeFileSync(p, s.replace(open, skipped));
NODE

echo "v02 baseline normalized: skipped the stale rename-sweep doc-path test (no defect planted)" >&2
