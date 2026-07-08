#!/usr/bin/env bash
# NO planted defect. This landing commit carries one pre-existing, feature-unrelated
# failing test (a rename-sweep "old dirs are gone / new paths landed" pin whose
# no-stray-directories check trips on a later feature's design dir — outside proposed-status's
# diff), making the landing's own `node --test` red before any judging. Skip it so the suite
# is green; the feature itself and all five criteria are the pristine landing tree.
set -euo pipefail

FILE="test/design-docs-and-runbooks.test.js"
[ -f "$FILE" ] || { echo "baseline: $FILE missing" >&2; exit 1; }
node - "$FILE" "every feature design doc and probe pack landed at its new path, and the old dirs are gone" <<'NODE'
const fs = require('node:fs');
const [p, name] = process.argv.slice(2);
const s = fs.readFileSync(p, 'utf8');
const open = "test('" + name + "', () => {";
if (!s.includes(open)) { console.error('baseline: stale test opener not found: ' + name); process.exit(1); }
const skipped = "test('" + name + "', { skip: 'pre-existing rename-sweep staleness, unrelated to the feature under review' }, () => {";
fs.writeFileSync(p, s.replace(open, skipped));
NODE

echo "baseline normalized: skipped the stale rename-sweep doc-path test (no defect planted)" >&2
