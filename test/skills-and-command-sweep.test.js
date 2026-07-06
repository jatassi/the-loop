// rename-sweep/skills-and-command-sweep's acceptance, executable: the six skill
// packs and commands/the-loop.md speak the approved vocabulary (docs/design/naming-map.md).
// This task's footprint is prose only (skills/, commands/the-loop.md) — every
// assertion here reads the shipped files' text directly, the same way a human or
// a downstream agent would.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p) => readFileSync(p, 'utf8');
const frontmatterName = (text) => text.match(/^name:\s*(\S+)\s*$/m)?.[1];

// ── criterion 1: frame→define, ship→release, craft→code-quality, frontmatter
// name matches directory; the old directories are gone; design/diagnose/write-skills
// keep their directory names ──
test('frame, ship, and craft skill directories are renamed with matching frontmatter', () => {
  assert.ok(!existsSync('skills/frame'), 'skills/frame should no longer exist');
  assert.ok(!existsSync('skills/ship'), 'skills/ship should no longer exist');
  assert.ok(!existsSync('skills/craft'), 'skills/craft should no longer exist');

  for (const [dir, name] of [['define', 'define'], ['release', 'release'], ['code-quality', 'code-quality']]) {
    const skill = read(`skills/${dir}/SKILL.md`);
    assert.equal(frontmatterName(skill), name, `skills/${dir}/SKILL.md name should be ${name}`);
  }

  // design, diagnose, and write-skills keep their directory names (swept in place)
  for (const dir of ['design', 'diagnose', 'write-skills']) {
    assert.ok(existsSync(`skills/${dir}/SKILL.md`), `skills/${dir}/SKILL.md should still exist`);
  }
});

// ── criterion 2: commands/the-loop.md routes on the new CLI subcommand, flags,
// project-state values, and eligible-set proposal kind, and names the renamed
// workflow script path ──
test('commands/the-loop.md routes on the collapsed status subcommand, prepare-execution-context flags, and the new project states', () => {
  const cmd = read('commands/the-loop.md');

  assert.match(cmd, /the-loop\.js"\s+status\s+--json/, 'the context call should read `status --json`');
  assert.match(cmd, /\bnode "\$CLAUDE_PLUGIN_ROOT\/bin\/the-loop\.js" status\b(?!\s*--json)/, 'the closing call should read bare `status`');
  assert.ok(!/\borient\b/.test(cmd), 'the retired `orient` subcommand should not be named');
  assert.ok(!/\bledger\b/.test(cmd), 'the retired `ledger` subcommand should not be named');

  assert.match(cmd, /prepare-execution-context --features <id,id,…> --target-branch <ref>/);
  assert.ok(!cmd.includes('--scope'), 'the retired --scope flag should not be named');
  assert.ok(!/--target\b(?!-branch)/.test(cmd), 'the retired --target flag should not be named bare');

  assert.match(cmd, /`unconfigured`\s*\/\s*`partial`\s*\/\s*`configured`/);
  assert.match(cmd, /`advance-eligible-set`/);
  assert.ok(!cmd.includes('advance-frontier'), 'the retired advance-frontier kind should not be named');

  assert.match(cmd, /workflows\/execution-pipeline\.js/);
  assert.ok(!cmd.includes('inner-loop.js'), 'the retired workflow script path should not be named');
});

// ── run-presentation criterion 4: the launch leg passes --script-out, and the
// Workflow call's scriptPath is that spliced per-run script — never the canonical
// workflows/ file launched directly ──
test('commands/the-loop.md passes --script-out on the prepare-execution-context call, and scriptPath is bound to that path rather than the canonical workflow file', () => {
  const cmd = read('commands/the-loop.md');

  assert.match(cmd, /prepare-execution-context --features <id,id,…> --target-branch <ref>.*--script-out/);
  assert.match(cmd, /scriptPath.*--script-out/);
  assert.ok(
    !/scriptPath[^\n]*\$CLAUDE_PLUGIN_ROOT\/workflows\/execution-pipeline\.js/.test(cmd),
    'scriptPath should never bind directly to the canonical workflows/ file',
  );
});

// ── criterion 3: interview replaces grilling in prose; the literal /grilling
// binding id survives wherever the port's default binding is named ──
test('interview replaces grilling in prose, except the literal /grilling binding id', () => {
  const files = ['skills/define/SKILL.md', 'skills/design/SKILL.md', 'commands/the-loop.md'];
  for (const f of files) {
    const text = read(f);
    assert.ok(!/\bgrilling\b/.test(text.replaceAll('/grilling', '')),
      `${f} should use "interview", not "grilling", outside the literal /grilling binding id`);
  }
  const define = read('skills/define/SKILL.md');
  assert.match(define, /\/grilling/, 'the literal /grilling binding id should survive');
  assert.match(define, /interview port/);
  assert.match(define, /bound interview skill/);
});

// ── criterion 4: the code-quality baseline carries the distilled naming-standard
// line, and mapped terms (probe pack→runbook, dictionary→glossary, Brief→brief,
// design amendment→amendment, and the paths they touch) are swept through the
// skill and command prose actually reachable in this footprint ──
test('the code-quality baseline carries the distilled naming rule, and mapped terms are swept through skill and command prose', () => {
  const codeQuality = read('skills/code-quality/SKILL.md');
  assert.match(codeQuality, /identifiers follow the naming standard's glossary rules/i);
  assert.match(codeQuality, /no coined\s+proper nouns/i);

  const allText = [
    ...readdirSync('skills', { recursive: true })
      .filter((f) => f.endsWith('.md'))
      .map((f) => read(`skills/${f}`)),
    read('commands/the-loop.md'),
  ].join('\n');

  // old terms gone (outside this footprint's reach)
  for (const stale of ['docs/design/design.md', 'docs/design/graph.md', 'docs/design/features/', 'docs/probes/', 'docs/rca/', 'docs/dictionary/DICTIONARY.md', 'design amendment']) {
    assert.ok(!allText.includes(stale), `stale term "${stale}" should be swept from skills/ and commands/`);
  }
  // new terms present
  for (const fresh of ['docs/architecture.md', 'docs/feature-graph.md', 'docs/designs/', 'docs/runbooks/', 'docs/bugs/', 'docs/glossary.md']) {
    assert.ok(allText.includes(fresh), `renamed path "${fresh}" should appear in skills/ or commands/`);
  }
});
