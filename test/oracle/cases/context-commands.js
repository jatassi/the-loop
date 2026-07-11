// Case corpus: prepare-execution-context (incl. --script-out) and worktree-create/remove.
// Disposable fixtures only; every assertion is subprocess-driven via the oracle driver.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFixtureRepo, EXAMPLE_DEFINITION } from '../fixtures.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
// The cargo workspace root owns target/; the release binary never lives under cli/.
const CLI_BIN = path.join(REPO_ROOT, 'target/release/the-loop');

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

/**
 * Disposable fixture repo + isolated HOME (never read the developer's ~/.claude).
 * @param {typeof EXAMPLE_DEFINITION} def
 */
function setupFixtureRepo(def) {
  const cwd = buildFixtureRepo(def);
  const home = mkdtempSync(path.join(tmpdir(), 'loop-oracle-home-'));
  return {
    cwd,
    env: { HOME: home },
    cleanup: () => {
      rmSync(cwd, { recursive: true, force: true });
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

/** Spawn the real binary in setup (subprocess only — never import command bodies). */
function spine(cwd, args, env) {
  return execFileSync(CLI_BIN, args, { cwd, encoding: 'utf8', env });
}

const WORKTREE_BRANCH = 'loop/widget';
const WORKTREE_REL = path.join('.claude/worktrees', 'loop-widget');

/**
 * Expected --script-out bytes: what the binary emits for the same scope and target
 * in a second, identically-seeded scratch fixture — derived by subprocess (never an
 * in-process import). Since json-cutover this is a determinism regression: two runs
 * over identical fixtures must emit byte-identical scripts modulo the wall-clock
 * preparedAt, which the comparison masks.
 */
function expectedSplicedScript(scope, targetBranch) {
  const cwd = buildFixtureRepo(definition());
  const home = mkdtempSync(path.join(tmpdir(), 'loop-oracle-home-'));
  try {
    spine(cwd, [
      'prepare-execution-context',
      '--features', scope.join(','),
      '--target-branch', targetBranch,
      '--script-out', 'expected-spliced.js',
    ], { ...process.env, HOME: home });
    return readFileSync(path.join(cwd, 'expected-spliced.js'), 'utf8');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

/** Refusal gate: empty stdout, present stderr, exit 1. */
const GATE_REFUSAL = { exitCode: 1, stdoutBytes: '', stderr: 'present' };

// preparedAt is the one legal wall-clock read, stamped per invocation, so two runs
// can never match; its shape is asserted separately and the byte comparison masks
// exactly it. (The parity era's cli/covers masks retired with the JS driver — one
// binary, one format, nothing else may differ.)
const PREPARED_AT_VALUE = /"preparedAt":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/;

function maskPreparedAt(scriptText) {
  return scriptText.replace(PREPARED_AT_VALUE, '"preparedAt":"<preparedAt>"');
}

/** @param {(cwd: string) => string | void} check */
function effect(check) {
  return (cwd) => check(cwd);
}

// ── prepare-execution-context ───────────────────────────────────────────────

const prepareCases = [
  {
    command: 'prepare-execution-context',
    scenario: 'happy path — preparedAt shape + cli names the binary',
    argv: ['prepare-execution-context', '--features', 'alpha', '--target-branch', 'main'],
    setup: () => setupFixtureRepo(definition()),
    expect: {
      exitCode: 0,
      iso8601: ['preparedAt'],
      cli: { path: 'cli', value: 'the-loop' },
    },
  },
  {
    command: 'prepare-execution-context',
    scenario: 'gate refusal — invalid graph (dangling dependency)',
    argv: ['prepare-execution-context', '--features', 'alpha', '--target-branch', 'main'],
    setup: () => setupFixtureRepo(definition({
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
    })),
    expect: GATE_REFUSAL,
  },
  {
    command: 'prepare-execution-context',
    scenario: 'gate refusal — scope gate (unknown feature id)',
    argv: ['prepare-execution-context', '--features', 'ghost', '--target-branch', 'main'],
    setup: () => setupFixtureRepo(definition()),
    expect: GATE_REFUSAL,
  },
  {
    command: 'prepare-execution-context',
    scenario: 'gate refusal — plan validation (bad-covers-ref)',
    argv: ['prepare-execution-context', '--features', 'alpha', '--target-branch', 'main'],
    setup: () => setupFixtureRepo(definition({
      plans: {
        alpha: {
          design_version: 1,
          tasks: [
            {
              id: 'alpha-core',
              title: 'Implement alpha core',
              covers: [99], // only 2 criteria exist — out of range
              acceptance: 'alpha core satisfies both feature criteria',
              footprint: ['src/alpha.js'],
              size: 's',
              judgment_level: 'standard',
              depends_on: [],
            },
          ],
        },
      },
    })),
    expect: GATE_REFUSAL,
  },
  {
    command: 'prepare-execution-context',
    scenario: 'gate refusal — model-binding validation (unregistered-executor)',
    argv: ['prepare-execution-context', '--features', 'alpha', '--target-branch', 'main'],
    setup: () => setupFixtureRepo(definition({
      settings: {
        'the-loop': {
          modelBindings: {
            'build.standard': { model: 'sonnet', executor: 'no-such-executor' },
          },
        },
      },
    })),
    expect: GATE_REFUSAL,
  },
  {
    command: 'prepare-execution-context',
    scenario: '--script-out writes spliced workflow script byte-identical across identically-seeded fixtures modulo the stamped preparedAt',
    argv: [
      'prepare-execution-context',
      '--features', 'alpha',
      '--target-branch', 'main',
      '--script-out', 'spliced-workflow.js',
    ],
    setup: () => setupFixtureRepo(definition()),
    // Computed lazily at case run time — the expectation shells the same binary in a
    // second identical fixture.
    expect: () => {
      const expected = expectedSplicedScript(['alpha'], 'main');
      return {
        exitCode: 0,
        iso8601: ['preparedAt'],
        effects: effect((cwd) => {
          const actual = readFileSync(path.join(cwd, 'spliced-workflow.js'), 'utf8');
          if (!PREPARED_AT_VALUE.test(actual)) {
            return 'spliced script lacks an ISO-8601 preparedAt in its EMBEDDED_CONTEXT literal';
          }
          if (maskPreparedAt(actual) !== maskPreparedAt(expected)) {
            return 'spliced script bytes !== expectation (after masking preparedAt)';
          }
          const embedded = actual.match(/^const EMBEDDED_CONTEXT = (.*);.*$/m);
          if (!embedded || JSON.parse(embedded[1])?.cli !== 'the-loop') {
            return 'EMBEDDED_CONTEXT literal missing, unparseable, or cli !== "the-loop"';
          }
        }),
      };
    },
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
    setup: () => setupFixtureRepo(definition()),
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
