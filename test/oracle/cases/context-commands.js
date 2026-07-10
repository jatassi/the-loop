// Case corpus: prepare-execution-context (incl. --script-out) and worktree-create/remove.
// Disposable fixtures only; every assertion is subprocess-driven via the oracle driver.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFixturePair, EXAMPLE_DEFINITION } from '../fixtures.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const PLUGIN_ROOT = path.join(REPO_ROOT, 'plugin');
const CLI_BIN = path.join(PLUGIN_ROOT, 'bin/the-loop.js');

/** Per-binary `cli` value the JS prepare-execution-context command stamps (PLUGIN_ROOT from the binary). */
const JS_CLI = `node "${path.join(PLUGIN_ROOT, 'bin/the-loop.js')}"`;

/** Clean project settings so plugin model-binding defaults + registry validate. */
const CLEAN_SETTINGS = { 'the-loop': {} };

/**
 * @param {Partial<typeof EXAMPLE_DEFINITION>} [patch]
 * @returns {typeof EXAMPLE_DEFINITION}
 */
function definition(patch = {}) {
  return {
    ...EXAMPLE_DEFINITION,
    settings: CLEAN_SETTINGS,
    ...patch,
  };
}

/** @param {'js' | 'rust'} target @param {{ yamlRepo: string, jsonRepo: string }} pair */
function repoFor(target, pair) {
  return target === 'rust' ? pair.jsonRepo : pair.yamlRepo;
}

/**
 * Disposable fixture pair + isolated HOME (never read the developer's ~/.claude).
 * @param {typeof EXAMPLE_DEFINITION} def
 * @param {'js' | 'rust'} target
 */
function setupFixturePair(def, target) {
  const pair = buildFixturePair(def);
  const home = mkdtempSync(path.join(tmpdir(), 'loop-oracle-home-'));
  const cwd = repoFor(target, pair);
  return {
    cwd,
    env: { HOME: home },
    cleanup: () => {
      rmSync(pair.yamlRepo, { recursive: true, force: true });
      rmSync(pair.jsonRepo, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    },
  };
}

/** Throwaway git repo for worktree cases (not the dual-format fixture generator). */
function gitWorktreeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'loop-oracle-wt-'));
  writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'oracle@the-loop.local');
  git('config', 'user.name', 'loop oracle');
  git('add', '-A');
  git('commit', '-qm', 'seed');
  return root;
}

/** Spawn the real JS CLI in setup (subprocess only — never import command bodies). */
function spine(cwd, args, env) {
  return execFileSync('node', [CLI_BIN, ...args], { cwd, encoding: 'utf8', env });
}

const WORKTREE_BRANCH = 'loop/widget';
const WORKTREE_REL = path.join('.claude/worktrees', 'loop-widget');

/**
 * Expected --script-out bytes: what the reference JS CLI emits for the same scope
 * and target — derived by subprocess in a scratch fixture (never an in-process
 * import), so the byte-identity contract is asserted against the reference
 * implementation's real output. The splice depends only on the canonical script,
 * scope, and target branch, so the scratch repo's content is irrelevant.
 */
function expectedSplicedScript(scope, targetBranch) {
  const pair = buildFixturePair(definition());
  const home = mkdtempSync(path.join(tmpdir(), 'loop-oracle-home-'));
  try {
    spine(pair.yamlRepo, [
      'prepare-execution-context',
      '--features', scope.join(','),
      '--target-branch', targetBranch,
      '--script-out', 'expected-spliced.js',
    ], { ...process.env, HOME: home });
    return readFileSync(path.join(pair.yamlRepo, 'expected-spliced.js'), 'utf8');
  } finally {
    rmSync(pair.yamlRepo, { recursive: true, force: true });
    rmSync(pair.jsonRepo, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

/** Refusal gate: empty stdout, present stderr, exit 1. */
const GATE_REFUSAL = { exitCode: 1, stdoutBytes: '', stderr: 'present' };

/** @param {(cwd: string) => string | void} check */
function effect(check) {
  return (cwd) => check(cwd);
}

// ── prepare-execution-context ───────────────────────────────────────────────

const prepareCases = [
  {
    command: 'prepare-execution-context',
    scenario: 'happy path — preparedAt shape + per-binary cli',
    argv: ['prepare-execution-context', '--features', 'alpha', '--target-branch', 'main'],
    setup: (ctx) => setupFixturePair(definition(), ctx.target),
    expect: (ctx) => ({
      exitCode: 0,
      iso8601: ['preparedAt'],
      cli: {
        path: 'cli',
        value: ctx.target === 'rust' ? 'the-loop' : JS_CLI,
      },
    }),
  },
  {
    command: 'prepare-execution-context',
    scenario: 'gate refusal — invalid graph (dangling dependency)',
    argv: ['prepare-execution-context', '--features', 'alpha', '--target-branch', 'main'],
    setup: (ctx) => setupFixturePair(definition({
      features: [
        {
          id: 'alpha',
          title: 'Alpha feature',
          status: 'designed',
          depends_on: ['ghost'],
          acceptance: ['alpha criterion one'],
        },
      ],
      plans: {},
    }), ctx.target),
    expect: GATE_REFUSAL,
  },
  {
    command: 'prepare-execution-context',
    scenario: 'gate refusal — scope gate (unknown feature id)',
    argv: ['prepare-execution-context', '--features', 'ghost', '--target-branch', 'main'],
    setup: (ctx) => setupFixturePair(definition(), ctx.target),
    expect: GATE_REFUSAL,
  },
  {
    command: 'prepare-execution-context',
    scenario: 'gate refusal — plan validation (bad-covers-ref)',
    argv: ['prepare-execution-context', '--features', 'alpha', '--target-branch', 'main'],
    setup: (ctx) => setupFixturePair(definition({
      plans: {
        alpha: {
          design_version: 1,
          tasks: [
            {
              id: 'alpha-core',
              title: 'Implement alpha core',
              // 0-based in the definition; YAML emit adds 1 → criterion #100 with only 2 criteria
              covers: [99],
              acceptance: 'alpha core satisfies both feature criteria',
              footprint: ['src/alpha.js'],
              size: 's',
              judgment_level: 'standard',
              depends_on: [],
            },
          ],
        },
      },
    }), ctx.target),
    expect: GATE_REFUSAL,
  },
  {
    command: 'prepare-execution-context',
    scenario: 'gate refusal — model-binding validation (unregistered-executor)',
    argv: ['prepare-execution-context', '--features', 'alpha', '--target-branch', 'main'],
    setup: (ctx) => setupFixturePair(definition({
      settings: {
        'the-loop': {
          modelBindings: {
            'build.standard': { model: 'sonnet', executor: 'no-such-executor' },
          },
        },
      },
    }), ctx.target),
    expect: GATE_REFUSAL,
  },
  {
    command: 'prepare-execution-context',
    scenario: '--script-out writes spliced workflow script byte-identical to expectation',
    argv: [
      'prepare-execution-context',
      '--features', 'alpha',
      '--target-branch', 'main',
      '--script-out', 'spliced-workflow.js',
    ],
    setup: (ctx) => setupFixturePair(definition(), ctx.target),
    // Computed lazily at case run time — the expectation itself shells out to the
    // reference JS CLI.
    expect: () => ({
      exitCode: 0,
      iso8601: ['preparedAt'],
      fileBytes: {
        'spliced-workflow.js': expectedSplicedScript(['alpha'], 'main'),
      },
    }),
  },
  {
    command: 'prepare-execution-context',
    scenario: 'upstream scope-gate refusal with --script-out writes nothing',
    argv: [
      'prepare-execution-context',
      '--features', 'ghost',
      '--target-branch', 'main',
      '--script-out', 'should-not-exist.js',
    ],
    setup: (ctx) => setupFixturePair(definition(), ctx.target),
    expect: {
      ...GATE_REFUSAL,
      effects: effect((cwd) => {
        if (existsSync(path.join(cwd, 'should-not-exist.js'))) {
          return 'script-out path was created despite upstream gate refusal';
        }
      }),
    },
  },
];

// ── worktree-create / worktree-remove ───────────────────────────────────────

const worktreeCases = [
  {
    command: 'worktree-create',
    scenario: 'create-new — path exists on disk with created:true',
    argv: ['worktree-create', WORKTREE_BRANCH, '--base-branch', 'main'],
    setup: () => {
      const root = gitWorktreeFixture();
      return { cwd: root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
    },
    expect: {
      exitCode: 0,
      stdout: { path: WORKTREE_REL, branch: WORKTREE_BRANCH, created: true },
      effects: effect((cwd) => {
        if (!existsSync(path.join(cwd, WORKTREE_REL))) {
          return `worktree directory missing: ${WORKTREE_REL}`;
        }
      }),
    },
  },
  {
    command: 'worktree-create',
    scenario: 'idempotent re-create — same path/branch with created:false',
    argv: ['worktree-create', WORKTREE_BRANCH],
    setup: () => {
      const root = gitWorktreeFixture();
      spine(root, ['worktree-create', WORKTREE_BRANCH, '--base-branch', 'main']);
      return { cwd: root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
    },
    expect: {
      exitCode: 0,
      stdout: { path: WORKTREE_REL, branch: WORKTREE_BRANCH, created: false },
    },
  },
  {
    command: 'worktree-create',
    scenario: 'refusal — missing branch argument exits 1 with usage on stderr',
    argv: ['worktree-create'],
    setup: () => {
      const root = gitWorktreeFixture();
      return { cwd: root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
    },
    expect: {
      exitCode: 1,
      stdoutBytes: '',
      stderr: 'present',
      effects: effect((cwd) => {
        if (existsSync(path.join(cwd, '.claude/worktrees'))) {
          return 'unexpected worktrees dir after refuse-on-missing-branch';
        }
      }),
    },
  },
  {
    command: 'worktree-remove',
    scenario: 'remove by path — directory gone, {removed: path}',
    argv: ['worktree-remove', WORKTREE_REL],
    setup: () => {
      const root = gitWorktreeFixture();
      spine(root, ['worktree-create', WORKTREE_BRANCH, '--base-branch', 'main']);
      return { cwd: root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
    },
    expect: {
      exitCode: 0,
      stdout: { removed: WORKTREE_REL },
      effects: effect((cwd) => {
        if (existsSync(path.join(cwd, WORKTREE_REL))) {
          return `worktree directory still exists after remove-by-path: ${WORKTREE_REL}`;
        }
      }),
    },
  },
  {
    command: 'worktree-remove',
    scenario: 'remove by branch name — directory gone',
    argv: ['worktree-remove', WORKTREE_BRANCH],
    setup: () => {
      const root = gitWorktreeFixture();
      spine(root, ['worktree-create', WORKTREE_BRANCH, '--base-branch', 'main']);
      return { cwd: root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
    },
    expect: {
      exitCode: 0,
      // git porcelain returns an absolute path; assert presence of removed field + disk effect
      stdoutMatch: /"removed"\s*:/,
      effects: effect((cwd) => {
        if (existsSync(path.join(cwd, WORKTREE_REL))) {
          return `worktree directory still exists after remove-by-branch: ${WORKTREE_REL}`;
        }
      }),
    },
  },
  {
    command: 'worktree-remove',
    scenario: 'refusal — unknown path-or-branch exits 1 with stderr naming it',
    argv: ['worktree-remove', 'loop/nonexistent'],
    setup: () => {
      const root = gitWorktreeFixture();
      return { cwd: root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
    },
    expect: {
      exitCode: 1,
      stdoutBytes: '',
      stderr: 'present',
      effects: effect((cwd) => {
        if (existsSync(path.join(cwd, '.claude/worktrees'))) {
          return 'unexpected worktrees dir after refuse-on-unknown';
        }
      }),
    },
  },
];

export const cases = [...prepareCases, ...worktreeCases];
