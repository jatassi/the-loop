// agent-surface-trim's acceptance, executable: a shipped surface may lean on the
// `the-loop` binary's behavior and nothing else. A consuming project installs
// `plugin/` without this repo, so a decision-record number or a pointer at a sibling
// agent definition resolves to nothing for its reader — phantom authority.
//
// This is a policy invariant, not a prose pin: it asserts what a surface may not
// depend on, never how any sentence is worded, so editorial passes leave it alone.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const SHIPPED = ['plugin/agents', 'plugin/skills', 'plugin/shared'];

/** Every markdown file the plugin ships, as [path, text]. */
const shippedMarkdown = () => {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = path.join(dir, entry);
      if (statSync(p).isDirectory()) {
        walk(p);
      } else if (p.endsWith('.md')) {
        out.push([p, readFileSync(p, 'utf8')]);
      }
    }
  };
  for (const root of SHIPPED) {
    walk(root);
  }
  return out;
};

test('no shipped surface cites a decision record the reader cannot open', () => {
  const offenders = shippedMarkdown()
    .filter(([, text]) => /\bADR-\d{4}\b/.test(text))
    .map(([p]) => p);
  assert.deepEqual(
    offenders,
    [],
    'a consuming project has no docs/adr/ — state the claim without the citation',
  );
});

test("no shipped surface points at another agent definition or this repo's own records", () => {
  const offenders = [];
  for (const [p, text] of shippedMarkdown()) {
    // A sibling agent definition is unreachable: a spawned worker is handed its own
    // body as a system prompt and cannot resolve a path to anyone else's.
    if (/\bagents\/[a-z-]+\.md/.test(text)) {
      offenders.push(`${p}: points at a sibling agent definition`);
    }
    // This repo's own design ancestry ships nowhere.
    if (/docs\/adr\/\d|docs\/plans\/the-loop/.test(text)) {
      offenders.push(`${p}: points at this repo's own records`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("a consuming project's own docs/ paths survive — they are not this repo's", () => {
  // The inverse guard: the sweep above must never eat the paths the loop *creates*
  // in the project that installs it. These are correct references, not defects.
  const design = readFileSync('plugin/skills/design/SKILL.md', 'utf8');
  assert.match(design, /docs\/architecture\.md/, "design must still name the project's architecture doc");
  assert.match(design, /docs\/adr\//, "design must still offer the project its own docs/adr/");
  const usingTheLoop = readFileSync('plugin/skills/using-the-loop/SKILL.md', 'utf8');
  assert.match(usingTheLoop, /docs\/feature-graph\.json/, 'the orientation table must still name the graph');
});
