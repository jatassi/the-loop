// The approval corridor's decision core (ADR-0033): deploy -> smoke -> conclude,
// with a single delegated rollback + one verification re-run on any failure. Pure
// and retry-free by construction — every step name is derived from the results
// seen so far, never revisited once yielded, so the bin edge (spine ship corridor)
// can drive it one step at a time without risking a second autonomous swing at prod.

/** The corridor's four pinned step names, in the order a single run can visit them. */
export const STEPS = ['deploy', 'smoke', 'rollback', 'smoke-verify'];

/**
 * @typedef {Object} CorridorBinding
 * @property {string} deploy
 * @property {string} rollback
 * @property {string} [smoke]           absent = no mechanical health signal (ADR-0033)
 */

/**
 * @typedef {Object} CorridorResult
 * @property {string} step              one of STEPS
 * @property {boolean} ok
 */

/**
 * @typedef {Object} CorridorStep
 * @property {string} step              one of STEPS
 * @property {string} command           the binding's command string for that step
 */

/**
 * @typedef {Object} CorridorConclusion
 * @property {string} outcome           deployed | rolled-back | deploy-failed
 * @property {boolean} [rollback_verified]   present exactly when a rollback ran and a
 *           smoke suite verified it; absent when no smoke suite exists to verify with
 * @property {boolean} health_signal    whether the binding carries a smoke suite at all
 */

/**
 * Given a deploy-target binding and the results observed so far, yield the next step
 * to execute or the corridor's conclusion. Never executes anything itself — commands
 * are carried as strings for the bin edge to run and report back.
 * @param {CorridorBinding} binding
 * @param {CorridorResult[]} results
 * @returns {CorridorStep|CorridorConclusion}
 */
export function nextCorridorStep(binding, results = []) {
  const done = Object.fromEntries(results.map(({ step, ok }) => [step, ok]));
  if (!('deploy' in done)) {
    return { step: 'deploy', command: binding.deploy };
  }
  return done.deploy ? afterDeployOk(binding, done) : afterRollbackNeeded(binding, done, 'deploy-failed');
}

function afterDeployOk(binding, done) {
  if (!binding.smoke) {
    return { outcome: 'deployed', health_signal: false };
  }
  if (!('smoke' in done)) {
    return { step: 'smoke', command: binding.smoke };
  }
  if (done.smoke) {
    return { outcome: 'deployed', health_signal: true };
  }
  return afterRollbackNeeded(binding, done, 'rolled-back');
}

// Reached after either deploy itself failed or a post-deploy smoke check failed —
// both roll back exactly once, then re-verify with smoke when a suite exists.
function afterRollbackNeeded(binding, done, outcome) {
  const hasSmoke = Boolean(binding.smoke);
  if (!('rollback' in done)) {
    return { step: 'rollback', command: binding.rollback };
  }
  if (!binding.smoke) {
    return { outcome, health_signal: hasSmoke };
  }
  if (!('smoke-verify' in done)) {
    return { step: 'smoke-verify', command: binding.smoke };
  }
  return { outcome, rollback_verified: done['smoke-verify'], health_signal: hasSmoke };
}
