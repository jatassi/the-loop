# worktree-parallelism — remaining scope past the v2 substrate

**Status:** designed (substrate landed; this node holds the remainder).

The v2 taming (ADR-0038) landed what v1 deferred here: worktrees everywhere, task
branches cut from dependency tips, ready-set feature/task concurrency, the validator
merging the branch DAG. **What remains is the hub-file story** (2026-07-01 review):
file-disjointness fails routinely on hub files — barrel exports, route registration,
shared types — which today forces `depends_on` chains that serialize otherwise-
independent tasks. Design hub-file task chaining and a trivial-merge relaxation so
only semantic conflicts surface.

## Acceptance

- Hub-file-sharing tasks chain mechanically or merge trivially; only semantic
  conflicts surface.
