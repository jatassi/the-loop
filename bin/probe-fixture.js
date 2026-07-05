#!/usr/bin/env node
// bringUp for the fixture-repo probe (this repo's runtime-probe binding): create a
// temp git repo seeded as a plausible v2 target repo and print its path. Exercises
// then drive `node bin/the-loop.js` (and, sparingly, headless agents) against it from
// the outside, as a user would; teardown is `rm -rf` of the printed path.
// Lives in bin/, not test/ — Node's test runner executes every .js under test/**.
//
//   probe-fixture             populated: graph.md + design.md + features/, committed on main
//   probe-fixture empty       bare `git init` repo (cold-start exercises)

import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const GRAPH = `# Fixture project — Feature graph

A two-feature target repo for probe exercises: one validated feature, one designed
behind it.

## Feature graph

\`\`\`yaml
design_version: 1
features:
  - id: greet-core
    title: Core greeting module
    status: validated
    depends_on: []
    acceptance: greet(name) returns a greeting containing the name
  - id: greet-cli
    title: CLI entry point
    status: designed
    depends_on: [greet-core]
    acceptance: [running the CLI prints a greeting to stdout, an empty name exits 1 with a usage line]
\`\`\`
`;

const DESIGN = `# Fixture project — Design

A tiny greeting tool: a pure core module (greet-core) that the CLI entry point
(greet-cli) wraps. Seeded by the probe as a plausible target repo for runtime
exercises; the recorded bindings below are what the launch assembler excerpts.

## Runtime probe

Run \`node bin/greet.js Ada\` and expect a greeting containing "Ada" on stdout.

## Ship recipe

Tag the repo and push main; there is no deploy target.
`;

const FEATURE_DOCS = {
  'greet-core': `# greet-core — design

greet(name) returns a greeting string containing the name. Pure — no I/O; the CLI
wraps it.
`,
  'greet-cli': `# greet-cli — design

bin/greet.js parses argv and prints greet(name) to stdout. An empty name is a usage
error (exit 1).
`,
};

const variant = process.argv[2] || 'populated';
if (!['populated', 'empty'].includes(variant)) {
  process.stderr.write('usage: probe-fixture [populated|empty]\n');
  process.exit(1);
}

const root = mkdtempSync(path.join(tmpdir(), 'loop-probe-'));
const git = (cmd) => execSync(cmd, { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
git('git init -q -b main');
git('git config user.email probe@the-loop.local');
git('git config user.name "loop probe"');

if (variant === 'populated') {
  mkdirSync(path.join(root, 'docs/design/features'), { recursive: true });
  writeFileSync(path.join(root, 'docs/design/graph.md'), GRAPH);
  writeFileSync(path.join(root, 'docs/design/design.md'), DESIGN);
  for (const [id, text] of Object.entries(FEATURE_DOCS)) {
    writeFileSync(path.join(root, `docs/design/features/${id}.md`), text);
  }
  git('git add -A');
  git('git commit -qm "fixture: seeded target repo"');
}

process.stdout.write(`${root}\n`);
