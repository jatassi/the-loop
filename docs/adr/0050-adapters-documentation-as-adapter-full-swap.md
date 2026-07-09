---
status: accepted
date: 2026-07-08
---

# ADR-0050 · Adapters: documentation-as-adapter, full-swap truth via ephemeral snapshot, pay-per-swap docs

**Context.** The `ports-adapters-full` backlog node reached Define and was rescoped
(brief 2026-07-08, `docs/briefs/ports-adapters-full.md`): the original "swapping +
capability-contract enforcement" framing was the overengineered end of the spectrum
ADR-0037 already walked away from; the brief pins the middle ground. ADR-0049's
configure step captures artifact-store bindings but nothing consumes them; the
capture side needed its consumption side, and the pipeline's phase agents had no
swap surface at all (`agentTypeFor(role)` hardcodes bundled names). A real second
adopter arrived: the human's Linear account, chosen as the proving swap
(features → Linear). Resolved by grilling across Define and Design, 2026-07-08.

**Decision.**

- **Documentation is the adapter; the agent is the runtime.** A nondefault external
  binding is one settings pointer plus one adapter doc at
  `docs/adapters/<surface>.md` — what lives there, how to access it, operations
  tagged read/mutate, caveats/gotchas. The consuming phase's agent reads the doc
  and follows it. No adapter code, no registry, no dispatch layer. The shape
  taxonomy (files, CLIs, Skills, MCPs, subagents, harness built-ins) is
  descriptive vocabulary, never an enforced enum — the access prose is the
  contract.
- **Full swap: a bound surface is sole truth for its artifact.** For features →
  Linear, issues are records, `blockedBy` relations are dependency edges,
  acceptance criteria are prose fields; `docs/feature-graph.md` ceases to exist
  for a bound project. No mirror mode and no status-only split — a partial home
  forks project truth.
- **The interchange is an ephemeral materialized snapshot.** At run start the
  launch-leg agent materializes the bound surface into the existing YAML graph
  model (temp, gitignored, torn down at run end); the pure core runs against it
  unchanged, with graph-consuming CLI subcommands gaining only an optional
  graph-path argument. Mutations invert Linear-first, snapshot-second — a crash
  leaves truth ahead of cache. Bound-but-unreachable is a surfaced can't-run
  deviation naming the surface; never a silent fallback to local state.
- **Capture gate, not contract enforcement.** At capture the configure interview
  surfaces trade-offs versus the in-repo default for explicit human acceptance
  (conversational — not a recorded schema) and runs a reachability probe; a failed
  probe offers fix-now or bind-anyway. Never a silent write, never a hard block.
  Truth migrates in at capture (import, round-trip-verified) and back out at
  unbind (export restores the local artifact) — both documented in the adapter
  doc's caveats. Before a replaced local artifact is retired, the swap offers a
  backup (default: a pre-swap git tag naming the last local-truth commit) so the
  recovery point is explicit, not archaeological.
- **Pay-per-swap documentation home.** `docs/adapters/` holds one file per
  nondefault binding; a default project has zero files there. The three
  `architecture.md` recorded bindings (validation/release runbooks, operations
  toolkit) are Design's narrative artifacts and do not migrate.
- **Phase agents get a swap surface: one field, split into its own feature**
  (`role-agent-binding`, no configure dependency). The role-binding table gains
  optional `agent` (a subagent type; harness registry resolves it; unbound → the
  bundled agent). `agent` and `executor` on one role are mutually exclusive,
  rejected at resolution as a named gap — the composition want is already
  expressible as `agent` on the `drive` row.

**Why.** The v1 inventory failed on carrying cost, not on the idea of swappable
surfaces; documentation-as-adapter drops the cost to one small file that exists
only when a swap exists. Full-swap keeps the truth rule one sentence. The snapshot
seam gets external truth into a pure, already-tested core with zero core changes,
and keeps everything below the agent testable with fixture snapshots. Loud
exclusivity beats precedence rules — whichever field silently lost would surprise
whoever set it.

**Considered and rejected.** Reviving the typed port inventory or any
capability-contract enforcement machinery (probe + human-accepted trade-offs is
the whole capture-time story); mirror-only Linear (a dashboard, not a store —
fails the brief's read-truth acceptance); status-in-Linear/structure-in-repo split
(Linear carries edges and prose fine, and split truth is fork-prone); a
dual-substrate core (adapter code in the pure core, MCP I/O included); adapter
docs as `architecture.md` sections (the hot reader is an agent wanting 20 lines,
and the file compounds per binding); prose inside the settings key (machine config
never swallows narrative, ADR-0049); `agent`/`executor` precedence rules (silent
resolution); a guarantee-flag schema (trade-offs are conversational); a prior-art
web survey (the external prong's industry answer is MCP itself, already a
first-class shape — nothing to buy instead of thin glue plus documentation).
