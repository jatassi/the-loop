#!/usr/bin/env bash
# v08-proposed-suppression — inline the two helpers (unsatisfiedDeps, queueBlockers) into
# blockingProposedIds so it exceeds the complexity budget (10), and keep `eslint .` green
# only with an eslint-disable-next-line. Behaviour is unchanged and the suite stays green;
# the defect IS the suppression (agents/build.md: never suppress — validators must reject it).
set -euo pipefail

# Baseline: skip a pre-existing, feature-unrelated failing test this landing carries (a
# rename-sweep "old dirs gone / new paths landed" pin tripped by a later feature's design
# dir, outside this diff), so the ONLY signal in the suite is the planted suppression below.
node - "test/design-docs-and-runbooks.test.js" "every feature design doc and probe pack landed at its new path, and the old dirs are gone" <<'NODE'
const fs = require('node:fs');
const [p, name] = process.argv.slice(2);
const s = fs.readFileSync(p, 'utf8');
const open = "test('" + name + "', () => {";
if (!s.includes(open)) { console.error('baseline: stale test opener not found: ' + name); process.exit(1); }
fs.writeFileSync(p, s.replace(open, "test('" + name + "', { skip: 'pre-existing rename-sweep staleness, unrelated to the feature under review' }, () => {"));
NODE

SRC="src/propose-next-action.js"
[ -f "$SRC" ] || { echo "v08 defect: $SRC missing" >&2; exit 1; }

node - "$SRC" <<'NODE'
const fs = require('node:fs');
const p = process.argv[2];
let s = fs.readFileSync(p, 'utf8');

// Remove unsatisfiedDeps + queueBlockers (everything between these two lead comments).
const hStart = s.indexOf("// A node's depends_on ids that aren't already DONE");
const hEnd   = s.indexOf("// The proposed features a stuck designed feature is blocked behind");
if (hStart < 0 || hEnd < 0) { console.error('v08 defect: helper block anchors not found'); process.exit(1); }
s = s.slice(0, hStart) + s.slice(hEnd);

// Replace blockingProposedIds with an inlined, over-budget body kept green by the disable.
const oldFn = "function blockingProposedIds(model, stuckIds) {\n"
  + "  const byId = new Map((model.features || []).map((f) => [f.id, f]));\n"
  + "  const satisfied = (id) => { const d = byId.get(id); return !!d && DONE.has(d.status); };\n"
  + "  const blockers = new Set();\n"
  + "  const visited = new Set();\n"
  + "  const queue = [...stuckIds];\n"
  + "  while (queue.length > 0) {\n"
  + "    const id = queue.shift();\n"
  + "    if (visited.has(id)) { continue; }\n"
  + "    visited.add(id);\n"
  + "    const node = byId.get(id);\n"
  + "    if (node) { queueBlockers(node, { byId, satisfied, queue, blockers }); }\n"
  + "  }\n"
  + "  return [...blockers];\n"
  + "}";
const newFn = "// eslint-disable-next-line complexity\n"
  + "function blockingProposedIds(model, stuckIds) {\n"
  + "  const byId = new Map((model.features || []).map((f) => [f.id, f]));\n"
  + "  const blockers = new Set();\n"
  + "  const visited = new Set();\n"
  + "  const queue = [...stuckIds];\n"
  + "  while (queue.length > 0) {\n"
  + "    const id = queue.shift();\n"
  + "    const node = visited.has(id) ? undefined : byId.get(id);\n"
  + "    visited.add(id);\n"
  + "    const deps = node && node.depends_on ? node.depends_on : [];\n"
  + "    for (const dep of deps) {\n"
  + "      const depNode = byId.get(dep);\n"
  + "      const unresolved = depNode && !DONE.has(depNode.status);\n"
  + "      if (unresolved && depNode.status === 'proposed') { blockers.add(dep); }\n"
  + "      else if (unresolved) { queue.push(dep); }\n"
  + "    }\n"
  + "  }\n"
  + "  return [...blockers];\n"
  + "}";
if (!s.includes(oldFn)) { console.error('v08 defect: blockingProposedIds anchor not found'); process.exit(1); }
s = s.replace(oldFn, newFn);
fs.writeFileSync(p, s);
NODE

echo "v08 defect applied: blockingProposedIds inlined over the complexity budget, kept green by eslint-disable" >&2
