// The fixture-repo probe's bringUp: the fixture must be a plausible target repo —
// spine parses and validates its seeded design, /the-loop's orient() reads it as an
// active project, and the empty variant reads as cold-start.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { detectState } from '../src/entry.js';

const bringUp = (variant = '') => execSync(`node bin/probe-fixture.js ${variant}`, { encoding: 'utf8' }).trim();

test('populated fixture: a committed target repo whose design.md passes spine check', () => {
  const root = bringUp();
  try {
    assert.ok(existsSync(path.join(root, '.git')));
    const check = execSync(`node bin/spine.js check ${path.join(root, 'docs/design/design.md')}`, { encoding: 'utf8' });
    assert.match(check, /^OK/);
    assert.equal(detectState(root).mode, 'active');
    const clean = execSync('git status --porcelain', { cwd: root, encoding: 'utf8' });
    assert.equal(clean, '');
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
