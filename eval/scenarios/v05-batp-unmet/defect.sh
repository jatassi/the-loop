#!/usr/bin/env bash
# v05-batp-unmet — revert acceptance criterion 3 (no-prefix / "(1/1) never appears") and
# delete the one test that covered it, so the suite stays green while a single-task
# standard plan now emits a redundant "(1/1)" prefix.
set -euo pipefail

PIPE="workflows/execution-pipeline.js"
HAPPY="test/execution-pipeline-happy.test.js"
[ -f "$PIPE" ]  || { echo "v05 defect: $PIPE missing" >&2; exit 1; }
[ -f "$HAPPY" ] || { echo "v05 defect: $HAPPY missing" >&2; exit 1; }

# 1) Reverted behavior: the prefix is now emitted for 1-task plans too (> 0, not >= 2),
#    so a standard plan with exactly one task shows a redundant "(1/1)".
node - "$PIPE" <<'NODE'
const fs = require('node:fs');
const p = process.argv[2];
const s = fs.readFileSync(p, 'utf8');
const old = "const prefixFor = (id) => (tasks.length >= 2 ? `(${positionOf.get(id)}/${tasks.length}) ` : '');";
const neu = "const prefixFor = (id) => (tasks.length > 0 ? `(${positionOf.get(id)}/${tasks.length}) ` : '');";
if (!s.includes(old)) { console.error('v05 defect: prefixFor anchor not found'); process.exit(1); }
fs.writeFileSync(p, s.replace(old, neu));
NODE

# 2a) Delete the dedicated test that covered criterion 3 (the single-task / no-"(1/1)" test).
node - "$HAPPY" <<'NODE'
const fs = require('node:fs');
const p = process.argv[2];
let s = fs.readFileSync(p, 'utf8');
const start = s.indexOf("// ── build-agent-title-progress criterion 3: undivided builds");
const marker = "test('a single-task standard plan and a small-workflow build both carry the bare build label";
const end = s.indexOf("// ── resume:", start);
if (start < 0 || !s.includes(marker) || end < 0) { console.error('v05 defect: single-task test block not found'); process.exit(1); }
s = s.slice(0, start) + s.slice(end);

// 2b) De-fang the namespace test, whose 1-task standard plan otherwise catches the (1/1).
const keyOld = "    [`${ns}build:alpha/t1`]: built('alpha/t1'),";
const keyNew = "    [`${ns}build:(1/1) alpha/t1`]: built('alpha/t1'),";
if (!s.includes(keyOld)) { console.error('v05 defect: namespace-test reply-key anchor not found'); process.exit(1); }
s = s.replace(keyOld, keyNew);
fs.writeFileSync(p, s);
NODE

echo "v05 defect applied: single-task standard plan now emits (1/1); covering test removed" >&2
