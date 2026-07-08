// Oracle for run-presentation-t1-splice (criterion 1 + criterion 2's quote/one-line
// half) — drives the real `the-loop prepare-execution-context` CLI (the public interface
// the criteria name) inside temp git-repo fixtures. Assertions read the CLI's observable
// outputs (stdout + the written script's meta), independent of the internal function
// names a correct solution chooses. Runs from the fixture root (cwd), so the CLI's
// PLUGIN_ROOT is the fixture and its own workflows/execution-pipeline.js is what is spliced.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const BIN = path.resolve('bin/the-loop.js');
const CANONICAL = path.resolve('workflows/execution-pipeline.js');
const META_LINE = /^export const meta\b.*;$/m;

const git = (root, ...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
function gitFixture(features) {
  const root = mkdtempSync(path.join(tmpdir(), 'rp-splice-'));
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  const yaml = features.map((f) => `  - id: ${f}\n    title: ${f}\n    status: designed\n    depends_on: []\n    acceptance: [${f} does a thing]`).join('\n');
  writeFileSync(path.join(root, 'docs/feature-graph.md'), `# Fixture — Feature graph\n\n## Feature graph\n\n\`\`\`yaml\ndesign_version: 1\nfeatures:\n${yaml}\n\`\`\`\n`);
  writeFileSync(path.join(root, 'docs/architecture.md'), '# Fixture — Architecture\n\n## Validation runbook\n\nnone\n');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'o@x'); git(root, 'config', 'user.name', 'oracle');
  git(root, 'add', '-A'); git(root, 'commit', '-qm', 'seed');
  return root;
}
const spine = (root, args) => execFileSync('node', [BIN, ...args], { cwd: root, encoding: 'utf8' });
function evalMeta(text) {
  const m = text.match(META_LINE);
  assert.ok(m, 'the spliced script has a single-physical-line meta declaration ending in `;`');
  return { line: m[0], meta: new Function(`${m[0].replace(/^export /, '')}\nreturn meta;`)() };
}

test('criterion 1: --script-out writes a spliced canonical script differing only in its meta description; without the flag nothing is written; stdout is the unchanged execution context either way', () => {
  const root = gitFixture(['widget']);
  try {
    const out = path.join(root, 'spliced.js');
    const noFlag = spine(root, ['prepare-execution-context', '--features', 'widget', '--target-branch', 'main']);
    assert.ok(!existsSync(out), 'no flag → nothing written');
    const withFlag = spine(root, ['prepare-execution-context', '--features', 'widget', '--target-branch', 'main', '--script-out', out]);
    assert.equal(withFlag, noFlag, 'stdout is the unchanged execution context either way');
    assert.ok(existsSync(out), 'the flag wrote a script');
    const canonical = readFileSync(CANONICAL, 'utf8');
    const spliced = readFileSync(out, 'utf8');
    assert.notEqual(spliced, canonical);
    assert.equal(spliced.replace(META_LINE, ''), canonical.replace(META_LINE, ''), 'differs only in the meta line');
    const { meta } = evalMeta(spliced);
    assert.ok(meta.description.includes('widget'), 'description names the in-scope feature id');
    assert.ok(meta.description.includes('main'), 'description names the target branch');
    assert.equal(meta.name, 'execution-pipeline', 'sibling meta fields are untouched');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('criterion 1: past 5 in-scope ids the description keeps the first 5 and collapses the rest to a +<k> more count', () => {
  const ids = ['feat1', 'feat2', 'feat3', 'feat4', 'feat5', 'feat6', 'feat7'];
  const root = gitFixture(ids);
  try {
    const out = path.join(root, 'spliced.js');
    spine(root, ['prepare-execution-context', '--features', ids.join(','), '--target-branch', 'main', '--script-out', out]);
    const { meta, line } = evalMeta(readFileSync(out, 'utf8'));
    for (const id of ids.slice(0, 5)) { assert.ok(meta.description.includes(id), `first-5 id ${id} is listed`); }
    assert.ok(meta.description.includes('+2 more'), 'the 2 ids past the first 5 collapse to "+2 more"');
    assert.ok(!meta.description.includes('feat6') && !meta.description.includes('feat7'), 'ids past the first 5 are not listed individually');
    assert.equal(line.split('\n').length, 1, 'meta stays one physical line');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('criterion 2: the description is quote-safe — a target branch carrying a quote round-trips exactly, and meta stays one physical line', () => {
  const root = gitFixture(['widget']);
  try {
    const out = path.join(root, 'spliced.js');
    const target = "rel'ease";
    spine(root, ['prepare-execution-context', '--features', 'widget', '--target-branch', target, '--script-out', out]);
    const spliced = readFileSync(out, 'utf8');
    const { meta, line } = evalMeta(spliced);
    assert.ok(meta.description.includes(target), 'the quote-bearing target round-trips into the description');
    assert.equal(line.split('\n').length, 1, 'meta stays one physical line despite the embedded quote');
    assert.equal(spliced.match(/^export const meta\b.*$/gm).length, 1, 'exactly one meta declaration line');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
