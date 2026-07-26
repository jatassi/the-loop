# Bound artifact stores — when the feature graph lives on an external surface

Reference for surfaces that read or write the feature graph. It applies only when
`artifactStores.features` (it rides the `hooks-list` inventory) resolves to a
**nondefault** binding. When it resolves `local` — the default — every surface runs
unchanged against `docs/feature-graph.json` and passes no `--graph-path`.

Under a nondefault binding the feature graph is no longer an in-repo file: its
records, dependency edges, acceptance prose, and statuses are sole truth on the bound
surface, and the run works from an ephemeral snapshot instead of the local file.

1. **Materialize the snapshot.** Follow `docs/adapters/features.md` — its Access
   section names the surface's shape (MCP server, CLI, …), the auth/workspace
   context, and the read calls — read the bound surface, and materialize the same
   JSON graph model as an ephemeral snapshot file under session scratch. The snapshot
   is gitignored, never committed, and torn down at run end (leave nothing behind,
   the way the loop sweeps its own temp files). Materialize it before any graph read.
2. **Point the subcommands at the snapshot.** Pass its path as `--graph-path` to
   every graph-consuming subcommand — `status`, `prepare-execution-context`,
   `set-status`, `check` — so the pure core runs against the snapshot while the
   default `docs/feature-graph.json` path stays untouched for local projects.
3. **Invert status writes — surface-first.** Where an unbound run would `set-status`
   on the file, a bound run updates the bound surface first (the mutate operation the
   adapter doc's Operations names), then refreshes the snapshot from it. Truth lands
   on the surface ahead of the cache, so a crash leaves truth ahead of the snapshot,
   never behind it.
4. **Tear the snapshot down** once the leg finishes. A route that hands off to
   another surface hands the snapshot path along with the scope, and teardown belongs
   to whichever leg ends last.

**A bound-but-unreachable surface at use time is a can't-run, never a fallback.** If
the surface can't be reached when the snapshot must be materialized or a mutate
written, stop and report a can't-run naming the surface (e.g. `features is bound to
Linear and Linear is unreachable`). Never fall back to local
`docs/feature-graph.json` — a stale or absent local file would fork project truth.
This is a surfaced can't-run, distinct from a run that started and failed.

**Unbinding is a migration, not a settings toggle.** To return a bound project to
local, follow the adapter doc's caveats: export the surface's truth back to
`docs/feature-graph.json` — one final materialized snapshot, this time committed —
then remove the `artifactStores.features` pointer and the adapter doc. Once
`artifactStores.features` resolves `local` again, subsequent runs read the in-repo
graph and print a visible fallback line noting the feature graph is served from local
`docs/feature-graph.json`.
