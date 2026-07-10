// fix-drive-executor-lifecycle: drive.md's executor-lifecycle guidance lost healthy
// executor runs three ways — a default 120s foreground Bash timeout SIGKILLed
// executors mid-work, the drive's own turn/output enforcement ended while a
// backgrounded executor was still writing (finished work left uncommitted), and
// drives relaunched quiet-but-working executors with byte-identical briefs. The fix
// is prose in the drive agent doc, exercised only in live headless executor runs, so
// — the same way merge-posture.test.js pins the merge posture straight off the
// surface text — these pin each criterion's guidance off drive.md's own source.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Collapse the doc's line-wrapping so assertions read the guidance content, not its
// column width — a criterion's guidance is the same whether or not a phrase straddles
// a wrap.
const text = readFileSync('plugin/agents/drive.md', 'utf8').replaceAll(/\s+/g, ' ');

// Criterion 1 — the executor call carries an explicit ceiling timeout and/or
// backgrounds the run, so a 120–160s executor never dies to the Bash default timeout.
test('criterion 1: concrete ceiling timeout and background-by-default replace the vague "generous timeout"', () => {
  assert.ok(!/generous timeout/i.test(text), 'the vague "generous timeout" wording must be gone');
  assert.ok(text.includes('120000'), 'names the Bash default timeout (120000ms) as the value to override so the failure is legible');
  assert.ok(text.includes('600000'), 'names the tool ceiling (600000ms) to pass explicitly');
  assert.match(text, /explicit `timeout`/, 'instructs an explicit timeout parameter on the executor Bash call');
  assert.match(text, /background[\s\S]{0,120}default|default[\s\S]{0,120}background/i, 'makes background-plus-long-wait the default for compile/suite-running tasks, not the rare exception');
});

// Criterion 2 — a backgrounded executor still running as the drive's budget nears
// exhaustion: the drive proactively returns a retry-lane blocked with a
// self-contained worktree-adoption note before enforcement forces an ad-hoc return.
test('criterion 2: proactive retry-lane return with a self-contained worktree-adoption note before forced cut-off', () => {
  assert.ok(text.includes('proactively return `blocked` kind `environment`'), 'proactive blocked/environment (the retry lane) return, not an enforcement-forced ad-hoc one');
  assert.ok(text.includes('retry lane'), 'names the retry lane the return lands in');
  assert.ok(text.includes('worktree-adoption note'), 'the return carries a worktree-adoption note');
  for (const field of ['worktree path', 'branch', 'footprint', 'pid', 'verification commands still owed']) {
    assert.ok(text.includes(field), `the adoption note must name the ${field}`);
  }
});

test('criterion 2: a drive finding an intact worktree adopts it and still verifies before committing', () => {
  assert.ok(/adopt it/.test(text), 'a drive whose worktree already holds a finished-or-running executor adopts it rather than cold-starting');
  assert.ok(text.includes('not a license to skip verification'), 'adoption still re-runs the build bar before committing');
});

// Criterion 3 — a prior executor whose process is alive or whose output is still
// growing is waited on, never relaunched with a byte-identical brief, and the drive
// records the liveness/output-growth check it made.
test('criterion 3: a stalled-vs-working check gates the retry, and the drive records it', () => {
  assert.match(text, /pid[\s\S]{0,60}exited|no longer running/, 'checks process liveness (pid exited) before treating an attempt as failed');
  assert.match(text, /still[\s-]advancing|still growing/, 'checks output-file growth (diff still advancing) before relaunching');
  assert.ok(text.includes('byte-identical brief'), 'a live-or-advancing executor is never relaunched with a byte-identical brief');
  assert.ok(text.includes('Record the liveness/output-growth check'), 'the drive records the liveness/output-growth check it made');
  assert.ok(text.includes('concurrent identical brief'), 'names the concurrent-identical-brief hazard so a second executor is not started against a worktree an equivalent brief already drives');
});
