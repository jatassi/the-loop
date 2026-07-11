// Shared setup helpers for oracle case modules: disposable fixture-repo contexts
// (JSON artifacts — the only era since json-cutover) and throwaway temp dirs.

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildFixtureRepo } from './fixtures.js';

export const REFUSE = { exitCode: 1, stderr: 'present', stdoutBytes: '' };
export const ALPHA = { branch: 'loop/alpha' };
export const HOME = { isolateHome: true };

/** @param {string} dir */
export const rm = (dir) => rmSync(dir, { recursive: true, force: true });

/**
 * @param {typeof import('./fixtures.js').EXAMPLE_DEFINITION} definition
 * @param {{ branch?: string, isolateHome?: boolean }} [opts]
 */
export function repoSetup(definition, { branch, isolateHome } = {}) {
  return () => {
    const cwd = buildFixtureRepo(definition);
    if (branch) {
      execSync(`git checkout -q ${branch}`, { cwd });
    }
    const emptyHome = isolateHome ? mkdtempSync(path.join(tmpdir(), 'oracle-home-')) : null;
    return {
      cwd,
      env: emptyHome ? { HOME: emptyHome } : undefined,
      cleanup: () => {
        rm(cwd);
        if (emptyHome) {
          rm(emptyHome);
        }
      },
    };
  };
}

/** @param {string} prefix @param {(cwd: string) => void} [seed] */
export function tempSetup(prefix, seed) {
  return () => {
    const cwd = mkdtempSync(path.join(tmpdir(), prefix));
    seed?.(cwd);
    return { cwd, cleanup: () => rm(cwd) };
  };
}
