# ports-adapters-full — documented external-surface bindings, consumed

**Status:** designed 2026-07-08 from `docs/briefs/ports-adapters-full.md` (ADR-0050;
rescoped from "swapping + capability-contract enforcement" — that framing is dead,
along with the v1 typed port inventory it came from).

Configure (ADR-0049) captures artifact-store bindings — `"artifactStores":
{ "features": "local", … }` under the namespaced `"the-loop"` key — but nothing
consumes them. This feature is the consumption side, on the documentation-as-adapter
posture: **the documentation is the adapter; the agent is the runtime.** No adapter
code, no registry, no dispatch layer. The proving swap is real: features → Linear on
the human's Linear account.

The sibling feature `role-agent-binding` owns the phase-agent prong (the `agent`
field on the role-binding table); this feature owns external surfaces only.

## Adapter shapes (descriptive, never enforced)

Six first-class shapes an adapter can take: files, CLIs, Skills, MCPs, subagents,
harness built-ins. (Bare HTTP APIs collapse into CLI; browser automation is a known
edge, not first-class.) The taxonomy is vocabulary for the adapter doc and the
configure interview — the access-instructions prose is the actual contract. Nothing
validates shape membership; enforcing the list as a closed enum would be the v1
instinct sneaking back in.

## The adapter doc — `docs/adapters/<surface>.md`

One file per **nondefault** binding, created at capture. A default (local) project
has zero files in `docs/adapters/` — the pattern's carrying cost is pay-per-swap.
The three recorded bindings in `architecture.md` (validation procedure, release
runbook, operations toolkit) are Design's narrative artifacts and do not migrate.

Template (the operations-toolkit shape, generalized):

- **What lives here** — which project truth this surface holds, and the truth rule
  (bound = this surface is *sole* truth for that truth; no mirror, no split-brain).
- **Access** — how an agent reaches it: the shape (MCP server name, CLI, …),
  auth/workspace context, and the concrete calls or commands for each operation.
- **Operations** — each tagged **read** or **mutate** at recording time.
- **Caveats & gotchas** — operational knowledge: rate limits, auth quirks,
  field-mapping surprises, the unbind/export path. Distinct from trade-offs, which
  are surfaced conversationally at capture and not required to be recorded.

## Capture gate (extends configure's interview)

When the configure interview captures a nondefault artifact-store binding:

1. **Surface the trade-offs versus the in-repo default** (e.g. features → Linear
   forfeits git-versioned history and offline greppability) and get explicit human
   acceptance — acceptance is the gate; the prose is conversational.
2. **Run a reachability probe** — whatever the shape implies: MCP server connected,
   CLI on PATH, path readable. A failed probe is surfaced with fix-now or
   bind-anyway. Never a silent write, never a hard block.
3. **Write the adapter doc** at `docs/adapters/<surface>.md` and the settings
   pointer under `"the-loop".artifactStores`.
4. **Migrate truth in** where the surface replaces an existing local artifact
   (features: push the current graph — records, edges, acceptance — into the bound
   surface via its documented access, verify the round-trip, then retire the local
   file). Import is part of capture, human-confirmed like every configure write.
   Before the local artifact is retired, **offer a backup**: a pre-swap git tag
   marking the last local-truth commit (default), or a stamped copy if the human
   prefers one — the retirement commit already preserves the file in history, but
   the offer makes the recovery point explicit rather than archaeological.

## Consumption mechanics — full swap via ephemeral snapshot

Decided at Design (ADR-0050): a bound surface is **sole truth** for its artifact —
no mirror mode, no status-only split. For features → Linear: issues are feature
records, `blockedBy` relations are dependency edges, acceptance criteria are prose
in an issue field, statuses map to Linear workflow states. `docs/feature-graph.md`
ceases to exist for a bound project (the backlog's `proposed` records live in the
bound surface too).

The pure core stays file-substrate and unchanged. The interchange is a
**materialized snapshot**:

- At run start (and at the front door's status leg), the launch-leg agent follows
  the adapter doc's access path, reads the bound surface, and materializes the same
  YAML graph model as an ephemeral snapshot file — temp/scratchpad, gitignored,
  never committed, torn down at run end (the ship-temp-teardown rule applies).
- The existing pure core and CLI run against the snapshot unchanged. The CLI
  subcommands that today hardcode `docs/feature-graph.md` (`propose-next-action`,
  `prepare-execution-context`, `set-feature-status`, `check`) gain an optional
  graph-path argument; the default path is untouched.
- **Mutations invert, Linear-first:** where the loop today calls
  `set-feature-status` on the file, the bound path updates the surface first (a
  mutate operation per the adapter doc), then refreshes the snapshot. A crash
  leaves truth ahead of cache, never behind.
- **Bound-but-unreachable at use time** is a surfaced can't-run deviation naming
  the surface, distinct from ran-and-failed. Never a silent fallback to local
  state — that would fork project truth.
- **Unbinding is a migration**, documented in the adapter doc's caveats: export
  the surface's truth back to `docs/feature-graph.md` (one final snapshot,
  committed), remove the settings pointer and the adapter doc; subsequent runs
  resolve `features: local` with a visible fallback line.

## Interfaces touched

- `plugin/bin/cli-commands.js` — graph-consuming subcommands accept an optional
  graph path (default `docs/feature-graph.md`); no parser changes.
- `plugin/skills/configure/` (when built) — the capture gate above; this design
  amends the configure interview's artifact-store leg.
- `plugin/skills/begin/` front door + `plugin/skills/execution-pipeline/`
  launch leg — when the resolved `artifactStores.features` is nondefault: read
  `docs/adapters/features.md`, materialize the snapshot before any graph read, and
  route status writes through the documented mutate path.
- `plugin/agents/validate.md` — validators of bound projects receive the snapshot
  path in the execution context like any graph path; no independent Linear access.
- New: `docs/adapters/` (this repo gains `docs/adapters/features.md` only when the
  Linear proof binding is captured).

## Constraints

- Harness-native primitives only: the Linear access path is its MCP server (or CLI)
  as documented in the adapter doc; credentials/workspace are capture-time facts.
- Acceptance runs touching Linear are interactive, not CI-deterministic — accepted
  by choosing a real proof (brief). The snapshot/pure-core seam keeps everything
  below the agent testable with fixture snapshots.
- **The Linear proof runs against a sandbox project** — a scratch repo bound to a
  scratch Linear team — never against the-loop's own feature graph. This repo's
  graph stays local truth; dogfooding the swap is a possible later intake, after
  the pattern has proven itself somewhere expendable.
- Plain ESM JS, no build step, `node:test`; pure-core/thin-CLI discipline holds —
  all surface I/O is agent-performed per the adapter doc, never in the core.

## Acceptance (mirrors the graph)

- Capturing a nondefault artifact-store binding surfaces trade-offs for explicit
  acceptance and runs a reachability probe before any write; probe failure offers
  fix-now or bind-anyway; nothing is written silently.
- Every captured nondefault binding has `docs/adapters/<surface>.md` answering:
  what lives there, how to access it, operations tagged read/mutate, caveats.
- With features bound to Linear on a real account: a run derives its execution
  context from Linear truth (issues, blockedBy edges, acceptance prose) through an
  ephemeral materialized snapshot; status transitions write back Linear-first; the
  snapshot is torn down, never committed.
- Removing the binding (after the documented export path restores
  `docs/feature-graph.md`) returns the project to in-repo behavior with a visible
  fallback line.
- A bound-but-unreachable surface reports can't-run naming the surface — never a
  silent fallback to local state.

## Validation notes — criterion 4 live proof (2026-07-09, session-run)

The loop's `validate` agent has no MCP access, so the autonomous run validated
criteria 1,2,3,5,6 (fixture/snapshot-based) and the merged feature landed; the
live features→Linear round-trip (criterion 4) was proven by the session against a
sandbox Linear team (workspace `the-loop-jatassi`, team **The-loop**):

- **Derive-from-Linear:** two issues — `THE-5` (graph-core, state Todo→designed)
  and `THE-6` (front-door, state Backlog→proposed, `blockedBy` THE-5) — were
  materialized into an ephemeral snapshot graph (issue→feature record,
  blockedBy→depends_on, workflow state→loop status, description `## Acceptance`→
  acceptance prose). `the-loop prepare-execution-context --features graph-core
  --target-branch main --graph-path <snapshot>` derived its context from that
  Linear-sourced snapshot (scope resolved to graph-core; front-door correctly
  ineligible while proposed).
- **Status transition, Linear-first:** graph-core designed→validated was written
  to Linear first (THE-5 Todo→In Progress via the MCP mutate), THEN the snapshot
  was refreshed from Linear. Proof it flowed through: after also flipping THE-6 to
  designed, `prepare-execution-context --features front-door --graph-path
  <refreshed-snapshot>` newly resolved front-door as eligible — buildable ONLY
  because its dependency's Linear status had changed.
- **Ephemeral:** the snapshot lived in session scratch, was never `git add`-ed, and
  was torn down at proof end.

The sandbox proof issues THE-5/THE-6 are labeled "safe to delete"; they are the
human's to clean up (per the sandbox-only, never-this-repo's-graph constraint).
