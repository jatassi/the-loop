// Adapter for `claude -p` headless runs. The JSON envelope reports usage and
// total_cost_usd directly (notional API-equivalent even under subscription auth).
// Web tools are disabled for parity with production build/validate agents, whose
// tool set is Read/Grep/Glob/Bash/Write/Edit only.
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { run } from './exec.js';

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function invokeClaude({ model, promptText, cwd, schema, timeoutMs }) {
  const args = [
    '-p',
    '--model', model,
    '--dangerously-skip-permissions',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(schema),
    '--disallowedTools', 'WebSearch,WebFetch',
  ];
  const r = await run('claude', args, { cwd, timeoutMs, stdin: promptText });
  return { exit: r.code, timedOut: r.timedOut, durationMs: r.durationMs, stderr: r.stderr, ...parseEnvelope(r) };
}

function parseEnvelope(r) {
  const envelope = tryParse(r.stdout) ?? {};
  const selfReport = envelope.structured_output ?? tryParse(envelope.result ?? '');
  return {
    finalText: envelope.result ?? r.stdout,
    selfReport: selfReport ?? null,
    ...costFields(envelope),
    ...identityFields(envelope),
  };
}

function costFields(envelope) {
  return {
    usage: envelope.usage ?? null,
    costUsd: envelope.total_cost_usd ?? null,
    costBasis: envelope.total_cost_usd == null ? 'unavailable' : 'reported',
  };
}

function identityFields(envelope) {
  return {
    resolvedModel: resolveModelId(envelope),
    numTurns: envelope.num_turns ?? null,
    sessionId: envelope.session_id ?? null,
  };
}

function resolveModelId(envelope) {
  if (!envelope) { return null; }
  if (typeof envelope.model === 'string') { return envelope.model; }
  const usageKeys = Object.keys(envelope.modelUsage ?? {});
  return usageKeys.length > 0 ? usageKeys.join('+') : null;
}

// Headless sessions land under ~/.claude/projects/<munged-cwd>/<session>.jsonl;
// best-effort fetch for canary scanning (absence is recorded, not fatal).
export async function claudeTranscript({ cwd, sessionId }) {
  if (!sessionId) { return null; }
  const munged = path.resolve(cwd).replaceAll(/[/.]/g, '-');
  const file = path.join(homedir(), '.claude', 'projects', munged, `${sessionId}.jsonl`);
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}
