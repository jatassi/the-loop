#!/usr/bin/env node
// bringUp for the fixture-repo probe (this repo's runtime-probe binding): create a
// temp git repo seeded as a plausible target repo and print its path. Exercises then
// drive `node bin/spine.js` (and, sparingly, headless agents) against it from the
// outside, as a user would; teardown is `rm -rf` of the printed path.
// Lives in bin/, not test/ — Node's test runner executes every .js under test/**.
//
//   probe-fixture             populated: seeded design.md + ledger, committed
//   probe-fixture empty       bare `git init` repo (cold-start exercises)

import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DESIGN = `# Fixture project — Design

A two-feature target repo for probe exercises: one validated feature, one in flight.

## Feature graph

\`\`\`yaml
design_version: 1
features:
  - id: greet-core
    title: Core greeting module
    status: validated
    depends_on: []
    interfaces: [greeting-api]
    acceptance: greet(name) returns a greeting containing the name
  - id: greet-cli
    title: CLI entry point
    status: building
    depends_on: [greet-core]
    interfaces: [greeting-api]
    acceptance: running the CLI prints a greeting to stdout
\`\`\`

## Key interface contracts

\`\`\`yaml
contracts:
  - id: greeting-api
    body: |
      greet(name) → string   # pure; the CLI wraps it
\`\`\`
`;

const LEDGER = `# Ledger — fixture project · projected from design.md

## What this is
A fixture target repo, seeded by the probe for runtime exercises.

## Where we are
- 1 / 2 validated (greet-core) · 1 / 2 building (greet-cli)

## What needs you
Nothing parked.

## What's next
Finish greet-cli.
`;

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
  mkdirSync(path.join(root, 'docs/design'), { recursive: true });
  mkdirSync(path.join(root, 'docs/ledger'), { recursive: true });
  writeFileSync(path.join(root, 'docs/design/design.md'), DESIGN);
  writeFileSync(path.join(root, 'docs/ledger/ledger.md'), LEDGER);
  git('git add -A');
  git('git commit -qm "fixture: seeded target repo"');
}

process.stdout.write(`${root}\n`);
