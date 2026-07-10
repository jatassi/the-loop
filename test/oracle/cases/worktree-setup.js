// Oracle cases for worktree-create bound-success and provisioning-refusal (ADR-0052).
// Self-contained: node builtins only. The rust-replatform corpus driver will readdir-
// discover this module and flat-map `cases` — no sibling imports, no harness on this
// branch yet. test/worktree-setup-oracle-cases.test.js executes these end-to-end here.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This file lives at test/oracle/cases/ — three ups reach the repo root.
export const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../plugin/bin/the-loop.js');

const git = (cwd, args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
};

/** Throwaway git repo with one commit and user identity configured. */
export function makeGitFixture(files = {}) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'oracle-worktree-setup-'));
  git(cwd, ['init', '-q', '-b', 'main']);
  git(cwd, ['config', 'user.email', 'oracle@the-loop.local']);
  git(cwd, ['config', 'user.name', 'oracle test']);
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(cwd, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-qm', 'seed']);
  const cleanup = () => { rmSync(cwd, { recursive: true, force: true }); };
  return { cwd, cleanup };
}

/** Spawn the JS CLI with absolute bin path (never depends on process cwd). */
export function runCli(argv, { cwd, env = process.env } = {}) {
  return spawnSync('node', [CLI, ...argv], {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

const worktreeRel = (branch) => path.join('.claude/worktrees', branch.replaceAll('/', '-'));

const loopSettings = (command) => JSON.stringify({
  'the-loop': { worktreeSetup: { command } },
});

function boundSetup(branch, command) {
  return () => {
    const fixture = makeGitFixture({
      'README.md': '# oracle fixture\n',
      '.claude/settings.json': loopSettings(command),
    });
    return fixture;
  };
}

const BOUND_BRANCH = 'loop/oracle-bound';
const REFUSE_BRANCH = 'loop/oracle-refuse';

export const cases = [
  {
    command: 'worktree-create',
    scenario: 'bound-success-runs-setup-in-worktree',
    argv: ['worktree-create', BOUND_BRANCH, '--base-branch', 'main'],
    setup: boundSetup(BOUND_BRANCH, 'echo provisioned > marker.txt'),
    expect: {
      exitCode: 0,
      stdout: {
        path: worktreeRel(BOUND_BRANCH),
        branch: BOUND_BRANCH,
        created: true,
      },
      // Provisioning runs with cwd = the new worktree root, not the fixture root.
      effects: (cwd) => {
        const marker = path.join(cwd, worktreeRel(BOUND_BRANCH), 'marker.txt');
        if (!existsSync(marker)) {
          return `expected provisioning marker at ${marker}`;
        }
      },
    },
  },
  {
    command: 'worktree-create',
    scenario: 'bound-failure-tears-down-worktree',
    argv: ['worktree-create', REFUSE_BRANCH, '--base-branch', 'main'],
    setup: boundSetup(REFUSE_BRANCH, 'exit 1'),
    expect: {
      exitCode: 1,
      stdoutBytes: '',
      stderr: 'present',
      // Teardown-on-failure: the worktree dir must not survive a provisioning exit.
      effects: (cwd) => {
        const dir = path.join(cwd, worktreeRel(REFUSE_BRANCH));
        if (existsSync(dir)) {
          return `expected worktree torn down at ${dir}`;
        }
      },
    },
  },
];
