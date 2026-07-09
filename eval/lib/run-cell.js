// One cell end-to-end: materialize a contamination-free fixture, run the model's
// CLI headless inside it, grade with verify.js, scan for ground-truth leakage,
// and emit one JSON row. Fixtures of failed cells are kept for forensics.
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { verifyBuild, verifyValidate } from '../verify.js';
import { adapterOf, rowKey } from './cells.js';
import { claudeTranscript, invokeClaude } from './cli-claude.js';
import { grokTranscript, invokeGrok } from './cli-grok.js';
import { scanCanary } from './detect.js';
import { run } from './exec.js';
import { commitAll, ensureNodeModules, extractTree, initRepo, linkNodeModules, overlayTree, runPlant } from './fixture.js';
import { estimateGrokUsage, grokCostUsd } from './pricing.js';
import { BUILD_SCHEMA, VALIDATE_SCHEMA } from './schemas.js';

async function materializeBuild({ cell, ctx, fixtureDir }) {
  const { manifest } = cell.unit;
  await extractTree({ repoRoot: ctx.repoRoot, sha: manifest.parent_sha, dir: fixtureDir });
  const template = await ensureNodeModules({ repoRoot: ctx.repoRoot, cacheDir: ctx.cacheDir, sha: manifest.parent_sha });
  await linkNodeModules({ template, dir: fixtureDir });
  if (manifest.plant) { await runPlant({ dir: fixtureDir, script: path.join(cell.unit.dir, manifest.plant) }); }
  await initRepo(fixtureDir);
  await commitAll({ dir: fixtureDir, message: `seed: ${cell.unit.id}` });
  await run('git', ['-C', fixtureDir, 'tag', 'seed'], { timeoutMs: 30_000 });
}

async function materializeValidate({ cell, ctx, fixtureDir }) {
  const { manifest } = cell.unit;
  await extractTree({ repoRoot: ctx.repoRoot, sha: manifest.parent_sha, dir: fixtureDir });
  const template = await ensureNodeModules({ repoRoot: ctx.repoRoot, cacheDir: ctx.cacheDir, sha: manifest.parent_sha });
  await linkNodeModules({ template, dir: fixtureDir });
  await initRepo(fixtureDir);
  await commitAll({ dir: fixtureDir, message: 'target' });
  await run('git', ['-C', fixtureDir, 'tag', 'seed'], { timeoutMs: 30_000 });
  await overlayTree({ repoRoot: ctx.repoRoot, sha: manifest.landing_sha, dir: fixtureDir });
  if (manifest.defect) { await runPlant({ dir: fixtureDir, script: path.join(cell.unit.dir, manifest.defect) }); }
  await commitAll({ dir: fixtureDir, message: 'integration result' });
}

async function invokeModel({ cell, ctx, fixtureDir, promptPath }) {
  const caps = { ...ctx.matrix.defaults, ...cell.unit.manifest.caps };
  const schema = cell.unit.leg === 'build' ? BUILD_SCHEMA : VALIDATE_SCHEMA;
  const timeoutMs = caps.wall_clock_s * 1000;
  if (adapterOf(cell.model) === 'grok') {
    return invokeGrok({ model: cell.model, promptPath, cwd: fixtureDir, schema, maxTurns: caps.grok_max_turns, timeoutMs });
  }
  const promptText = await readFile(promptPath, 'utf8');
  return invokeClaude({ model: cell.model, promptText, cwd: fixtureDir, schema, timeoutMs });
}

async function fetchTranscript({ cell, fixtureDir, invocation }) {
  if (adapterOf(cell.model) === 'grok') { return grokTranscript(invocation.sessionId); }
  return claudeTranscript({ cwd: fixtureDir, sessionId: invocation.sessionId });
}

async function gradeCell({ cell, fixtureDir, invocation }) {
  if (cell.unit.leg === 'build') {
    return { verify: await verifyBuild({ dir: fixtureDir, manifest: cell.unit.manifest, unitDir: cell.unit.dir, selfReport: invocation.selfReport }) };
  }
  return { validate_score: verifyValidate({ manifest: cell.unit.manifest, selfReport: invocation.selfReport }) };
}

function costFields({ cell, invocation, promptChars, transcript }) {
  if (adapterOf(cell.model) === 'claude') {
    return { usage: invocation.usage, cost_usd: invocation.costUsd, cost_basis: invocation.costBasis };
  }
  if (invocation.usage) { return { usage: invocation.usage, cost_usd: invocation.costUsd, cost_basis: 'reported' }; }
  const usage = estimateGrokUsage({ promptChars, transcriptChars: (transcript ?? '').length, outputChars: (invocation.finalText ?? '').length });
  return { usage, cost_usd: grokCostUsd({ inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }), cost_basis: 'estimated-transcript' };
}

async function canaryFields({ cell, fixtureDir, invocation, transcript }) {
  const { manifest } = cell.unit;
  const diffRef = cell.unit.leg === 'build' ? 'seed' : 'HEAD~1';
  const diff = await run('git', ['-C', fixtureDir, 'diff', diffRef], { timeoutMs: 60_000 });
  const phrases = [...(manifest.canary ?? []), ...(manifest.landing_sha ? [manifest.landing_sha, manifest.landing_sha.slice(0, 10)] : [])];
  const scope = ['final-text', 'diff', ...(transcript ? ['transcript'] : [])];
  const leaks = cell.unit.leg === 'build'
    ? scanCanary([invocation.finalText, diff.stdout, transcript ?? ''].join('\n'), phrases)
    : scanCanary([invocation.finalText, transcript ?? ''].join('\n'), phrases.filter((p) => p.length >= 10));
  return { canary_leak: leaks, canary_scope: scope, diffText: diff.stdout };
}

export async function runCell(cell, ctx) {
  const key = rowKey(cell);
  const cellDir = path.join(ctx.resultsDir, 'work', key.replaceAll('::', '--'));
  const fixtureDir = path.join(cellDir, 'fixture');
  await rm(cellDir, { recursive: true, force: true });
  await mkdir(fixtureDir, { recursive: true });
  await (cell.unit.leg === 'build' ? materializeBuild({ cell, ctx, fixtureDir }) : materializeValidate({ cell, ctx, fixtureDir }));
  const kernelName = cell.unit.leg === 'build' ? 'build' : (ctx.validateKernel ?? 'validate');
  const kernel = await readFile(path.join(ctx.evalRoot, 'kernels', `${kernelName}.md`), 'utf8');
  const brief = await readFile(path.join(cell.unit.dir, 'prompt.md'), 'utf8');
  const promptPath = path.join(cellDir, 'prompt.md');
  await writeFile(promptPath, `${kernel}\n\n---\n\n${brief}`);
  const started = new Date().toISOString();
  const invocation = await invokeModel({ cell, ctx, fixtureDir, promptPath });
  await writeFile(path.join(cellDir, 'out.json'), JSON.stringify(invocation, null, 2));
  const graded = await gradeCell({ cell, fixtureDir, invocation });
  const transcript = await fetchTranscript({ cell, fixtureDir, invocation });
  if (transcript) { await writeFile(path.join(cellDir, 'transcript.md'), transcript); }
  const canary = await canaryFields({ cell, fixtureDir, invocation, transcript });
  await writeFile(path.join(cellDir, 'diff.patch'), canary.diffText);
  const promptText = await readFile(promptPath, 'utf8');
  const row = buildRow({ cell, started, invocation, graded, canary, cost: costFields({ cell, invocation, promptChars: promptText.length, transcript }), kernelName });
  await appendFile(ctx.rowsPath, `${JSON.stringify(row)}\n`);
  const isOk = (graded.verify?.verdict === 'pass') || graded.validate_score?.verdict_match === true;
  if (isOk && canary.canary_leak.length === 0) { await rm(fixtureDir, { recursive: true, force: true }); }
  return row;
}

function buildRow({ cell, started, invocation, graded, canary, cost, kernelName }) {
  const m = cell.unit.manifest;
  return {
    unit_id: cell.unit.id,
    unit_kind: m.kind,
    leg: cell.unit.leg,
    kernel: kernelName,
    feature_source: m.feature_source,
    landing_sha: m.landing_sha,
    parent_sha: m.parent_sha,
    judgment_level: m.judgment_level ?? null,
    size: m.size ?? null,
    model: cell.model,
    resolved_model: invocation.resolvedModel,
    rep: cell.rep,
    started_at: started,
    wall_clock_ms: invocation.durationMs,
    cli_exit: invocation.exit,
    timed_out: invocation.timedOut,
    num_turns: invocation.numTurns,
    session_id: invocation.sessionId,
    self_report: invocation.selfReport?.result ?? null,
    self_report_deviations: invocation.selfReport?.deviations ?? [],
    ...graded,
    usage: cost.usage,
    cost_usd: cost.cost_usd,
    cost_basis: cost.cost_basis,
    canary_leak: canary.canary_leak,
    canary_scope: canary.canary_scope,
  };
}
