# the-loop-entry — /the-loop stateful command + cold-start detection

**Status:** shipped (v1; front door slimmed by the v2 taming, ADR-0034).

## What it is

`/the-loop` (commands/the-loop.md) is the project's front door: it runs
`node bin/the-loop.js orient`, states the inferred position, proposes the next
action as a recommended default, and waits for the human's confirm-or-override.

The deterministic core is `src/entry.js`:

- `detectState(root)` — `cold-start` (no graph, no design → onboarding),
  `partial` (design without graph → repair), `active`.
- `frontier(model)` — features still `designed` with every dependency
  `validated|shipped`.
- `propose(model)` — precedence: `advance-frontier` → `blocked` (safety net: only
  reachable on a broken graph) → `ship` (validated features, empty frontier) →
  `new-intake`.
- `orient(root)` — the one call the command surface makes; never throws on an
  unconfigured repo (cold-start is an answer, not an error).

## v2 notes

Orientation carries no ledger pointer and no parked list — parks are not durable
state (ADR-0034). The launch leg is one CLI call (`the-loop launch`) plus one Workflow
call; boundary relay is prose in the chat, with `blocked` entries presented as
questions. `the-loop ledger` prints the human-readable status story on demand.
