# the-loop-entry — /begin stateful command + unconfigured detection

**Status:** shipped (v1; front door slimmed by the v2 taming, ADR-0034).

## What it is

`/begin` (plugin/skills/begin/SKILL.md) is the project's front door: it runs
`node bin/the-loop.js status --json`, states the inferred position, proposes the
next action as a recommended default, and waits for the human's confirm-or-override.

The deterministic core is `src/propose-next-action.js`:

- `detectState(root)` — `unconfigured` (no graph, no design → onboarding),
  `partial` (design without graph → repair), `configured`.
- `eligibleSet(model)` — features still `designed` with every dependency
  `validated|shipped`.
- `propose(model)` — precedence: `advance-eligible-set` → `blocked` (safety net:
  only reachable on a broken graph) → `release` (validated features, empty
  eligible set) → `new-intake`.
- the machine orientation — the one call the command surface makes (backing
  `the-loop status --json`); never throws on an unconfigured repo (unconfigured is
  an answer, not an error).

## v2 notes

Orientation carries no status pointer and no parked list — parks are not durable
state (ADR-0034). The run-preparation leg is one CLI call
(`the-loop prepare-execution-context`) plus one Workflow call; boundary relay is
prose in the chat, with `blocked` entries presented as questions. `the-loop status`
prints the human-readable status story on demand.
