// Process runner for the eval harness: capture-everything, hard wall-clock kill,
// never throws on non-zero exit — callers grade outcomes, they don't catch them.
import { spawn } from 'node:child_process';

const MAX_CAPTURE = 64 * 1024 * 1024;

export function run(cmd, args, opts = {}) {
  const { cwd, timeoutMs = 120_000, stdin = null, env } = opts;
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, { cwd, env: env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let isTimedOut = false;
    const timer = setTimeout(() => {
      isTimedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      if (stdout.length < MAX_CAPTURE) { stdout += d; }
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < MAX_CAPTURE) { stderr += d; }
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: -1, signal: null, stdout, stderr: `${stderr}\n${error.message}`, durationMs: Date.now() - started, timedOut: isTimedOut });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, durationMs: Date.now() - started, timedOut: isTimedOut });
    });
    if (stdin != null) { child.stdin.write(stdin); }
    child.stdin.end();
  });
}
