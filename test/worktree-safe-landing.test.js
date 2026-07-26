// fix-landing-into-checked-out-target — the target branch of a run is always
// checked out in the primary worktree, so both prescribed publish recipes
// (record's prose "fast-forward it", validate's `git fetch . <src>:<target>`) are
// unusable every time, and record's own improvised fallback (`git update-ref`)
// moves the branch pointer without touching the primary worktree's index or
// working tree — silently staging a revert of the commit it just published.
//
// The publish step is prose in an agent contract, not code a suite runs, so these
// tests prove two separate things per the mechanism the prose now prescribes:
//   - fixture tests execute the exact worktree-safe command (`git -C <repo-root>
//     merge --ff-only <branch>`) against the shape of repo the incident reproduced
//     (target checked out in the primary worktree, commit sitting in a linked
//     worktree) and assert the postconditions the criteria name: target advances,
//     porcelain is clean, the artifact is on disk, and the reflog shows a real
//     merge — not an empty-message ref move;
//   - text assertions on record.md/validate.md prove the prose actually prescribes
//     that command (and only that command) to the agents that carry it out.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });

function initRepo() {
  const wrapper = mkdtempSync(path.join(tmpdir(), 'worktree-safe-landing-'));
  const root = path.join(wrapper, 'primary');
  git(wrapper, 'init', '-q', '-b', 'main', 'primary');
  git(root, 'config', 'user.email', 'fixture@the-loop.local');
  git(root, 'config', 'user.name', 'worktree-safe-landing fixture');
  writeFileSync(path.join(root, 'base.txt'), 'base\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'base');
  return { wrapper, root };
}

// The worktree-safe landing command the fix design prescribes for both legs,
// invoked exactly as an agent would: `-C <repo-root>`, never a `cd` into the
// linked worktree first.
const landingCommand = (repoRoot, branch) => execFileSync(
  'git',
  ['-C', repoRoot, 'merge', '--ff-only', branch],
  { encoding: 'utf8' },
);

// ── criteria 1 & 3: record's shape — a commit sitting in a linked worktree,
// target checked out in the primary worktree, publish via the worktree-safe
// command ──
test('worktree-safe landing command fast-forwards a linked worktree\'s commit onto the checked-out target, leaving the primary worktree clean with the artifact on disk and a real merge in the reflog', () => {
  const { wrapper, root } = initRepo();
  const linked = path.join(wrapper, 'record-temp');
  git(root, 'worktree', 'add', '-q', linked, '-b', 'record-temp');
  writeFileSync(path.join(linked, 'run.json'), 'artifact\n');
  git(linked, 'add', '-A');
  git(linked, 'commit', '-qm', 'calibration: run 2026-07-25-1');
  const published = git(linked, 'rev-parse', 'record-temp').trim();

  landingCommand(root, 'record-temp');

  assert.equal(git(root, 'rev-parse', 'main').trim(), published, 'main should advance to the published commit');
  assert.equal(git(root, 'status', '--porcelain').trim(), '', 'primary worktree should be clean after publish');
  assert.ok(existsSync(path.join(root, 'run.json')), 'artifact should exist on disk in the primary worktree');

  const reflog = git(root, 'reflog', 'show', 'main');
  const latest = reflog.split('\n', 1)[0];
  assert.match(latest, /Fast-forward/, 'reflog entry should be a real merge, not an empty-message ref move');
  const headReflog = git(root, 'reflog');
  assert.ok(headReflog.split('\n', 1)[0].includes(published.slice(0, 7)), 'HEAD reflog should carry an entry for the published commit');
});

// ── criterion 2: the safe command refuses to move anything it can't
// fast-forward, so a properly-behaving leg observes a clean failure to report
// blocked on, rather than reaching for a ref-only fallback ──
test('worktree-safe landing command refuses a non-fast-forward publish and leaves the target and working tree untouched', () => {
  const { wrapper, root } = initRepo();
  const linked = path.join(wrapper, 'record-temp');
  git(root, 'worktree', 'add', '-q', linked, '-b', 'record-temp');
  writeFileSync(path.join(linked, 'run.json'), 'artifact\n');
  git(linked, 'add', '-A');
  git(linked, 'commit', '-qm', 'calibration: run 2026-07-25-1');

  // Target moves out from under the publish attempt.
  writeFileSync(path.join(root, 'divergent.txt'), 'divergent\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'target moved');
  const preAttempt = git(root, 'rev-parse', 'main').trim();

  assert.throws(() => landingCommand(root, 'record-temp'), 'non-fast-forward publish should fail rather than silently succeed');
  assert.equal(git(root, 'rev-parse', 'main').trim(), preAttempt, 'target ref should not move on a failed fast-forward');
  assert.equal(git(root, 'status', '--porcelain').trim(), '', 'a failed fast-forward should leave no partial state');
});

// ── criterion 4: validate's shape — an integration branch collapsed to a
// single squash commit, published with the same command, from the same
// primary worktree ──
test('worktree-safe landing command lands validate\'s squash commit and leaves the primary worktree clean', () => {
  const { wrapper, root } = initRepo();
  const integration = path.join(wrapper, 'integrate--feature');
  git(root, 'worktree', 'add', '-q', integration, '-b', 'integrate--feature');
  writeFileSync(path.join(integration, 'feature.txt'), 'feature\n');
  git(integration, 'add', '-A');
  git(integration, 'commit', '-qm', 'wip');
  const squashed = git(integration, 'rev-parse', 'integrate--feature').trim();

  landingCommand(root, 'integrate--feature');

  assert.equal(git(root, 'rev-parse', 'main').trim(), squashed, 'main should advance to the squash commit');
  assert.equal(git(root, 'status', '--porcelain').trim(), '', 'primary worktree should be clean after validate publishes');
});

// ── criterion 5: record.md and validate.md prescribe the same worktree-safe
// command, run from the repository root, and neither prescribes `git fetch .
// <src>:<target>` against a checked-out target ──
test('record.md and validate.md name the same worktree-safe landing command and drop the checked-out-target-incompatible fetch recipe', () => {
  const record = readFileSync('plugin/agents/record.md', 'utf8');
  const validate = readFileSync('plugin/agents/validate.md', 'utf8');

  const command = /git -C <repo-root> merge --ff-only/;
  assert.match(record, command, 'record.md should name the worktree-safe landing command');
  assert.match(validate, command, 'validate.md should name the worktree-safe landing command');

  const brokenFetchRecipe = /git fetch \. \S*:\S*/;
  assert.doesNotMatch(record, brokenFetchRecipe, 'record.md should not prescribe git fetch . <src>:<target>');
  assert.doesNotMatch(validate, brokenFetchRecipe, 'validate.md should not prescribe git fetch . <src>:<target>');
});

// ── criterion 2 (prose half) & criterion 6: record.md widens its blocked
// clause to any publish failure, names the ref-only moves it forbids, and
// verifies the landing before returning `recorded` ──
test('record.md forbids ref-only publish fallbacks and verifies the landing before returning recorded', () => {
  const text = readFileSync('plugin/agents/record.md', 'utf8');

  assert.match(text, /update-ref/, 'should name git update-ref as forbidden');
  assert.match(text, /branch -f/, 'should name git branch -f as forbidden');
  assert.match(text, /push --force/, 'should name git push --force as forbidden');
  assert.match(text, /fails? for any reason/i, 'blocked clause should cover any publish failure, not only "target moved"');

  assert.match(text, /status --porcelain/, 'should verify the primary worktree is clean before returning recorded');
  assert.match(text, /exist(s)? on disk/, 'should verify the artifact exists on disk before returning recorded');
});
