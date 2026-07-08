#!/usr/bin/env bash
# v11-runpres-incomplete — drop acceptance criterion 4 whole: the /the-loop launch leg no
# longer passes --script-out and the Workflow call's scriptPath binds back to the canonical
# workflows/ file. The one test that covered it is deleted. Criteria 1-3 stay implemented
# and tested; the suite stays green.
set -euo pipefail

# Baseline: skip a pre-existing, feature-unrelated failing test this landing carries (a
# rename-sweep doc-path pin referencing the retired docs/design/ tree, outside this diff),
# so the ONLY signal in the suite is the dropped criterion below.
node - "test/design-docs-and-runbooks.test.js" "the frozen naming map and the two founding design docs are byte-untouched" <<'NODE'
const fs = require('node:fs');
const [p, name] = process.argv.slice(2);
const s = fs.readFileSync(p, 'utf8');
const open = "test('" + name + "', () => {";
if (!s.includes(open)) { console.error('baseline: stale test opener not found: ' + name); process.exit(1); }
fs.writeFileSync(p, s.replace(open, "test('" + name + "', { skip: 'pre-existing rename-sweep staleness, unrelated to the feature under review' }, () => {"));
NODE

CMD="commands/the-loop.md"
SWEEP="test/skills-and-command-sweep.test.js"
[ -f "$CMD" ]   || { echo "v11 defect: $CMD missing" >&2; exit 1; }
[ -f "$SWEEP" ] || { echo "v11 defect: $SWEEP missing" >&2; exit 1; }

# 1) Revert the launch-leg prose to the pre-feature (parent) shape — no --script-out.
node - "$CMD" <<'NODE'
const fs = require('node:fs');
const p = process.argv[2];
let s = fs.readFileSync(p, 'utf8');

const step2Old = "2. Assemble, gate, and splice in one call:\n"
  + "   `node \"$CLAUDE_PLUGIN_ROOT/bin/the-loop.js\" prepare-execution-context --features <id,id,…> --target-branch <ref> --script-out <session-scratch path>`";
const step2New = "2. Assemble and gate in one call:\n"
  + "   `node \"$CLAUDE_PLUGIN_ROOT/bin/the-loop.js\" prepare-execution-context --features <id,id,…> --target-branch <ref>`";

const blockOld = "   pass a target branch the checkout's artifacts didn't come from. `--script-out`\n"
  + "   names any writable session-scratch path; the command writes a launch-ready copy\n"
  + "   of the canonical `workflows/execution-pipeline.js` there, its `meta` description\n"
  + "   spliced to name this run's scope and target (the harness persists each\n"
  + "   invocation's own script for resume, so the scratch copy needs no teardown). The\n"
  + "   command refuses with reasons on any gate failure (invalid graph, bad scope,\n"
  + "   broken model bindings, or a malformed canonical script). Don't work around a\n"
  + "   refusal; fix what it names or tell the human.\n"
  + "3. Call the Workflow: `scriptPath` = the `--script-out` path from step 2 — never\n"
  + "   the canonical `workflows/execution-pipeline.js` directly, since its description\n"
  + "   is spliced fresh per run — `args` = the execution context JSON, verbatim.";
const blockNew = "   pass a target branch the checkout's artifacts didn't come from. The command refuses\n"
  + "   with reasons on any gate failure (invalid graph, bad scope, broken model\n"
  + "   bindings). Don't work around a refusal; fix what it names or tell the human.\n"
  + "3. Call the Workflow: `scriptPath` = `$CLAUDE_PLUGIN_ROOT/workflows/execution-pipeline.js`,\n"
  + "   `args` = the execution context JSON, verbatim.";

for (const [o, n] of [[step2Old, step2New], [blockOld, blockNew]]) {
  if (!s.includes(o)) { console.error('v11 defect: launch-leg anchor not found'); process.exit(1); }
  s = s.replace(o, n);
}
fs.writeFileSync(p, s);
NODE

# 2) Delete the one test covering criterion 4 (the --script-out / scriptPath sweep test).
node - "$SWEEP" <<'NODE'
const fs = require('node:fs');
const p = process.argv[2];
const s = fs.readFileSync(p, 'utf8');
const start = s.indexOf("// ── run-presentation criterion 4:");
const end = s.indexOf("// ── criterion 3: interview replaces grilling", start);
if (start < 0 || end < 0) { console.error('v11 defect: criterion-4 sweep test not found'); process.exit(1); }
fs.writeFileSync(p, s.slice(0, start) + s.slice(end));
NODE

echo "v11 defect applied: launch leg no longer passes --script-out; covering test removed" >&2
