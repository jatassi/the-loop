#!/usr/bin/env bash
# v10-worktree-noisy — NO defect. Cosmetic churn only: reflow (rewrap, words preserved) a
# top-level prose paragraph in three docs the landing never touched, and the leading //
# comment block of one src file the landing never touched. Everything stays green and every
# criterion stays met — this measures a validator's robustness to noisy, defect-free diffs.
set -euo pipefail

DOCS=(
  "docs/design/design.md"
  "docs/design/agentic-dev-loop-design-intent.md"
  "docs/design/agentic-dev-loop-design-decisions.md"
)
SRC="src/index.js"

for f in "${DOCS[@]}" "$SRC"; do
  [ -f "$f" ] || { echo "v10 noise: expected file missing: $f" >&2; exit 1; }
done

reflow_doc() {
  node - "$1" <<'NODE'
const fs = require('node:fs');
const p = process.argv[2];
const lines = fs.readFileSync(p, 'utf8').split('\n');
const wrap = (text, width) => {
  const out = []; let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (cur && (cur.length + 1 + w.length) > width) { out.push(cur); cur = w; }
    else { cur = cur ? cur + ' ' + w : w; }
  }
  if (cur) { out.push(cur); }
  return out;
};
const isProse = (l) => l.length > 0 && !/^\s/.test(l) && !/^[#>|`\-*!\[<=]/.test(l) && !/^\d+\./.test(l);
let start = -1, end = -1;
for (let i = 0; i < lines.length; i++) {
  if (isProse(lines[i])) {
    let j = i; while (j < lines.length && isProse(lines[j])) { j++; }
    if (j - i >= 2) { start = i; end = j; break; }
    i = j;
  }
}
if (start < 0) { lines.push(''); }               // fallback churn: never corrupts structure
else { lines.splice(start, end - start, ...wrap(lines.slice(start, end).join(' '), 74)); }
fs.writeFileSync(p, lines.join('\n'));
NODE
}

reflow_leading_comment() {
  node - "$1" <<'NODE'
const fs = require('node:fs');
const p = process.argv[2];
const lines = fs.readFileSync(p, 'utf8').split('\n');
let end = 0; while (end < lines.length && /^\/\/( |$)/.test(lines[end])) { end++; }
if (end < 2) { process.exit(0); }                // nothing meaningful to reflow
const text = lines.slice(0, end).map((l) => l.replace(/^\/\/\s?/, '')).join(' ');
const wrapped = [];
let cur = '';
for (const w of text.split(/\s+/).filter(Boolean)) {
  if (cur && (cur.length + 1 + w.length) > 60) { wrapped.push('// ' + cur); cur = w; }
  else { cur = cur ? cur + ' ' + w : w; }
}
if (cur) { wrapped.push('// ' + cur); }
fs.writeFileSync(p, [...wrapped, ...lines.slice(end)].join('\n'));
NODE
}

for f in "${DOCS[@]}"; do reflow_doc "$f"; done
reflow_leading_comment "$SRC"

echo "v10 noise applied: reflowed prose in 3 untouched docs + one src comment block (no behavior change)" >&2
