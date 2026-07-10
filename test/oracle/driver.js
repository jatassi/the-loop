// Parity-oracle subprocess driver: runs a data-driven case table by spawning the
// binary under test (never importing either implementation in-process) and rendering
// a per-case verdict through the comparison-rules module. This file owns the
// case-table shape that all three corpus tasks feed, target selection, the
// per-command pending allowlist, and the one-line pass/fail/pending summary.
//
// Configuration (both read from the environment, never from an in-process import):
//   ORACLE_TARGET  'js' (default) | 'rust' — selects the default binary and whether
//                  the pending allowlist applies (Rust only).
//   ORACLE_BIN     overrides the binary command, e.g. 'node /abs/plugin/bin/the-loop.js'
//                  or '/abs/target/release/the-loop'. Whitespace-split into a
//                  command plus prefix args; a case's argv is appended after them.
//
// A case is a plain object:
//   {
//     command:  string    // e.g. 'status', 'plan parse', '--version' — keys the allowlist
//     scenario: string    // human label for the run
//     argv:     string[] | (ctx) => string[]   // appended after the binary's prefix args
//     env?:     Record<string,string>          // extra env (HOME isolation, …)
//     setup?:   (ctx) => { cwd?, env?, cleanup? } | void   // builds a disposable fixture repo
//     expect:   Expectation | (ctx) => Expectation         // ctx = { target }
//   }
// Expectation fields (each optional; every present field is checked via compare.js):
//   exitCode     number                       exact exit-code equality
//   stdout       unknown                       stdout parsed + JSON-equal (key-order-insensitive)
//   stdoutBytes  string                        stdout byte-equal
//   stdoutMatch  RegExp                        stdout matches (e.g. version shape)
//   stderr       'present' | 'absent'          refusal-path stderr check
//   iso8601      string[]                      dotted stdout paths checked for ISO-8601 shape
//   cli          { path, value }               execution-context cli field, per-binary value
//   files        Record<rel, unknown>          written JSON artifacts JSON-equal on the fixture tree
//   fileBytes    Record<rel, string>           written files byte-equal (e.g. --script-out)
//   effects      (cwd) => string | void        escape hatch; return/throw a message on mismatch

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  areExitCodesEqual,
  bytesEqual,
  isCliFieldEqual,
  isIso8601Shape,
  isStderrAbsent,
  isStderrPresent,
  jsonEqual,
  jsonFilesEqual,
} from './compare.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

/**
 * Resolve the run target and the binary command from the environment.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ target: 'js' | 'rust', bin: { command: string, prefixArgs: string[] } }}
 */
export function resolveTarget(env = process.env) {
  const target = env.ORACLE_TARGET === 'rust' ? 'rust' : 'js';
  const binString = env.ORACLE_BIN || defaultBin(target);
  return { target, bin: parseBin(binString) };
}

/** @param {'js' | 'rust'} target */
function defaultBin(target) {
  if (target === 'rust') {
    // The workspace root Cargo.toml owns the target dir: cargo puts the cli/ crate's
    // binary at <repo-root>/target/release, never under cli/.
    return path.join(REPO_ROOT, 'target/release/the-loop');
  }
  return `node ${path.join(REPO_ROOT, 'plugin/bin/the-loop.js')}`;
}

/** @param {string} binString @returns {{ command: string, prefixArgs: string[] }} */
function parseBin(binString) {
  const [command, ...prefixArgs] = binString.trim().split(/\s+/);
  return { command, prefixArgs };
}

/**
 * The per-command pending allowlist (Rust target only). Each *-rust feature shrinks it.
 * @param {string} [file]
 * @returns {string[]}
 */
export function loadPending(file = path.join(HERE, 'pending.json')) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * Discover case modules from test/oracle/cases/ so corpus tasks add files without
 * editing shared registration. Each module exports `cases: Case[]`.
 * @param {string} [dir]
 * @returns {Promise<object[]>}
 */
export async function loadCases(dir = path.join(HERE, 'cases')) {
  let files;
  try {
    files = readdirSync(dir).filter((name) => name.endsWith('.js'));
  } catch {
    return [];
  }
  const modules = await Promise.all(
    files.toSorted((a, b) => a.localeCompare(b)).map((name) => import(pathToFileURL(path.join(dir, name)).href)),
  );
  return modules.flatMap((module) => module.cases ?? []);
}

/**
 * Run one case: spawn the binary, evaluate the expectation via compare.js, and
 * render a verdict — downgrading a Rust failure to pending when the command is
 * on the allowlist.
 * @param {object} caseSpec
 * @param {{ bin: { command: string, prefixArgs: string[] }, target: 'js' | 'rust', pendingCommands?: string[] }} opts
 * @returns {{ command: string, scenario: string, status: 'pass' | 'fail' | 'pending', reason?: string }}
 */
export function runCase(caseSpec, { bin, target, pendingCommands = [] }) {
  const ctx = { target };
  const expectation = typeof caseSpec.expect === 'function' ? caseSpec.expect(ctx) : caseSpec.expect;
  const argv = typeof caseSpec.argv === 'function' ? caseSpec.argv(ctx) : caseSpec.argv;
  const setup = caseSpec.setup ? caseSpec.setup(ctx) || {} : {};
  try {
    const env = { ...process.env, ...caseSpec.env, ...setup.env };
    const spawned = spawnSync(bin.command, [...bin.prefixArgs, ...argv], { cwd: setup.cwd, env, encoding: 'utf8' });
    const failures = evaluateExpectation(expectation, resultOf(spawned, setup.cwd));
    return verdictOf(caseSpec, failures, { target, pendingCommands });
  } finally {
    setup.cleanup?.();
  }
}

/** Count pass/fail/pending across verdicts. @param {{status:string}[]} verdicts */
export function summarize(verdicts) {
  const count = (status) => verdicts.filter((verdict) => verdict.status === status).length;
  return { pass: count('pass'), fail: count('fail'), pending: count('pending') };
}

/** The single summary line. @param {{pass,fail,pending}} counts @param {string} target */
export function formatSummary(counts, target) {
  return `oracle [${target}]: ${counts.pass} pass, ${counts.fail} fail, ${counts.pending} pending`;
}

/** @param {object} spawned @param {string|undefined} cwd */
function resultOf(spawned, cwd) {
  return {
    stdout: spawned.stdout ?? '',
    stderr: spawned.stderr ?? '',
    exitCode: spawned.status,
    error: spawned.error,
    cwd,
  };
}

function verdictOf(caseSpec, failures, { target, pendingCommands }) {
  const base = { command: caseSpec.command, scenario: caseSpec.scenario };
  if (failures.length === 0) {
    return { ...base, status: 'pass' };
  }
  const reason = failures.join('; ');
  if (target === 'rust' && pendingCommands.includes(caseSpec.command)) {
    return { ...base, status: 'pending', reason };
  }
  return { ...base, status: 'fail', reason };
}

const CHECKS = [
  checkExit,
  checkStdout,
  checkStdoutBytes,
  checkStdoutMatch,
  checkStderr,
  checkIso,
  checkCli,
  checkFiles,
  checkFileBytes,
  checkEffects,
];

function evaluateExpectation(expectation, result) {
  if (result.error) {
    return [`spawn failed: ${result.error.message}`];
  }
  const parsed = tryParse(result.stdout);
  return CHECKS.map((check) => check(expectation, result, parsed)).filter(Boolean);
}

function checkExit(expectation, result) {
  if (expectation.exitCode === undefined) {
    return null;
  }
  return areExitCodesEqual(result.exitCode, expectation.exitCode)
    ? null
    : `exit code ${result.exitCode} !== expected ${expectation.exitCode}`;
}

function checkStdout(expectation, result) {
  if (expectation.stdout === undefined) {
    return null;
  }
  return jsonEqual(result.stdout, expectation.stdout) ? null : 'stdout JSON !== expected';
}

function checkStdoutBytes(expectation, result) {
  if (expectation.stdoutBytes === undefined) {
    return null;
  }
  return bytesEqual(result.stdout, expectation.stdoutBytes) ? null : 'stdout bytes !== expected';
}

function checkStdoutMatch(expectation, result) {
  if (!expectation.stdoutMatch) {
    return null;
  }
  return expectation.stdoutMatch.test(result.stdout) ? null : `stdout does not match ${expectation.stdoutMatch}`;
}

function checkStderr(expectation, result) {
  if (expectation.stderr === undefined) {
    return null;
  }
  if (expectation.stderr === 'present') {
    return isStderrPresent(result.stderr) ? null : 'stderr expected present but was absent';
  }
  if (expectation.stderr === 'absent') {
    return isStderrAbsent(result.stderr) ? null : 'stderr expected absent but was present';
  }
  return `unknown stderr expectation: ${expectation.stderr}`;
}

function checkIso(expectation, result, parsed) {
  if (!expectation.iso8601) {
    return null;
  }
  const bad = expectation.iso8601.filter((dotted) => !isIso8601Shape(getPath(parsed, dotted)));
  return bad.length > 0 ? `not ISO-8601 at: ${bad.join(', ')}` : null;
}

function checkCli(expectation, result, parsed) {
  if (!expectation.cli) {
    return null;
  }
  return isCliFieldEqual(getPath(parsed, expectation.cli.path), expectation.cli.value)
    ? null
    : `cli field at ${expectation.cli.path} !== ${expectation.cli.value}`;
}

function checkFiles(expectation, result) {
  if (!expectation.files) {
    return null;
  }
  return jsonFilesEqual(result.cwd, expectation.files) ? null : 'written JSON artifacts !== expected';
}

function checkFileBytes(expectation, result) {
  if (!expectation.fileBytes) {
    return null;
  }
  const bad = Object.entries(expectation.fileBytes)
    .filter(([rel, want]) => fileBytesMismatch(result.cwd, rel, want))
    .map(([rel]) => rel);
  return bad.length > 0 ? `file bytes !== expected: ${bad.join(', ')}` : null;
}

function checkEffects(expectation, result) {
  if (!expectation.effects) {
    return null;
  }
  try {
    const message = expectation.effects(result.cwd);
    return typeof message === 'string' ? message : null;
  } catch (error) {
    return `effect assertion threw: ${error.message}`;
  }
}

function fileBytesMismatch(cwd, rel, want) {
  const content = readOrNull(path.join(cwd, rel));
  return content === null || !bytesEqual(content, want);
}

function readOrNull(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function getPath(value, dotted) {
  let acc = value;
  for (const key of dotted.split('.')) {
    if (acc == null) {
      return;
    }
    acc = acc[key];
  }
  return acc;
}

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return;
  }
}
