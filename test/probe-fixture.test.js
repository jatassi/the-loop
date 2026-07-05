// The fixture-repo probe's bringUp: the fixture must be a plausible v2 target repo —
// spine parses and validates its seeded graph.md, /the-loop's orient() reads it as an
// active project, and the empty variant reads as cold-start.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { detectState, orient } from '../src/entry.js';

const bringUp = (variant = '') => execSync(`node bin/probe-fixture.js ${variant}`, { encoding: 'utf8' }).trim();

test('populated fixture: a committed repo on main whose graph.md passes spine check and orients active', () => {
  const root = bringUp();
  try {
    assert.ok(existsSync(path.join(root, '.git')));
    const check = execSync(`node bin/the-loop.js check ${path.join(root, 'docs/design/graph.md')}`, { encoding: 'utf8' });
    assert.match(check, /^OK +2 features/);

    const o = orient(root);
    assert.equal(o.mode, 'active');
    assert.deepEqual(o.proposal, {
      kind: 'advance-frontier', features: ['greet-cli'],
      summary: '1 feature(s) are dependency-ready to advance',
    }); // greet-core validated, greet-cli designed behind it

    assert.ok(existsSync(path.join(root, 'docs/design/features/greet-core.md')));
    assert.ok(existsSync(path.join(root, 'docs/design/features/greet-cli.md')));
    assert.equal(execSync('git branch --show-current', { cwd: root, encoding: 'utf8' }).trim(), 'main');
    assert.equal(execSync('git status --porcelain', { cwd: root, encoding: 'utf8' }), ''); // fully committed
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('empty fixture: a bare repo that reads as cold-start', () => {
  const root = bringUp('empty');
  try {
    assert.ok(existsSync(path.join(root, '.git')));
    assert.equal(detectState(root).mode, 'cold-start');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
