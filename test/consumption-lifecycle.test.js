// consumption-lifecycle's acceptance, executable: the front door (begin SKILL.md) and
// the validator (validate.md) learn the bound-project lifecycle. Prose-only footprint —
// every assertion reads the shipped surface text directly, the way a downstream agent
// would, the same posture as configure-skill.test.js and merge-posture.test.js.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(p, 'utf8');
const BEGIN = 'plugin/skills/begin/SKILL.md';
const VALIDATE = 'plugin/agents/validate.md';

// ── criterion 1: on a nondefault artifactStores.features, the launch leg follows the
// adapter doc's access path, materializes a gitignored ephemeral snapshot, passes it to
// the graph-consuming subcommands, and tears it down at run end ──
test('begin directs the launch leg to materialize a bound surface as an ephemeral snapshot and pass it to the subcommands', () => {
  const begin = read(BEGIN);

  // branches on the resolved nondefault artifactStores.features
  assert.match(begin, /artifactStores\.features/);
  assert.match(begin, /nondefault/i);

  // follows the adapter doc's access path
  assert.match(begin, /docs\/adapters\/features\.md/);
  assert.match(begin, /Access/);

  // materializes a gitignored ephemeral snapshot, never committed
  assert.match(begin, /materialize/i);
  assert.match(begin, /ephemeral snapshot/i);
  assert.match(begin, /gitignored/i);
  assert.match(begin, /never committed/i);

  // passes that snapshot path to the graph-consuming subcommands via --graph-path
  assert.match(begin, /--graph-path/);
  for (const sub of ['status', 'prepare-execution-context', 'set-status', 'check']) {
    assert.match(begin, new RegExp(String.raw`\b${sub}\b`), `the snapshot must reach ${sub}`);
  }

  // torn down at run end
  assert.match(begin, /tear the snapshot down|torn down at run end/i);
});

// ── criterion 2: status writes invert Linear-first (surface first, then refresh the
// snapshot), and the validator receives the snapshot path with no independent surface
// access ──
test('begin inverts status writes surface-first and the validator gets the snapshot path with no independent surface access', () => {
  const begin = read(BEGIN);
  // surface-first inversion: update the surface first, then refresh the snapshot
  assert.match(begin, /surface[- ]first/i);
  assert.match(begin, /updates the bound surface first/i);
  assert.match(begin, /refreshes the snapshot/i);
  assert.match(begin, /crash leaves truth ahead/i);

  const validate = read(VALIDATE);
  // the validator receives the snapshot path in its execution context
  assert.match(validate, /snapshot graph path/i);
  assert.match(validate, /execution context/i);
  // it targets that path for the status write and reads the graph only from it
  assert.match(validate, /pass the snapshot graph path/i);
  // and has no independent surface access
  assert.match(validate, /Never\s+reach the bound surface/i);
  assert.match(validate, /not surface credentials/i);
});

// ── criterion 3: a bound-but-unreachable surface is a can't-run naming the surface,
// never a silent fallback to local state ──
test('begin reports a bound-but-unreachable surface as a can\'t-run naming the surface, never a silent fallback', () => {
  const begin = read(BEGIN);
  assert.match(begin, /unreachable/i);
  assert.match(begin, /can't-run/i);
  // names the surface in the can't-run
  assert.match(begin, /naming the surface/i);
  // never a fallback to local state
  assert.match(begin, /Never fall back to local/i);
  assert.match(begin, /fork project truth/i);
});

// ── criterion 4: unbinding is a documented migration that exports truth back to
// docs/feature-graph.json, and once features resolves local again runs show a visible
// fallback line ──
test('begin documents unbinding as a migration that exports truth to docs/feature-graph.json with a visible fallback line afterward', () => {
  const begin = read(BEGIN);
  assert.match(begin, /Unbinding is a migration/i);
  assert.match(begin, /export the surface's truth back to\s*\n?\s*`?docs\/feature-graph\.json`?/i);
  // committed export, distinct from the ephemeral run-time snapshots
  assert.match(begin, /this time committed/i);
  // once features resolves local again, a visible fallback line
  assert.match(begin, /resolves\s+`?local`?\s+again/i);
  assert.match(begin, /visible fallback line/i);
});

// ── hygiene: the touched skill stays self-contained (no internal-only ADR citations),
// braces every plugin-root reference; the agent doc keeps its frontmatter ──
test('the front door stays self-contained and both surfaces keep proper frontmatter', () => {
  const begin = read(BEGIN);
  assert.ok(!/\bADR-\d/.test(begin), 'the begin skill must not cite an internal ADR (skills are self-contained)');
  assert.equal(begin.match(/\$CLAUDE_PLUGIN_ROOT/g), null, 'every CLAUDE_PLUGIN_ROOT reference must be braced');
  for (const f of [BEGIN, VALIDATE]) {
    assert.match(read(f), /^name:\s*\S/m, `${f} needs a frontmatter name`);
  }
});
