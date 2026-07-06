// design-docs-and-runbooks: moving docs/design/features/<id>.md -> docs/designs/<id>/design.md
// and docs/probes/<id>.md -> docs/runbooks/<id>/runbook.md (directories named per the
// naming-map's feature-id verdicts), sweeping their prose to the approved vocabulary,
// while leaving the frozen map and the two founding design docs byte-untouched.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const p = (...parts) => path.join(root, ...parts);

// Every old docs/design/features/<id>.md id, mapped to its new design-doc id per the
// naming-map's Feature identifiers family (renamed ids renamed, keeps kept).
const DESIGN_ID_MAP = {
  'artifact-spine': 'document-foundation',
  build: 'build',
  'calibration-capture': 'calibration-capture',
  'configure-step-full': 'configure-step-full',
  'craft-baseline': 'code-quality-baseline',
  design: 'design',
  diagnose: 'diagnose',
  'executor-delegation': 'executor-delegation',
  frame: 'define',
  'inner-loop-workflow': 'execution-pipeline',
  'ledger-title-preservation': 'title-preservation',
  'model-selection': 'model-selection',
  'naming-map': 'naming-map',
  'operate-tooling': 'operate-tooling',
  plan: 'plan',
  'ports-adapters-full': 'ports-adapters-full',
  'rename-sweep': 'rename-sweep',
  'research-tiers': 'research-tiers',
  'severity-tiering': 'severity-tiering',
  ship: 'release',
  surfacing: 'escalation-queue',
  'the-loop-entry': 'the-loop-entry',
  validate: 'validate',
  'workflow-phase-grouping': 'workflow-phase-grouping',
  'worktree-parallelism': 'worktree-parallelism',
};

// The probe packs that existed pre-sweep (none of their ids rename), plus
// rename-sweep's own runbook — written at this feature's own validation, landing
// in the same commit per the swept docs/runbooks/<id>/runbook.md convention this
// feature itself established.
const RUNBOOK_IDS = ['diagnose', 'naming-map', 'worktree-parallelism', 'rename-sweep'];

test('every feature design doc and probe pack landed at its new path, and the old dirs are gone', () => {
  assert.equal(existsSync(p('docs/design/features')), false);
  assert.equal(existsSync(p('docs/probes')), false);

  for (const newId of Object.values(DESIGN_ID_MAP)) {
    assert.ok(
      existsSync(p('docs/designs', newId, 'design.md')),
      `missing docs/designs/${newId}/design.md`,
    );
  }
  for (const id of RUNBOOK_IDS) {
    assert.ok(existsSync(p('docs/runbooks', id, 'runbook.md')), `missing docs/runbooks/${id}/runbook.md`);
  }
  // Directories beyond the map's are fine: post-sweep features add their own design
  // docs and runbooks (first: proposed-status, 2026-07-05). The sweep's completeness
  // claim is the mapped set above plus the vocabulary sweep below, which reads every
  // design doc present — new dirs included.
});

test('prose in the moved docs speaks the approved vocabulary, and untouched sentences were not copy-edited', () => {
  const designFiles = readdirSync(p('docs/designs')).map((id) => p('docs/designs', id, 'design.md'));
  const runbookFiles = RUNBOOK_IDS.map((id) => p('docs/runbooks', id, 'runbook.md'));
  const designCorpus = designFiles.map((f) => readFileSync(f, 'utf8')).join('\n---\n');
  const corpus = [designCorpus, ...runbookFiles.map((f) => readFileSync(f, 'utf8'))].join('\n---\n');

  // Retired paths/terms must not survive in their renamed sense anywhere, including
  // the design docs (which never quote the frozen map's own pre-rename row names).
  for (const old of [
    'docs/design/features/',
    'docs/probes/',
    'the-loop launch',
    'the-loop orient',
    'the-loop ledger',
    'BoundaryResult',
    'compose-and-prove',
    'probe pack',
    'Ship recipe',
    'cold-start',
    'launch snapshot',
  ]) {
    assert.equal(designCorpus.includes(old), false, `retired term/path "${old}" still present in a design doc`);
  }
  // "Runtime probe" is fully swept out of the design docs; its one surviving mention
  // (naming-map's own runbook record) is quoting the frozen map's own row name, not a
  // missed rename.
  assert.equal(designCorpus.includes('Runtime probe'), false);

  // The approved replacements are present somewhere in the swept corpus.
  for (const fresh of [
    'docs/designs/<id>/design.md',
    'docs/runbooks/<feature>/runbook.md',
    'the-loop prepare-execution-context',
    'the-loop status',
    'run summary',
    'test-gated merge policy',
    'validation runbook',
    'release runbook',
    'unconfigured',
    'execution context',
  ]) {
    assert.ok(corpus.includes(fresh), `approved term "${fresh}" not found anywhere in the swept corpus`);
  }

  // A sentence that used no renamed term stays put, verbatim (no general copy-edit).
  const calibration = readFileSync(p('docs/designs/calibration-capture/design.md'), 'utf8');
  assert.ok(calibration.includes(
    'Capture which decompositions held, what task sizes actually fit, and which blocks\n'
    + 'recur, then recall it at Plan/Design so the loop decomposes better over time.',
  ));
});

test('the frozen naming map and the two founding design docs are byte-untouched', () => {
  const untouched = [
    'docs/design/naming-map.md',
    'docs/design/agentic-dev-loop-design-decisions.md',
    'docs/design/agentic-dev-loop-design-intent.md',
  ];
  for (const rel of untouched) {
    const atHead = execSync(`git show HEAD:${rel}`, { cwd: root, encoding: 'utf8' });
    const onDisk = readFileSync(p(rel), 'utf8');
    assert.equal(onDisk, atHead, `${rel} diverged from HEAD`);
  }
});
