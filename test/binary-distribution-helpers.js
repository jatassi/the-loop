// Shared helpers/fixtures for binary-distribution acceptance tests.
// Lives under test/ but defines no test() cases — bare discovery is a no-op pass.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const INSTALL_ONE_LINER =
  'curl -LsSf https://github.com/jatassi/the-loop/releases/latest/download/the-loop-installer.sh | sh';

export const REQUIRED_TARGETS = [
  'aarch64-apple-darwin',
  'x86_64-apple-darwin',
  'x86_64-unknown-linux-musl',
  'aarch64-unknown-linux-musl',
  'x86_64-pc-windows-msvc',
];

export const COMPILED_BLOB_EXTS = new Set([
  '.tar',
  '.gz',
  '.xz',
  '.zip',
  '.tgz',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.a',
  '.o',
  '.rlib',
]);

export function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...opts.env },
    timeout: opts.timeout ?? 120_000,
  });
}

export function distAvailable() {
  const which = spawnSync('sh', ['-c', 'command -v dist || command -v cargo-dist'], {
    encoding: 'utf8',
  });
  return which.status === 0 && which.stdout.trim().length > 0;
}

export function planJson() {
  assert.ok(distAvailable(), 'cargo-dist (`dist`) must be on PATH for these tests');
  const result = run('cargo', ['dist', 'plan', '--output-format=json']);
  assert.equal(
    result.status,
    0,
    `cargo dist plan failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
  return JSON.parse(result.stdout);
}

export function hostTriple() {
  const result = run('rustc', ['-vV']);
  assert.equal(result.status, 0, `rustc -vV failed: ${result.stderr}`);
  const line = result.stdout.split('\n').find((l) => l.startsWith('host: '));
  assert.ok(line, 'rustc -vV must report host:');
  return line.slice('host: '.length).trim();
}

function jsRuntimeDirsOnPath() {
  const dirs = new Set();
  for (const name of ['node', 'nodejs', 'npm', 'npx', 'bun', 'deno']) {
    const found = spawnSync('sh', ['-c', `command -v ${name} || true`], {
      encoding: 'utf8',
    });
    const bin = found.stdout.trim();
    if (bin) {
      dirs.add(path.dirname(bin));
    }
  }
  // Also drop common JS package manager home dirs if present on PATH.
  const pathEntries = (process.env.PATH || '').split(path.delimiter);
  for (const dir of pathEntries) {
    if (/node|npm|nvm|bun|deno|fnm|volta/i.test(dir)) {
      dirs.add(dir);
    }
  }
  return dirs;
}

export function pathWithoutJsRuntimes() {
  const banned = jsRuntimeDirsOnPath();
  // Keep a minimal POSIX-ish PATH that still has curl, tar, sh, sha256sum.
  const base = ['/usr/bin', '/bin', '/usr/sbin', '/sbin', '/opt/homebrew/bin', '/usr/local/bin'];
  const filtered = base.filter((d) => !banned.has(d) && existsSync(d));
  // Prove the constructed PATH has no node/npm.
  const probe = spawnSync('sh', ['-c', 'command -v node; command -v npm; command -v bun; true'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: filtered.join(path.delimiter) },
  });
  assert.equal(
    probe.stdout.trim(),
    '',
    `PATH still exposes a JS runtime: ${probe.stdout}`,
  );
  return filtered.join(path.delimiter);
}

/**
 * Serve `dir` over HTTP from a *separate* process.
 *
 * A same-process Node http.Server cannot answer requests while the test is
 * blocked in spawnSync (event loop frozen) — the installer download would hang.
 * python3's http.server is a real independent peer, matching the "no JS runtime
 * on PATH" install environment.
 */
export function serveDirectory(dir) {
  // Bind an ephemeral port via a short-lived probe, then hand it to python.
  const probe = spawnSync(
    'python3',
    [
      '-c',
      'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(probe.status, 0, `port probe failed: ${probe.stderr}`);
  const port = Number(probe.stdout.trim());
  assert.ok(Number.isSafeInteger(port) && port > 0, `invalid port: ${probe.stdout}`);

  const child = spawn(
    'python3',
    ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', dir],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  // Wait until the server accepts connections (or fail fast).
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const ready = spawnSync(
      'curl',
      ['-sS', '-o', '/dev/null', '-w', '%{http_code}', `http://127.0.0.1:${port}/`],
      { encoding: 'utf8', timeout: 1000 },
    );
    if (ready.status === 0 && ready.stdout.trim() !== '000') {
      break;
    }
    spawnSync('sleep', ['0.05']);
  }

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    close() {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    },
  };
}

/** Collect release artifact names and checksum artifact names from a dist plan. */
export function collectPlanArtifacts(plan) {
  const artifactNames = new Set();
  const checksumArtifacts = [];
  const releases = plan.releases || [];
  for (const release of releases) {
    const artifacts = release.artifacts || [];
    for (const name of artifacts) {
      artifactNames.add(name);
    }
  }
  // dist-manifest also lists artifacts at the top level in some versions.
  if (plan.artifacts) {
    for (const [name, art] of Object.entries(plan.artifacts)) {
      artifactNames.add(name);
      if (art.kind === 'checksum' || name.endsWith('.sha256') || name === 'sha256.sum') {
        checksumArtifacts.push(name);
      }
    }
  }
  return { artifactNames, checksumArtifacts };
}

/** Assert each required target has an archive and sha256 coverage in the plan. */
export function assertTargetArchivesCovered(artifactNames) {
  for (const target of REQUIRED_TARGETS) {
    const names = [...artifactNames];
    const archive = names.find(
      (n) => n.includes(target) && (n.endsWith('.tar.xz') || n.endsWith('.zip')),
    );
    assert.ok(archive, `plan must include an archive for ${target}; got ${names.join(', ')}`);

    // Per-target sha256 sidecar and/or aggregate checksum manifest.
    const perTargetChecksum = names.find(
      (n) => n === `${archive}.sha256` || (n.includes(target) && n.endsWith('.sha256')),
    );
    assert.ok(
      perTargetChecksum || artifactNames.has('sha256.sum'),
      `plan must include sha256 checksum coverage for ${target} archive ${archive}`,
    );
  }
}

/** Assert installer + checksum artifact names are present on the plan. */
export function assertInstallerAndChecksumArtifacts(artifactNames, checksumArtifacts) {
  assert.ok(
    artifactNames.has('the-loop-installer.sh'),
    'plan must include the POSIX shell installer the-loop-installer.sh',
  );
  assert.ok(
    artifactNames.has('the-loop-installer.ps1'),
    'plan must include the PowerShell installer the-loop-installer.ps1',
  );
  assert.ok(
    artifactNames.has('sha256.sum')
      || checksumArtifacts.length > 0
      || [...artifactNames].some((n) => n.endsWith('.sha256')),
    'plan must include sha256 checksum artifacts',
  );
}

/** Match the cargo-dist installer-embedded sha256 value for a named archive. */
export function embeddedArchiveChecksum(installerText, archiveName) {
  const escapedArchive = archiveName.replaceAll('.', String.raw`\.`);
  const pattern = new RegExp(
    String.raw`${escapedArchive}"\)[\s\S]*?_checksum_value="([a-f0-9]{64})"`,
  );
  const checksumMatch = installerText.match(pattern);
  assert.ok(checksumMatch, `installer must embed a sha256 value for ${archiveName}`);
  return checksumMatch[1];
}

/** Copy every regular file from `srcDir` into `destDir`. */
export function copyFiles(srcDir, destDir) {
  for (const name of readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    if (statSync(src).isFile()) {
      writeFileSync(path.join(destDir, name), readFileSync(src));
    }
  }
}
