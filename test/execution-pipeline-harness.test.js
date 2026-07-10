// The shim's own acceptance, executable (ADR-0029): it runs the workflow-script shape
// (meta export + top-level return) against stub harness globals, and the stub records
// what a real Workflow spawn would carry.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { runWorkflowScript } from './execution-pipeline-harness.js';

// A stand-in for whatever real error identity a budget-exhausted spawn eventually
// throws (ADR-0029: "confirmed at the first live run") — the shim only needs to prove
// it propagates a *given* error untouched, name included.
class BudgetExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

function writeFixture(source) {
  const dir = mkdtempSync(path.join(tmpdir(), 'execution-pipeline-harness-'));
  const file = path.join(dir, 'fixture.js');
  writeFileSync(file, source);
  return file;
}

// ── acceptance leg 1: executes the workflow-script shape; isolated per scenario ──
test('runWorkflowScript executes a workflow script file and isolates state across runs', async () => {
  const scriptPath = writeFixture(`
    export const meta = { name: 'echo' };
    const reply = await agent('ping', { agentType: 'build', label: 'echo', phase: 'fixture', schema: 'noop' });
    return { reply };
  `);

  const first = await runWorkflowScript(scriptPath, { agentReplies: [{ returns: 'A' }] });
  assert.deepEqual(first.result, { reply: 'A' });
  assert.equal(first.spawns.length, 1);
  assert.deepEqual(first.logs, []);

  const second = await runWorkflowScript(scriptPath, { agentReplies: [{ returns: 'B' }] });
  assert.deepEqual(second.result, { reply: 'B' });
  assert.equal(second.spawns.length, 1); // a fresh run, not accumulated onto the first
});

// ── acceptance leg 2: the agent stub replays in order; can return null or throw ──
test('the agent stub replays scripted replies in order, and can return null or throw a given (including budget-named) error', async () => {
  const scriptPath = writeFixture(`
    export const meta = { name: 'multi-spawn' };
    const dead = await agent('first prompt', { agentType: 'build', label: 'first', phase: 'fixture', schema: 'noop' });
    let threwName = null;
    try {
      await agent('second prompt', { agentType: 'validate', label: 'second', phase: 'fixture', schema: 'noop' });
    } catch (error) {
      threwName = error.name;
    }
    return { dead, threwName };
  `);
  const budgetError = new BudgetExceededError('budget exhausted');

  const { result, spawns } = await runWorkflowScript(scriptPath, {
    agentReplies: [{ returns: null }, { throws: budgetError }],
  });

  assert.deepEqual(result, { dead: null, threwName: 'BudgetExceededError' });
  assert.deepEqual(spawns.map((s) => s.prompt), ['first prompt', 'second prompt']);
  assert.equal(spawns[0].opts.label, 'first');
  assert.equal(spawns[1].opts.label, 'second');
});

// ── acceptance leg 3: a self-test against a small fixture script ──
test('a fixture script proves the shim: the recorded spawn carries its opts, and the fixture return comes back as result', async () => {
  const opts = { agentType: 'derive', label: 'derive-fixture', phase: 'fixture-feature', schema: 'derivation', effort: 'low' };
  const scriptPath = writeFixture(`
    export const meta = { name: 'self-test-fixture' };
    const slice = await agent('derive the slice', ${JSON.stringify(opts)});
    return { slice, done: true };
  `);

  const { result, spawns } = await runWorkflowScript(scriptPath, { agentReplies: [{ returns: 'sliced' }] });

  assert.deepEqual(spawns, [{ prompt: 'derive the slice', opts }]);
  assert.deepEqual(result, { slice: 'sliced', done: true });
});

// ── acceptance leg 4: no top-level side effects — bare discovery is a no-op pass ──
test('bare `node --test` discovery of the shim module itself is a no-op pass', () => {
  // NODE_TEST_CONTEXT marks this process itself as a node:test child, which makes a
  // nested `node --test` invocation skip running entirely — clear it so the child below
  // is a genuine, independent run, the same as a bare `node --test` from a shell.
  const output = execSync('node --test test/execution-pipeline-harness.js', {
    encoding: 'utf8',
    env: { ...process.env, NODE_TEST_CONTEXT: undefined },
  });
  assert.match(output, /ℹ pass 1/);
  assert.match(output, /ℹ fail 0/);
});

// ── execution-context transport: embedded literal preferred; args object/string fallback ──
// Mirrors the resolution line in workflows/execution-pipeline.js so the harness keeps
// proving the in-process args path (object and JSON-string) while the spliced-script
// path can omit args entirely.
test('EMBEDDED_CONTEXT is preferred over args; object and JSON-string args still work when EMBEDDED_CONTEXT is null', async () => {
  const preferEmbedded = writeFixture(`
    export const meta = { name: 'ctx-prefer' };
    const EMBEDDED_CONTEXT = { source: 'embedded' };
    const executionContext = EMBEDDED_CONTEXT ?? (typeof args === 'string' ? JSON.parse(args) : args);
    return executionContext;
  `);
  const { result: preferred } = await runWorkflowScript(preferEmbedded, { args: { source: 'args' } });
  assert.deepEqual(preferred, { source: 'embedded' });

  const argsFallback = writeFixture(`
    export const meta = { name: 'ctx-args' };
    const EMBEDDED_CONTEXT = null;
    const executionContext = EMBEDDED_CONTEXT ?? (typeof args === 'string' ? JSON.parse(args) : args);
    return executionContext;
  `);
  const { result: fromObject } = await runWorkflowScript(argsFallback, { args: { source: 'object' } });
  assert.deepEqual(fromObject, { source: 'object' });

  const { result: fromString } = await runWorkflowScript(argsFallback, {
    args: JSON.stringify({ source: 'json-string' }),
  });
  assert.deepEqual(fromString, { source: 'json-string' });
});
