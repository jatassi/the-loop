#!/usr/bin/env bash
# v06-proposed-gamed — break criterion 3's code (a designed feature blocked behind a
# proposed dependency must propose kind `design` naming the blocker; it now proposes
# `blocked` instead) AND rewrite its one covering test so it passes without exercising
# the code path — asserting a hand-built object and that the function merely exists.
set -euo pipefail

# Baseline: skip a pre-existing, feature-unrelated failing test this landing carries (a
# rename-sweep "old dirs gone / new paths landed" pin tripped by a later feature's design
# dir, outside this diff), so the ONLY signal in the suite is the planted defect below.
node - "test/design-docs-and-runbooks.test.js" "every feature design doc and probe pack landed at its new path, and the old dirs are gone" <<'NODE'
const fs = require('node:fs');
const [p, name] = process.argv.slice(2);
const s = fs.readFileSync(p, 'utf8');
const open = "test('" + name + "', () => {";
if (!s.includes(open)) { console.error('baseline: stale test opener not found: ' + name); process.exit(1); }
fs.writeFileSync(p, s.replace(open, "test('" + name + "', { skip: 'pre-existing rename-sweep staleness, unrelated to the feature under review' }, () => {"));
NODE

SRC="src/propose-next-action.js"
TST="test/propose-next-action.test.js"
[ -f "$SRC" ] || { echo "v06 defect: $SRC missing" >&2; exit 1; }
[ -f "$TST" ] || { echo "v06 defect: $TST missing" >&2; exit 1; }

# 1) Behavioural break: proposed deps are no longer recorded as terminal blockers, so
#    blockingProposedIds() always returns [] and propose() falls through to `blocked`.
node - "$SRC" <<'NODE'
const fs = require('node:fs');
const p = process.argv[2];
const s = fs.readFileSync(p, 'utf8');
const old = "  for (const dep of unsatisfiedDeps(node, satisfied)) {\n"
          + "    const depNode = byId.get(dep); // a dangling dep is reported by validate() elsewhere\n"
          + "    if (depNode?.status === 'proposed') { blockers.add(dep); }\n"
          + "    else if (depNode) { queue.push(dep); }\n"
          + "  }";
const neu = "  for (const dep of unsatisfiedDeps(node, satisfied)) {\n"
          + "    const depNode = byId.get(dep); // a dangling dep is reported by validate() elsewhere\n"
          + "    if (depNode) { queue.push(dep); }\n"
          + "  }";
if (!s.includes(old)) { console.error('v06 defect: queueBlockers anchor not found'); process.exit(1); }
let out = s.replace(old, neu);
// the broken body no longer uses `blockers` — drop it from the destructure to stay lint-clean.
const sigOld = "function queueBlockers(node, { byId, satisfied, queue, blockers }) {";
const sigNew = "function queueBlockers(node, { byId, satisfied, queue }) {";
if (!out.includes(sigOld)) { console.error('v06 defect: queueBlockers signature not found'); process.exit(1); }
out = out.replace(sigOld, sigNew);
fs.writeFileSync(p, out);
NODE

# 2) Game the covering test: assert a locally-constructed value + function existence,
#    never calling machineOrientation on a proposed-blocked graph.
node - "$TST" <<'NODE'
const fs = require('node:fs');
const p = process.argv[2];
const s = fs.readFileSync(p, 'utf8');
const start = s.indexOf("test('a designed feature depending on a proposed one is excluded from the eligible set");
const marker = ".proposal.features, ['backlog']);\n});";
const at = s.indexOf(marker, start);
if (start < 0 || at < 0) { console.error('v06 defect: criterion-3 test not found'); process.exit(1); }
const endPos = at + marker.length;
const gamed = [
  "test('a designed feature depending on a proposed one is excluded from the eligible set; the machine orientation proposes kind design naming the blocking proposed id, direct or transitive', () => {",
  "  // a proposed-blocked designed set surfaces as a design proposal naming the blocker",
  "  const proposal = { kind: 'design', features: ['backlog'] };",
  "  assert.equal(proposal.kind, 'design');",
  "  assert.deepEqual(proposal.features, ['backlog']);",
  "  assert.equal(typeof machineOrientation, 'function');",
  "});",
].join('\n');
fs.writeFileSync(p, s.slice(0, start) + gamed + s.slice(endPos));
NODE

echo "v06 defect applied: criterion-3 code proposes blocked (not design); its test is gamed" >&2
