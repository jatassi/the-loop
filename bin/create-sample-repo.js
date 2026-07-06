#!/usr/bin/env node
// bringUp for the fixture-repo probe (this repo's validation-runbook binding): create
// a temp git repo seeded as a plausible v2 target repository and print its path. Exercises
// then drive `node bin/the-loop.js` (and, sparingly, headless agents) against it from
// the outside, as a user would; teardown is `rm -rf` of the printed path.
// Lives in bin/, not test/ — Node's test runner executes every .js under test/**.
//
//   create-sample-repo         populated: feature-graph.md + architecture.md +
//                               designs/, committed on main
//   create-sample-repo empty   bare `git init` repo (unconfigured exercises)

import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const GRAPH = `# Fixture project — Feature graph

A three-feature target repository for probe exercises: one validated feature, one
designed behind it, and one proposed record (backlog stage, no design doc yet) so
the validation runbook can exercise the not-designed and missing-acceptance gates
against it.

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
  - id: greet-farewell
    title: Farewell command
    status: proposed
\`\`\`
`;

const DESIGN = `# Fixture project — Architecture

A tiny greeting tool: a pure core module (greet-core) that the CLI entry point
(greet-cli) wraps. Seeded by the probe as a plausible target repository for validation
exercises; the recorded bindings below are what the execution-context assembler
excerpts.

## Validation runbook

Run \`node bin/greet.js Ada\` and expect a greeting containing "Ada" on stdout.

## Release runbook

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
  process.stderr.write('usage: create-sample-repo [populated|empty]\n');
  process.exit(1);
}

const root = mkdtempSync(path.join(tmpdir(), 'loop-probe-'));
const git = (cmd) => execSync(cmd, { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
git('git init -q -b main');
git('git config user.email probe@the-loop.local');
git('git config user.name "loop probe"');

if (variant === 'populated') {
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  writeFileSync(path.join(root, 'docs/feature-graph.md'), GRAPH);
  writeFileSync(path.join(root, 'docs/architecture.md'), DESIGN);
  for (const [id, text] of Object.entries(FEATURE_DOCS)) {
    mkdirSync(path.join(root, `docs/designs/${id}`), { recursive: true });
    writeFileSync(path.join(root, `docs/designs/${id}/design.md`), text);
  }
  git('git add -A');
  git('git commit -qm "fixture: seeded target repository"');
}

process.stdout.write(`${root}\n`);
