// A scripted deploy-target fixture for `spine ship corridor`'s subprocess CLI tests
// (ADR-0033): the `{deploy, rollback, smoke}` command strings a corridor test binding
// carries all point here. Every invocation appends its step name (argv[2]) to
// JOURNAL_FILE (env var) so a test can assert invocation order, and its own exit code
// (0 ok, 1 fail) is read from CONTROL_FILE (env var, optional JSON {deploy?, rollback?,
// smoke?}): a bare boolean applies to every invocation of that step; an array is read
// by invocation count, since smoke runs twice on a rollback path — once as the
// pre-rollback check, again as the post-rollback verify — and a test may need the two
// to disagree. A step missing from CONTROL_FILE, or no CONTROL_FILE at all, defaults to
// ok. Never invokes any claude command — the real plugin CLI never enters this suite.
//
// Lives under test/, which `node --test` sweeps recursively: a bare sweep calls this
// file with no argv and no env, so the no-step case below is a no-op pass, not a usage
// error.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const step = process.argv[2];

if (step) {
  const journalFile = process.env.JOURNAL_FILE;
  if (journalFile) {
    process.exitCode = runStep(step, journalFile) ? 0 : 1;
  } else {
    process.stderr.write('deploy-target.js: JOURNAL_FILE env var is required\n');
    process.exitCode = 1;
  }
}

// Journals the invocation, then resolves its pass/fail from CONTROL_FILE — reading the
// journal's own prior lines for this step name as the invocation count, so a repeat
// invocation (smoke, verified again post-rollback) can be told apart from the first.
function runStep(name, journalFile) {
  const priorInvocations = existsSync(journalFile)
    ? readFileSync(journalFile, 'utf8').split('\n').filter((line) => line === name).length
    : 0;
  appendFileSync(journalFile, `${name}\n`);

  const control = process.env.CONTROL_FILE && existsSync(process.env.CONTROL_FILE)
    ? JSON.parse(readFileSync(process.env.CONTROL_FILE, 'utf8'))
    : {};
  const setting = control[name];
  return Array.isArray(setting) ? setting[Math.min(priorInvocations, setting.length - 1)] : (setting ?? true);
}
