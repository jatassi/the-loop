// operate-tooling/operate-skill's acceptance, executable: the thin operate skill —
// routing onto the recorded toolkit, the mutation preamble, the four-class action
// boundary, and the lazy retrofit. Prose-only footprint — every assertion reads the
// shipped SKILL.md text directly, the way a human or a downstream agent would.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(p, 'utf8');
const frontmatterName = (text) => text.match(/^name:\s*(\S+)\s*$/m)?.[1];
const OPERATE = 'plugin/skills/operate/SKILL.md';

// ── criterion 1: given a recorded `## Operations toolkit`, route an ops ask onto the
// recorded capability entries and runbook pointers, read a routed runbook fully before
// acting, and precede any mutating action with a one-line preamble — mutation gated to
// entries tagged `mutate` ──
test('operate is a bare-verb skill that routes on the recorded toolkit, reads routed runbooks fully, and gates mutation behind a one-line preamble', () => {
  assert.ok(existsSync(OPERATE), `${OPERATE} should exist`);
  const text = read(OPERATE);

  // bare-verb family: model-invoked, frontmatter name matches directory
  assert.equal(frontmatterName(text), 'operate');
  assert.match(text, /^description:\s*\S/m, 'operate needs a frontmatter description');

  // the recorded section is the route table
  assert.match(text, /## Operations toolkit/, 'the skill reads the recorded `## Operations toolkit` section');
  assert.match(text, /rout/i, 'the ask is routed');
  assert.match(text, /capabilit/i, 'routed onto the capability entries');
  assert.match(text, /runbook/i, 'and onto the runbook pointers');

  // read any routed runbook fully before acting
  assert.match(text, /read[^.\n]*runbook[^.\n]*fully|runbook[^.\n]*fully[^.\n]*before/i,
    'a routed runbook is read fully before acting');
  assert.match(text, /before act/i, 'reading precedes acting');

  // one-line preamble naming what will run and why, before any mutating action
  assert.match(text, /preamble/i, 'a mutation preamble is required');
  assert.match(text, /one[- ]line/i, 'the preamble is one line');
  assert.match(text, /what[^.\n]*(run|will run)[^.\n]*why|what.*why/i,
    'the preamble names what will run and why');
  const preambleIdx = text.search(/preamble/i);
  const mutateIdx = text.search(/mutat/i);
  assert.ok(preambleIdx >= 0 && mutateIdx >= 0, 'both preamble and mutation are discussed');

  // mutation gated to entries tagged `mutate`
  assert.match(text, /`mutate`/, 'mutation is gated to entries tagged `mutate`');
  assert.match(text, /only[^.\n]*`mutate`|`mutate`[^.\n]*only/i,
    'only `mutate`-tagged entries may mutate');
});

// ── criterion 2: the four-class instance-vs-repo action boundary ──
test('operate carries the four-class instance-vs-repo action boundary', () => {
  const text = read(OPERATE);

  // read-only ops freely, via recorded `read` entries
  assert.match(text, /`read`/, 'read-only ops route through `read` entries');
  assert.match(text, /read-only[^.\n]*(freely|free)|(freely|free)[^.\n]*read-only/i,
    'read-only ops run freely');

  // mutating instance actions via `mutate` entries only
  assert.match(text, /instance/i, 'the boundary distinguishes instance actions');

  // repo changes never — a fix exits to a diagnose intake naming the originating session
  assert.match(text, /repo changes? never|never[^.\n]*repo change/i, 'repo changes are never operate\'s');
  assert.match(text, /diagnose/i, 'a fix exits to a diagnose intake');
  assert.match(text, /intake/i, 'to a diagnose intake');
  assert.match(text, /originating[^.\n]*operate session|operate session[^.\n]*originat|names?[^.\n]*session|session[^.\n]*backlink|backlink/i,
    'the intake names the originating operate session');

  // toolkit/runbook doc drift is corrected in the same session
  assert.match(text, /drift/i, 'toolkit/runbook doc drift is called out');
  assert.match(text, /same session/i, 'drift is corrected in the same session');
});

// ── criterion 3: no `## Operations toolkit` section → run the binding interview first,
// record the section, then proceed with the original ask — no graph amendment, no
// re-entering Design ──
test('with no recorded toolkit, operate runs the binding interview first, records the section, then proceeds — no graph amendment, no re-entering Design', () => {
  const text = read(OPERATE);

  assert.match(text, /no[^.\n]*`?## Operations toolkit`?[^.\n]*(section|exist)|absent|when[^.\n]*not recorded/i,
    'the absent-section case is handled');
  assert.match(text, /interview/i, 'it runs the binding interview');
  assert.match(text, /record[^.\n]*section|record the section|records? the/i,
    'it records the section');
  assert.match(text, /original ask|proceed[^.\n]*ask|then proceed/i,
    'then proceeds with the original ask');

  // explicitly no graph amendment and no re-entering Design
  assert.match(text, /no graph amendment|no graph surgery|never[^.\n]*graph/i,
    'explicitly no graph amendment');
  assert.match(text, /no[^.\n]*re-?enter[^.\n]*[Dd]esign|never re-?enter[^.\n]*[Dd]esign|without re-?entering [Dd]esign/i,
    'explicitly no re-entering Design');
});

// ── criterion 4: the skill names no particular deployment target, observability
// product, or vendor toolchain; every CLAUDE_PLUGIN_ROOT reference is brace-wrapped ──
test('operate names no particular deployment target, observability product, or vendor toolchain, and braces every CLAUDE_PLUGIN_ROOT reference', () => {
  const text = read(OPERATE);

  const forbidden = [
    // deployment targets
    'AWS', 'EC2', 'Lambda', 'Kubernetes', 'k8s', 'kubectl', 'Heroku', 'Vercel',
    'Netlify', 'Fly.io', 'Render', 'GCP', 'Azure', 'DigitalOcean', 'ECS', 'Fargate',
    // observability products
    'Datadog', 'Sentry', 'Grafana', 'Prometheus', 'New Relic', 'PagerDuty', 'Splunk',
    'Honeycomb', 'Opsgenie', 'CloudWatch',
    // vendor toolchains
    'Terraform', 'Ansible', 'Docker', 'Helm', 'Pulumi', 'Jenkins',
  ];
  for (const name of forbidden) {
    assert.ok(!new RegExp(String.raw`\b${name.replace('.', String.raw`\.`)}\b`, 'i').test(text),
      `operate must name no particular product/vendor — found "${name}"`);
  }

  // every CLAUDE_PLUGIN_ROOT reference brace-wrapped
  assert.equal(text.match(/\$CLAUDE_PLUGIN_ROOT/g), null,
    'operate must brace every CLAUDE_PLUGIN_ROOT reference as ${CLAUDE_PLUGIN_ROOT}');

  // self-contained: no internal-only ADR citations
  assert.ok(!/\bADR-\d/.test(text), 'operate must not cite an internal ADR (skills are self-contained)');
});
