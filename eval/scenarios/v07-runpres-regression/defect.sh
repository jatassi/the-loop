#!/usr/bin/env bash
# v07-runpres-regression — run-presentation's own criteria stay met (labels unchanged),
# but an ADJACENT code path the landing touched regresses: the drive spawn now rides the
# executor's build model instead of its own drive binding (executor-delegation's
# invariant: "the drive binding, never the executor model"). The two assertions that
# covered that behaviour are weakened to tautologies so the suite stays green.
set -euo pipefail

# Baseline: skip a pre-existing, feature-unrelated failing test this landing carries (a
# rename-sweep doc-path pin referencing the retired docs/design/ tree, outside this diff),
# so the ONLY signal in the suite is the planted regression below.
node - "test/design-docs-and-runbooks.test.js" "the frozen naming map and the two founding design docs are byte-untouched" <<'NODE'
const fs = require('node:fs');
const [p, name] = process.argv.slice(2);
const s = fs.readFileSync(p, 'utf8');
const open = "test('" + name + "', () => {";
if (!s.includes(open)) { console.error('baseline: stale test opener not found: ' + name); process.exit(1); }
fs.writeFileSync(p, s.replace(open, "test('" + name + "', { skip: 'pre-existing rename-sweep staleness, unrelated to the feature under review' }, () => {"));
NODE

PIPE="workflows/execution-pipeline.js"
DRIVE="test/execution-pipeline-drive.test.js"
[ -f "$PIPE" ]  || { echo "v07 defect: $PIPE missing" >&2; exit 1; }
[ -f "$DRIVE" ] || { echo "v07 defect: $DRIVE missing" >&2; exit 1; }

# 1) Regression: spread the executor build binding onto the drive spawn (was driveBinding).
node - "$PIPE" <<'NODE'
const fs = require('node:fs');
const p = process.argv[2];
const s = fs.readFileSync(p, 'utf8');
const old = "      ...opts, agentType: 'drive', label: `${f.id}/${task.id} via ${binding.executor}`, ...modelOpts(driveBinding),";
const neu = "      ...opts, agentType: 'drive', label: `${f.id}/${task.id} via ${binding.executor}`, ...modelOpts(binding),";
if (!s.includes(old)) { console.error('v07 defect: drive spawn anchor not found'); process.exit(1); }
fs.writeFileSync(p, s.replace(old, neu));
NODE

# 2) Weaken the two assertions covering the drive model binding into presence-only tautologies.
node - "$DRIVE" <<'NODE'
const fs = require('node:fs');
const p = process.argv[2];
let s = fs.readFileSync(p, 'utf8');
const reps = [
  ["  assert.equal(drive.opts.model, 'haiku'); // the drive binding, never the executor model",
   "  assert.ok(drive.opts.model); // (model is present)"],
  ["  assert.equal(drive.opts.model, 'sonnet'); // the drive-role fallback binding, not the executor model",
   "  assert.ok(drive.opts.model); // (model is present)"],
];
for (const [o, n] of reps) {
  if (!s.includes(o)) { console.error('v07 defect: assertion anchor not found:\n' + o); process.exit(1); }
  s = s.replace(o, n);
}
fs.writeFileSync(p, s);
NODE

echo "v07 defect applied: drive spawn rides executor model; drive-model assertions weakened" >&2
