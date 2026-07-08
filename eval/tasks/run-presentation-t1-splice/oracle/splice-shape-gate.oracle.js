// Oracle for run-presentation-t1-splice, criterion 2's shape-gate half — a canonical
// workflow script whose meta line doesn't carry the expected description shape makes the
// command exit 1 with nothing written (stdout included). A standalone PLUGIN_ROOT (a real
// copy of the fixture's bin/ + src/ + config/ + docs/executors, node_modules symlinked in)
// carries a deliberately un-spliceable multi-line meta, so the CLI runs against a canonical
// script the oracle controls without touching the fixture's own good copy.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const git = (root, ...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
function gitFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'rp-shape-graph-'));
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  writeFileSync(path.join(root, 'docs/feature-graph.md'), `# Fixture — Feature graph

## Feature graph

\`\`\`yaml
design_version: 1
features:
  - id: widget
    title: widget
    status: designed
    depends_on: []
    acceptance: [widget does a thing]
\`\`\`
`);
  writeFileSync(path.join(root, 'docs/architecture.md'), '# Fixture — Architecture\n\n## Validation runbook\n\nnone\n');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'o@x'); git(root, 'config', 'user.name', 'oracle');
  git(root, 'add', '-A'); git(root, 'commit', '-qm', 'seed');
  return root;
}

// A real plugin root carrying a caller-supplied canonical workflow script.
function pluginRoot(workflowScript) {
  const root = mkdtempSync(path.join(tmpdir(), 'rp-shape-plugin-'));
  for (const dir of ['bin', 'src', 'config', 'docs/executors']) {
    cpSync(path.resolve(dir), path.join(root, dir), { recursive: true });
  }
  symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  mkdirSync(path.join(root, 'workflows'), { recursive: true });
  writeFileSync(path.join(root, 'workflows/execution-pipeline.js'), workflowScript);
  return root;
}

test("criterion 2: a canonical script whose meta line lacks the expected description shape makes --script-out exit 1 with nothing written, stdout included", () => {
  const graph = gitFixture();
  // meta spans multiple lines — no single-line `description: '…'` shape to splice.
  const plugin = pluginRoot([
    'export const meta = {',
    "  name: 'execution-pipeline',",
    "  description: 'a static description that never varies',",
    '};',
    'const x = 1;',
    '',
  ].join('\n'));
  try {
    const out = path.join(graph, 'spliced.js');
    let failure;
    try {
      execFileSync('node', [path.join(plugin, 'bin/the-loop.js'), 'prepare-execution-context',
        '--features', 'widget', '--target-branch', 'main', '--script-out', out],
      { cwd: graph, encoding: 'utf8' });
    } catch (error) { failure = error; }
    assert.ok(failure, 'the command exited non-zero');
    assert.equal(failure.status, 1, 'exit code 1');
    assert.equal(failure.stdout, '', 'nothing on stdout');
    assert.ok(!existsSync(out), 'no script was written');
  } finally {
    rmSync(graph, { recursive: true, force: true });
    rmSync(plugin, { recursive: true, force: true });
  }
});
