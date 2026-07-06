// The fixture-repo probe's bringUp: the fixture must be a plausible v2 target repository —
// spine parses and validates its seeded feature-graph.md, /the-loop's machineOrientation() reads
// it as a configured project, and the empty variant reads as unconfigured.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { detectState, machineOrientation } from '../src/propose-next-action.js';

const bringUp = (variant = '') => execSync(`node bin/create-sample-repo.js ${variant}`, { encoding: 'utf8' }).trim();

test('populated fixture: a committed repo on main whose feature-graph.md passes spine check and orients configured', () => {
  const root = bringUp();
  try {
    assert.ok(existsSync(path.join(root, '.git')));
    const check = execSync(`node bin/the-loop.js check ${path.join(root, 'docs/feature-graph.md')}`, { encoding: 'utf8' });
    assert.match(check, /^OK +3 features/);

    const o = machineOrientation(root);
    assert.equal(o.mode, 'configured');
    assert.deepEqual(o.proposal, {
      kind: 'advance-eligible-set', features: ['greet-cli'],
      summary: '1 feature(s) are dependency-ready to advance',
    }); // greet-core validated, greet-cli designed behind it; greet-farewell (proposed) is unrelated backlog

    assert.ok(existsSync(path.join(root, 'docs/designs/greet-core/design.md')));
    assert.ok(existsSync(path.join(root, 'docs/designs/greet-cli/design.md')));
    assert.equal(execSync('git branch --show-current', { cwd: root, encoding: 'utf8' }).trim(), 'main');
    assert.equal(execSync('git status --porcelain', { cwd: root, encoding: 'utf8' }), ''); // fully committed
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('empty fixture: a bare repo that reads as unconfigured', () => {
  const root = bringUp('empty');
  try {
    assert.ok(existsSync(path.join(root, '.git')));
    assert.equal(detectState(root).mode, 'unconfigured');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
