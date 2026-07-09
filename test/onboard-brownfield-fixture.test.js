// The brownfield fixture's contract, proven both ways: it carries real infrastructure
// (a package.json with test and lint scripts, source, a test, and CI) AND it carries
// no loop artifact — so onboard's scenario detection reads it as brownfield, not
// unconfigured-from-scratch or already-onboarded. detectState() is the real product
// function that scenario detection is built on (docs/designs/onboard/design.md).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { detectState } from '../plugin/src/propose-next-action.js';

const FIXTURE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/onboard-brownfield');

test('brownfield fixture carries real infrastructure: package.json test/lint scripts, source, a test, and a CI workflow', () => {
  const pkgPath = path.join(FIXTURE_ROOT, 'package.json');
  assert.ok(existsSync(pkgPath), 'fixture must have a package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  assert.ok(pkg.scripts?.test?.length > 0, 'package.json must declare a non-empty test script');
  assert.ok(pkg.scripts?.lint?.length > 0, 'package.json must declare a non-empty lint script');

  assert.ok(existsSync(path.join(FIXTURE_ROOT, 'src/greet.js')), 'fixture must carry at least one source file');
  assert.ok(existsSync(path.join(FIXTURE_ROOT, 'test/greet.test.js')), 'fixture must carry at least one test file');
  assert.ok(existsSync(path.join(FIXTURE_ROOT, '.github/workflows/ci.yml')), 'fixture must carry a CI workflow');
});

test('brownfield fixture carries no loop artifact, so scenario detection reads it as brownfield (unconfigured, no design/graph/settings)', () => {
  assert.ok(!existsSync(path.join(FIXTURE_ROOT, 'docs/feature-graph.md')), 'fixture must not have a feature graph');
  assert.ok(!existsSync(path.join(FIXTURE_ROOT, 'docs/architecture.md')), 'fixture must not have architecture.md');
  assert.ok(!existsSync(path.join(FIXTURE_ROOT, '.claude/settings.json')), 'fixture must not have project the-loop settings');
  assert.ok(!existsSync(path.join(FIXTURE_ROOT, '.claude/settings.local.json')), 'fixture must not have local the-loop settings');
  assert.ok(!existsSync(path.join(FIXTURE_ROOT, '.claude')), 'fixture must not have a .claude directory at all');

  const state = detectState(FIXTURE_ROOT);
  assert.equal(state.mode, 'unconfigured');
  assert.equal(state.hasDesign, false);
  assert.equal(state.hasGraph, false);
  assert.equal(state.hasBrief, false);
});
