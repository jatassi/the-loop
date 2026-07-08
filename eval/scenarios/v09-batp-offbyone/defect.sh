#!/usr/bin/env bash
# v09-batp-offbyone — subtle off-by-one in the task-position prefix: the LAST task of a
# 3+-task plan now reads "(N-1/N)" instead of "(N/N)". Every committed test uses <= 2
# tasks and shares this one computation, so none of them exercises the broken path —
# the suite stays green and no test edit is needed. Correct for N<=2; wrong from N=3 up
# (e.g. a 3-task feature yields (1/3),(2/3),(2/3) — the last should be (3/3)).
set -euo pipefail

PIPE="workflows/execution-pipeline.js"
[ -f "$PIPE" ] || { echo "v09 defect: $PIPE missing" >&2; exit 1; }

node - "$PIPE" <<'NODE'
const fs = require('node:fs');
const p = process.argv[2];
const s = fs.readFileSync(p, 'utf8');
const old = "  const prefixFor = (id) => (tasks.length >= 2 ? `(${positionOf.get(id)}/${tasks.length}) ` : '');";
const neu = [
  "  const prefixFor = (id) => {",
  "    if (tasks.length < 2) { return ''; }",
  "    const pos = positionOf.get(id);",
  "    const shown = pos === tasks.length && tasks.length > 2 ? pos - 1 : pos;",
  "    return `(${shown}/${tasks.length}) `;",
  "  };",
].join('\n');
if (!s.includes(old)) { console.error('v09 defect: prefixFor anchor not found'); process.exit(1); }
fs.writeFileSync(p, s.replace(old, neu));
NODE

echo "v09 defect applied: last task of a 3+-task plan shows (N-1/N)" >&2
