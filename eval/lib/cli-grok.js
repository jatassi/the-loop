// Adapter for Grok Build headless runs, derived from the grok executor playbook
// (docs/executors/grok.md) plus eval-specific flags: JSON output, schema-constrained
// final message, memory and web search off for parity and contamination control.
import { run } from './exec.js';

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function invokeGrok({ model, promptPath, cwd, schema, maxTurns, timeoutMs }) {
  const args = [
    '-m', model,
    '--prompt-file', promptPath,
    '--cwd', cwd,
    '--always-approve',
    '--no-subagents',
    '--no-memory',
    '--disable-web-search',
    '--max-turns', String(maxTurns),
    '--output-format', 'json',
    '--json-schema', JSON.stringify(schema),
  ];
  const r = await run('grok', args, { timeoutMs });
  return { exit: r.code, timedOut: r.timedOut, durationMs: r.durationMs, stderr: r.stderr, resolvedModel: model, ...parseEnvelope(r) };
}

function parseEnvelope(r) {
  const envelope = tryParse(r.stdout) ?? {};
  const finalText = envelope.text ?? r.stdout;
  return {
    finalText,
    selfReport: tryParse(finalText),
    ...costFields(envelope),
    ...sessionFields(envelope),
  };
}

function costFields(envelope) {
  return {
    usage: envelope.usage ?? null,
    costUsd: null,
    costBasis: envelope.usage == null ? 'estimated-transcript' : 'reported',
  };
}

function sessionFields(envelope) {
  return {
    numTurns: envelope.num_turns ?? null,
    sessionId: envelope.sessionId ?? null,
    stopReason: envelope.stopReason ?? null,
  };
}

// `grok export <session>` renders the transcript as Markdown; used for canary
// scanning and the pre-registered token estimate when usage is absent.
export async function grokTranscript(sessionId) {
  if (!sessionId) { return null; }
  const r = await run('grok', ['export', sessionId], { timeoutMs: 60_000 });
  return r.code === 0 && r.stdout.trim().length > 0 ? r.stdout : null;
}
