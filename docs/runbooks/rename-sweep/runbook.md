# rename-sweep — runbook record

Fixture-repo runbook (this repo's own binding): the CLI exercised from the outside,
as a user would, never in-process. This feature's own observable surface is the
swept vocabulary itself, so the bring-up tool is invoked under its own new name
(`bin/create-sample-repo.js`, the renamed `bin/probe-fixture.js`) — the bootstrap
posture in this feature's own design doc ("the run executes the code it launched
with") means this validation runs the swept tree's own renamed tools, not the
pre-sweep names its binding was originally written against.

## Bring-up

```
node bin/create-sample-repo.js
```
Printed a temp git repo path (`/var/folders/.../loop-probe-ovK0R5`) seeded as a
populated v2 target repository (`docs/architecture.md`, `docs/feature-graph.md`,
`docs/designs/greet-core/design.md`, `docs/designs/greet-cli/design.md`, committed
on `main`).

```
node bin/create-sample-repo.js empty
```
Printed a second temp path (`/var/folders/.../loop-probe-N3noFf`) seeded as the bare
cold-start variant (a git repo with no design/graph).

## Exercise

1. **Criterion 6 — machine orientation reads the swept graph.** Against the
   populated fixture:
   ```
   node <plugin-root>/bin/the-loop.js status --json
   ```
   Returned `mode: "configured"`, `position.byStatus: {designed:1, validated:1,
   shipped:0}`, `eligibleSet: ["greet-cli"]`, `proposal.kind:
   "advance-eligible-set"` — the swept enum values (`configured`, not the retired
   `active`) and the collapsed `status --json` subcommand (not the retired
   `orient`) both hold.

2. **Criterion 6 — cold-start proposal under the renamed enum.** Against the empty
   fixture:
   ```
   node <plugin-root>/bin/the-loop.js status --json
   ```
   Returned `mode: "unconfigured"` (the renamed `cold-start` value) and
   `proposal.kind: "onboard"`.

3. **Criterion 6 — run-preparation subcommand assembles a valid execution
   context.** Against the populated fixture:
   ```
   node <plugin-root>/bin/the-loop.js prepare-execution-context --features greet-cli --target-branch main
   ```
   Returned a JSON execution context: `target: "main"`, `scope: ["greet-cli"]`,
   `probe` (the fixture's own runbook text), `models` (the six role bindings,
   `build.rote` carrying `executor: "grok"` — the renamed `via`→`executor` field),
   `features.greet-cli` (`designDoc` read from `docs/designs/greet-cli/design.md`,
   `branch: "loop/greet-cli"` — the literal branch-shape convention held
   byte-unchanged per the map's sweep-mechanics notes, `builtTasks: []`), and a
   `cli` key. The renamed subcommand (`launch`→`prepare-execution-context`) and
   renamed flags (`--scope`→`--features`, `--target`→`--target-branch`) all held.

## Expected observations

- `status --json` against a populated fixture reports `configured` with a correct
  eligible set and an `advance-eligible-set` proposal.
- `status --json` against an empty fixture reports `unconfigured` with an `onboard`
  proposal.
- `prepare-execution-context --features <id> --target-branch <ref>` assembles a
  complete, valid execution context (target, scope, probe, models, per-feature
  entries with design doc + branch + builtTasks, cli) naming only the approved
  post-sweep vocabulary.

## Teardown

```
rm -rf /var/folders/.../loop-probe-ovK0R5 /var/folders/.../loop-probe-N3noFf
```
Confirmed removed — a directory listing of the parent temp dir shows no
`loop-probe-*` entries remaining.
