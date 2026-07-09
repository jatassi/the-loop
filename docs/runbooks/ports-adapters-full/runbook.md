# ports-adapters-full — validation runbook (judge record)

## Feature

`ports-adapters-full` — documented external-surface bindings, consumed (features→Linear proof).

## Bring-up

From the integration worktree root (`integrate--ports-adapters-full`):

```bash
PLUGIN_ROOT="$(pwd)/plugin"
FIXTURE=$(node bin/create-sample-repo.js)
# optional bare variant:
EMPTY=$(node bin/create-sample-repo.js empty)
```

Observed:

- `FIXTURE` → temp git repo under `/var/folders/.../T/loop-probe-*` with committed `docs/feature-graph.md` + architecture/design seeds.
- `EMPTY` → unconfigured bare probe repo (no design/graph).
- Worktree itself left clean (`git status` empty; no commits/adds/edits by the judge).

## Exercise

All CLI steps used `node "$PLUGIN_ROOT/bin/the-loop.js" …` with `cwd` = fixture (outside-process, no in-process imports).

### Default (all-local) configured fixture

1. `status --json` → `mode: "configured"`, position counts `proposed:1 / designed:1 / validated:1`, eligible `greet-cli`, proposal `advance-eligible-set`.
2. Human `status` table projects from `docs/feature-graph.md` (`greet-core` validated, `greet-cli` designed, `greet-farewell` proposed).
3. `hooks-list` → every `artifactStores.*` is `"local"` with `provenance: "default"`.
4. `docs/adapters/` absent on the fixture (pay-per-swap: default projects carry zero adapter docs).

### Graph-path isolation (snapshot seam for bound projects)

1. Copied fixture graph to `/tmp/pa-snap/feature-graph.md`.
2. `set-status greet-core designed /tmp/pa-snap/feature-graph.md`:
   - stdout JSON showed `status: "designed"` for `greet-core`.
   - md5 of fixture `docs/feature-graph.md` unchanged; snapshot md5 changed (sole write target).
3. Poisoned default graph: `set-status greet-cli proposed` on the fixture default path.
4. `prepare-execution-context --features greet-cli --target-branch main` (no graph-path) → refused with `error not-designed: … (greet-cli)` / `scope gate failed`.
5. Same command with `--graph-path /tmp/pa-snap/feature-graph.md` (snapshot still has `greet-cli` designed) → exit success, JSON context with `scope: ["greet-cli"]` and expected context keys (`target`, `scope`, `probe`, `models`, `hooks`, `features`, …).

Independently re-exercised by the driving agent (not just the judge): a fresh
fixture was brought up, `set-status greet-core designed <snapshot-path>` was run
against a copied snapshot, and the fixture's own `docs/feature-graph.md` was
confirmed byte-unchanged (md5 diff) while the snapshot alone carried the write.
Fixture and snapshot were torn down after.

### Empty / unconfigured fixture

1. `status --json` → `mode: "unconfigured"`, proposal `onboard`.
2. `hooks-list` → all `artifactStores` still `local` / `default` (no silent external binding).

### Suite / lint / integrity (on the integration worktree)

```bash
npm test   # 240 pass, 0 fail
npm run lint  # clean
```

Diff integrity (`git diff main..HEAD`):

- No `eslint-disable`, no lint-config edits, no deleted tests.
- New tests only: capture-gate + consumption-lifecycle prose contracts; `cli.test.js` graph-path sole-target cases.
- Manual check: configure-skill / consumption-lifecycle regexes HIT against shipped `configure`/`begin`/`validate` prose and TEMPLATE headings (`What lives here`, `Access`, `Operations` with **read**/**mutate**, `Caveats` + unbind path); backup index precedes retire index in §4.

### Criterion mapping (what this runbook could and could not observe)

| Criterion | Observable here | Result |
|---|---|---|
| 1 capture gate trade-offs + probe | SKILL.md §4 + configure-skill tests biting prose | met |
| 2 pre-swap backup before retire | SKILL.md §4 step 4 + test order assert | met |
| 3 adapter doc shape | TEMPLATE.md four sections + capture-gate write directive | met |
| 4 live Linear sandbox round-trip | requires real Linear MCP + scratch team | **blocked** (environment / can't-run) |
| 5 unbind → local + visible fallback | begin unbind migration prose + tests; default fixture stays local | met (prose/contract) |
| 6 bound-but-unreachable can't-run | begin can't-run / never-fallback prose + tests | met (prose/contract) |

Note: interactive capture-gate interview and live Linear proof are agent-session behaviors; this judge exercises documentation-as-adapter contracts, pure-core graph-path plumbing, and the default-local CLI surface only.

## Expected observations (summary)

- Default project: all artifact stores local, zero `docs/adapters/`, status/hooks work against in-repo graph.
- Optional graph-path is the sole read/write target for set-status and the sole graph source for prepare-execution-context; default path is never invented or mutated when an alternate path is supplied.
- Capture/unbind/can't-run semantics live in skill/agent prose and are locked by tests that fail if the required phrases are removed.
- Live Linear features→Linear proof is intentionally out of band for this judge environment; it requires a human/session with Linear MCP access and a scratch sandbox team, never this repo's own graph.

## Teardown

```bash
rm -rf "$FIXTURE" "$EMPTY" /tmp/pa-snap
```

Confirmed after teardown: temp fixture paths gone; integration worktree `git status` clean (no residual mutations).
