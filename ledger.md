# Ledger — the-loop   ·   projected from design.md (feature graph) · established at Design finalize, 2026-06-29

## What this is
the-loop: an owned, composable agentic dev loop built from native Claude Code primitives, shipped as a plugin. It moves an idea through the full SDLC and — by design — its first job is to build itself. Full design in [design.md](design.md); the *why* of every choice in [docs/adr/](docs/adr/).

## Where we are
**Design complete.** The feature graph is established: **10 walking-skeleton features + 10 deferred** (built by self-hosting), all `designed`, nothing built yet.

- ○ 20 / 20 features — `designed`
- ▶ Next milestone — **the walking skeleton (v1.0)**: the thinnest end-to-end greenfield engine that reaches self-hosting.

## What needs you
Nothing parked — no open escalations. The next action is to **start building the skeleton**.

## What's next
Build the walking skeleton in dependency order:

`artifact-spine` *(no deps — start here)* → `the-loop-entry` → `frame` · `plan-phase` · `build-phase` → `validate-phase` → `inner-loop-workflow` → `surfacing` → `ship-phase`.

The moment that path is green end-to-end, **stop hand-building and self-host** — feed the 10 deferred features (worktree parallelism, System Map, brownfield, Evolve, Operate, calibration, full configure/ports, research tiers, severity-tiering) through the-loop as its own intakes.

## Run history
None yet. This Ledger was hand-established at Design finalize (ADR-0006: the Ledger is born when Design finalizes). Run history begins with the first `/the-loop` build run — at which point this file becomes loop-rendered, not hand-authored.
