import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nextCorridorStep } from '../src/corridor.js';

const BINDING = { deploy: 'do-deploy', rollback: 'do-rollback', smoke: 'do-smoke' };
const NO_SMOKE_BINDING = { deploy: 'do-deploy', rollback: 'do-rollback' };
const STEP_GUARD = 10;

test('driven with no results yet, the corridor yields deploy carrying the binding command', () => {
  assert.deepEqual(nextCorridorStep(BINDING, []), { step: 'deploy', command: 'do-deploy' });
});

test('deploy ok + smoke ok concludes deployed', () => {
  const results = [{ step: 'deploy', ok: true }, { step: 'smoke', ok: true }];
  assert.deepEqual(nextCorridorStep(BINDING, results), { outcome: 'deployed', health_signal: true });
});

test('deploy ok + smoke fail yields rollback then smoke-verify', () => {
  const afterSmokeFail = [{ step: 'deploy', ok: true }, { step: 'smoke', ok: false }];
  assert.deepEqual(nextCorridorStep(BINDING, afterSmokeFail), { step: 'rollback', command: 'do-rollback' });

  const afterRollback = [...afterSmokeFail, { step: 'rollback', ok: true }];
  assert.deepEqual(nextCorridorStep(BINDING, afterRollback), { step: 'smoke-verify', command: 'do-smoke' });
});

test('smoke-verify ok concludes rolled-back with rollback_verified true', () => {
  const results = [
    { step: 'deploy', ok: true },
    { step: 'smoke', ok: false },
    { step: 'rollback', ok: true },
    { step: 'smoke-verify', ok: true },
  ];
  assert.deepEqual(nextCorridorStep(BINDING, results), {
    outcome: 'rolled-back', rollback_verified: true, health_signal: true,
  });
});

test('smoke-verify fail concludes rolled-back with rollback_verified false', () => {
  const results = [
    { step: 'deploy', ok: true },
    { step: 'smoke', ok: false },
    { step: 'rollback', ok: true },
    { step: 'smoke-verify', ok: false },
  ];
  assert.deepEqual(nextCorridorStep(BINDING, results), {
    outcome: 'rolled-back', rollback_verified: false, health_signal: true,
  });
});

test('deploy fail yields rollback (still invoked) then smoke-verify, concluding deploy-failed with rollback_verified from that verify', () => {
  const afterDeployFail = [{ step: 'deploy', ok: false }];
  assert.deepEqual(nextCorridorStep(BINDING, afterDeployFail), { step: 'rollback', command: 'do-rollback' });

  const afterRollback = [...afterDeployFail, { step: 'rollback', ok: true }];
  assert.deepEqual(nextCorridorStep(BINDING, afterRollback), { step: 'smoke-verify', command: 'do-smoke' });

  const afterVerify = [...afterRollback, { step: 'smoke-verify', ok: true }];
  assert.deepEqual(nextCorridorStep(BINDING, afterVerify), {
    outcome: 'deploy-failed', rollback_verified: true, health_signal: true,
  });
});

test('no-smoke degradation: deploy ok concludes deployed with health_signal false and never yields rollback', () => {
  assert.deepEqual(nextCorridorStep(NO_SMOKE_BINDING, [{ step: 'deploy', ok: true }]), {
    outcome: 'deployed', health_signal: false,
  });
});

test('no-smoke degradation: deploy fail yields rollback then concludes deploy-failed with no rollback_verified field', () => {
  const afterDeployFail = [{ step: 'deploy', ok: false }];
  assert.deepEqual(nextCorridorStep(NO_SMOKE_BINDING, afterDeployFail), { step: 'rollback', command: 'do-rollback' });

  const afterRollback = [...afterDeployFail, { step: 'rollback', ok: true }];
  const conclusion = nextCorridorStep(NO_SMOKE_BINDING, afterRollback);
  assert.deepEqual(conclusion, { outcome: 'deploy-failed', health_signal: false });
  assert.ok(!('rollback_verified' in conclusion));
});

test('no retry transitions: every step name is yielded at most once, across every pass/fail combination of the four steps', () => {
  for (const okFor of everyStepOutcomeCombo()) {
    const visited = driveToConclusion(BINDING, okFor);
    assert.equal(new Set(visited).size, visited.length, `combo ${JSON.stringify(okFor)} repeated a step: ${visited}`);
  }
});

// Every {deploy, smoke, rollback, smoke-verify} pass/fail combination, 16 in all.
function everyStepOutcomeCombo() {
  let combos = [{}];
  for (const key of ['deploy', 'smoke', 'rollback', 'smoke-verify']) {
    combos = combos.flatMap((combo) => [true, false].map((ok) => ({ ...combo, [key]: ok })));
  }
  return combos;
}

// Drives the corridor to conclusion, feeding each yielded step's outcome back in.
function driveToConclusion(binding, okFor) {
  const visited = [];
  let results = [];
  for (let guard = 0; guard < STEP_GUARD; guard += 1) {
    const next = nextCorridorStep(binding, results);
    if ('outcome' in next) {
      break;
    }
    visited.push(next.step);
    results = [...results, { step: next.step, ok: okFor[next.step] }];
  }
  return visited;
}
