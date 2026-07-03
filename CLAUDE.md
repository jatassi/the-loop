# the-loop — working rules

## Hand-maintenance of loop artifacts (temporary)

Until the-loop enforces artifact maintenance itself (the surfacing + ledger features,
post-self-hosting), any commit that advances a feature must, in that same commit:

1. Move the feature's `status` in the feature graph (`docs/design/design.md`) — a
   hand-built feature becomes `validated` when its acceptance criterion demonstrably
   passes (tests + `npm run check` green).
2. Re-render `docs/ledger/ledger.md` by hand to match. The Ledger is a derived
   projection (ADR-0006); it must never disagree with the graph.

**Remove this section once the-loop is in place to enforce the rule itself.**

## Open actions

Design/process actions that live nowhere else are tracked in `docs/actions/actions.md`.
Delete an item when it lands — git history is the archive.

## Subagents

Always include the model name in subagent titles like this: `[Opus] Do the thing`, `[Sonnet] Do the less complex thing`, `[Fable] Do the complex thing`.
