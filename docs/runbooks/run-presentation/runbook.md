# run-presentation — runbook record

Fixture-repo runbook (this repo's own binding): the CLI exercised from the outside,
as a user would, never in-process. `bin/create-sample-repo.js`'s populated fixture
(`greet-core` validated, `greet-cli` designed depending on it, `greet-farewell`
proposed) supplies a real graph + design doc for `prepare-execution-context`; a
hand-built alternate plugin root (a copy of `bin/` + `src/` + `config/` +
`docs/executors/` with a caller-controlled `workflows/execution-pipeline.js`, the
same trick `test/prepare-execution-context-script-out.test.js` uses) supplies the
malformed-canonical-script case for criterion 2, since the shipped canonical script
always carries the expected shape.

## Bring-up

```
node bin/create-sample-repo.js
```
Printed a temp git repo path (`/var/folders/.../loop-probe-CZ4Grx`) seeded as a
populated v2 target repository, committed on `main`.

## Exercise

1. **Criterion 1 — `--script-out` writes a spliced copy; without it, nothing is
   written; stdout is unchanged either way.**
   ```
   cd <fixture>
   node <plugin-root>/bin/the-loop.js prepare-execution-context \
     --features greet-cli --target-branch main > stdout-no-flag.json
   node <plugin-root>/bin/the-loop.js prepare-execution-context \
     --features greet-cli --target-branch main --script-out /tmp/spliced.js
   ```
   Without `--script-out`: exit 0, no file written. With it: exit 0, stdout
   byte-identical to the no-flag run, and `/tmp/spliced.js` written. Diffing it
   against `<plugin-root>/workflows/execution-pipeline.js` showed exactly one
   changed line — the `meta` line — reading
   `description: "greet-cli → main"` (the one in-scope id, arrow, target branch),
   JSON-stringified into a double-quoted literal; every other line, including the
   rest of the same `meta` declaration (`name`, `whenToUse`, `phases`), was
   untouched and the declaration still spans one physical line.

2. **Criterion 2 — quote-safety and the shape gate.**
   Quote-safety is covered end-to-end by criterion 1's exercise (the target branch
   `main` round-trips through `JSON.stringify`; the automated suite
   (`test/splice-workflow-description.test.js`) separately proves a description
   carrying quotes/backslashes round-trips byte-exact — re-run directly:
   `node --test test/splice-workflow-description.test.js`, 5/5 pass).
   For the shape gate, built an alternate plugin root whose
   `workflows/execution-pipeline.js` declares `meta` across multiple physical
   lines (no one-line `description: '…'` shape):
   ```
   node <bad-plugin-root>/bin/the-loop.js prepare-execution-context \
     --features greet-cli --target-branch main --script-out /tmp/gate.js
   ```
   Exit 1; stdout empty; stderr: `spine: canonical workflow script's meta line
   does not carry the expected description: '…' shape — refusing to splice`;
   `/tmp/gate.js` was never created.

3. **Criterion 3 — no spawn label carries a phase/agentType prefix.**
   Read the four spawn sites directly in the merged
   `workflows/execution-pipeline.js`:
   `plan` → `label: f.id`; `build` → `` label: `${f.id}/${task.id}` ``; `drive` →
   `` label: `${f.id}/${task.id} via ${binding.executor}` ``; `validate` →
   `label: f.id`. None carries a `plan:`/`build:`/`drive:`/`validate:` prefix.
   Cross-checked against the automated suite, which drives the real engine
   in-process against a scripted two-feature scope and asserts the exact label
   list: `node --test test/execution-pipeline-happy.test.js
   test/execution-pipeline-drive.test.js`, both green — labels observed were
   `['alpha', 'alpha/t1', 'alpha/t2', 'alpha', 'beta', 'beta/feature', 'beta']`
   and `'alpha/t1 via grok'`.

4. **Criterion 4 — the launch leg passes `--script-out`; `scriptPath` is the
   spliced path, never the canonical file.**
   Read `commands/the-loop.md` directly: the prepare-execution-context step's
   invocation now ends `--script-out <session-scratch path>`, and the following
   Workflow-call step reads `` scriptPath` = the `--script-out` path from step 2
   — never the canonical `workflows/execution-pipeline.js` directly ``. Grepping
   the file for a direct `scriptPath` → canonical-file binding found none.
   Automated coverage: `node --test test/skills-and-command-sweep.test.js`,
   green, including the new assertion that `scriptPath` never binds to
   `${CLAUDE_PLUGIN_ROOT}/workflows/execution-pipeline.js`.

## Expected observations

- `--script-out` writes a launch-ready per-run script differing from the
  canonical file only in its `meta` description; without the flag, nothing is
  written; stdout is the unchanged execution context in both cases.
- The spliced description is JSON-stringified (quote-safe) and the `meta`
  declaration stays one physical line.
- A canonical script whose `meta` line doesn't carry the expected
  `description: '…'` shape makes the command exit 1 with nothing written —
  stdout included.
- No spawn label carries a phase/agentType prefix; `plan`/`validate` labels are
  the bare feature id, `build` labels are `<feature>/<task>`, `drive` labels are
  `<feature>/<task> via <executor>`.
- The `/the-loop` launch leg passes `--script-out` and binds the Workflow call's
  `scriptPath` to that spliced path, never the canonical `workflows/` file.

## Teardown

```
rm -rf /var/folders/.../loop-probe-CZ4Grx
```
Confirmed removed. The alternate "bad" plugin root and the `/tmp/spliced.js` /
`/tmp/gate.js` scratch outputs (this session's scratchpad, not the target repo)
were removed the same way once each check above was recorded.
