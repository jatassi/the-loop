# role-agent-binding — the agent field on the role-binding table

**Status:** designed 2026-07-08 (ADR-0050; split from the `ports-adapters-full`
rescope — this is the prong with no configure dependency, independently shippable).

Today the pipeline hardcodes which agent runs each role:
`plugin/workflows/execution-pipeline.js:23` —
`const agentTypeFor = (role) => (AGENT_NS ? `${AGENT_NS}:${role}` : role)`. Model
bindings swap the *model* per role and executor routing (ADR-0031/0047) swaps the
*runner*, but the agent definition itself — the behavior at `agents/plan.md` etc. —
has no configuration surface. A user with a custom validator in `.claude/agents/`
has no way to point the pipeline at it.

## The binding

The existing per-role table (role → `{model, effort?, executor?}`, ADR-0030, four
settings layers with provenance) gains one optional field:

```jsonc
"modelBindings": {
  "validate": { "agent": "my-validator", "model": "opus" }
}
```

- `agent` names a subagent type; the pipeline passes it as the spawn's `agentType`
  where it today passes `agentTypeFor(role)`. Name resolution (project
  `.claude/agents/`, user-level, other plugins' namespaces) is the harness's agent
  registry — inherited, not built.
- **Unbound → the bundled agent**, byte-for-byte today's behavior.
- The field rides the existing resolver and appears in the resolved-bindings output
  (`models-list`) with layer and provenance like every other binding.
- Applies to the roles the pipeline spawns (plan, build, validate, drive — and any
  role added later); a custom agent must honor the role's contract (the structured
  report schema the pipeline already enforces via `schema`).

## `agent` / `executor` exclusivity

A role binding may carry `agent` or `executor`, never both — they name different
runtimes (a subagent type vs. a CLI executor reached through the drive agent).
Both present is **rejected at resolution as a named configuration gap**: the
resolved view shows it, and the pipeline treats the role as blocked (can't-run,
distinct from ran-and-failed) rather than silently preferring one.

The legitimate composition is already expressible: executor routing spawns the
`drive` role, and `drive` (or `drive.<executor>`) is itself a row in the table — so
a custom drive agent is `agent` on the drive row, not `agent`+`executor` on the
routed role.

## Interfaces touched

- `plugin/src/resolve-model-bindings.js` — the binding shape admits `agent`;
  resolution rejects `agent`+`executor` on one role with a named gap.
- `plugin/workflows/execution-pipeline.js` — spawn sites read the resolved `agent`
  (fallback `agentTypeFor(role)`); the blocked-role posture reuses the existing
  stall reporting.
- `plugin/bin/cli-commands.js` — `models-list` renders the field.

## Constraints

- Plain ESM JS, no build step, `node:test`; the resolver stays pure.
- No new table, no new settings family — one field on the existing rows.
- Schema enforcement of the role contract stays where it is (the pipeline's
  `schema` option); the binding does not re-validate agents.

## Acceptance (mirrors the graph)

- A role binding carrying an agent name makes the pipeline spawn that agent type
  for the role; every unbound role spawns its bundled agent, byte-for-byte today's
  behavior.
- A role binding carrying both `agent` and `executor` is rejected at resolution as
  a named configuration gap — shown in the resolved view, role blocked at spawn,
  never silently resolved.
- The resolved-bindings output shows the agent field with its layer and provenance
  like every other binding.
