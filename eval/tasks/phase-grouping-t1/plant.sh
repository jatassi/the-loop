#!/usr/bin/env bash
# Baseline normalization, not a trap: at this pre-taming parent, test/design-md.test.js
# pins design_version/feature-count against a design.md state this commit has already
# moved past (mid-stream pin lag) — red before any work starts, unrelated to this
# unit's criteria. Skip it by name so the seed suite is green. Applied identically
# for every model; the test is outside this unit's footprint.
set -euo pipefail

FILE="test/design-md.test.js"
[ -f "$FILE" ] || { echo "baseline: $FILE missing" >&2; exit 1; }
node - "$FILE" "the real design.md parses to the full feature graph" <<'NODE'
const fs = require('node:fs');
const [p, name] = process.argv.slice(2);
const s = fs.readFileSync(p, 'utf8');
const open = "test('" + name + "', () => {";
if (!s.includes(open)) { console.error('baseline: test opener not found: ' + name); process.exit(1); }
const skipped = "test('" + name + "', { skip: 'stale mid-stream pin — not satisfiable in this isolated worktree' }, () => {";
fs.writeFileSync(p, s.replace(open, skipped));
NODE

echo "baseline normalized: skipped stale design-md pin test" >&2
