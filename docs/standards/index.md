# Project standards — index

One line per standard, for task-time matching (the Plan agent reads this file
and assigns each task only what its footprint makes relevant).

- [derived-and-hybrid-artifacts.md](derived-and-hybrid-artifacts.md) — derived projections re-render with their source in the same commit; machine edits to hybrid docs go through parse → mutate the retained document → render, byte-identical outside the block
- [pure-core-thin-cli.md](pure-core-thin-cli.md) — `src/` is pure over in-memory models; filesystem, `process.exit`, and existence probes live at the `bin/` edge
- [loop-surfaces.md](loop-surfaces.md) — `commands/`, `skills/`, `agents/` files are self-contained surfaces: no ADR or internal-doc references, no session context assumed
