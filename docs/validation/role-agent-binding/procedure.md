# role-agent-binding — runbook record

Fixture-repo runbook (this repo's own binding): the CLI exercised from the outside,
as a user would, never in-process. `models-list` output was asserted on directly
against the fixture repo; the pipeline's blocked posture on the agent+executor gap
was corroborated by reading `plugin/workflows/execution-pipeline.js` and by running
`test/execution-pipeline-agent.test.js`, since driving a live agent spawn through
the pipeline is out of scope for a runbook exercise.

## Bring-up

```
node bin/create-sample-repo.js
```
Printed a temp git repo path (a `loop-probe-*` directory under the OS temp root)
seeded as a populated v2 target repository, and
```
node <worktree>/plugin/bin/the-loop.js status --json
```
against that fixture (cwd = fixture) returned mode `configured`, eligible set
`[greet-cli]`, proposal `advance-eligible-set`.

## Exercise

1. **Criterion 1/3 — a bound `agent` resolves with layer + provenance in the
   resolved view.**
   Wrote `.claude/settings.local.json` in the fixture with
   `validate: { model: "opus", agent: "my-validator" }` (and additionally
   `plan: { agent: "my-planner" }`, `build: { agent: "custom-build" }` to cover
   multiple roles). Ran:
   ```
   node <worktree>/plugin/bin/the-loop.js models-list
   ```
   Exit 0. Output's `validate` entry: `{ model: "opus", agent: "my-validator",
   provenance: "local" }`; `plan` and `build` entries similarly carried their bound
   `agent` value stamped `provenance: "local"` — the field rides the resolver
   exactly like `model`/`effort`/`executor`.

2. **Criterion 2 — `agent`+`executor` on one role is a named configuration gap.**
   Wrote `validate: { model: "grok-4.5", agent: "my-validator", executor: "grok" }`
   (a playbook-valid model, so the registry's own model-validity check doesn't mask
   the gap under test). Ran `models-list` again: exit 0, empty stderr, `validate`
   entry carried `agent`, `executor`, and `gap: "agent-and-executor"` alongside
   `provenance: "local"` — the resolved view shows the conflict rather than
   silently preferring one field, confirming resolution never throws on this case
   but always stamps it.

   Pipeline-blocked posture (never silently picks agent or executor) was confirmed
   by reading `execution-pipeline.js` — `binding.gap` short-circuits `runPlan`,
   `runTask` (build), and `runValidate` to a `blocked` result before any spawn, and
   `executorReroute` checks `driveBinding.gap` the same way — and by running
   `test/execution-pipeline-agent.test.js`, whose third case asserts zero spawns
   for the gapped role (`my-validator`, `drive`, and bare `validate` agentTypes all
   absent from the spawn list) and `result.blocked` naming
   `{ feature: 'alpha', reason: 'agent-and-executor' }`.

3. **Criterion 1 (unbound byte-for-byte) — corroborated by
   `test/execution-pipeline-agent.test.js`'s first two cases**, which assert
   `spawns.map(s => s.opts.agentType)` for an unbound `plan`/`build` alongside a
   bound `validate` role, both with and without a non-empty `agentNamespace`: the
   unbound roles keep the namespaced bundled `agentTypeFor(role)` (e.g. `plan`,
   `the-loop:plan`) while the bound role's `agentType` is the bound name verbatim
   (`my-validator`).

Also ran the full suite (`npm test`, 178/178 pass) and lint (`npm run lint`,
clean) against the assembled tree.

## Teardown

`rm -rf` of the fixture path printed by `create-sample-repo.js`; confirmed removed.
