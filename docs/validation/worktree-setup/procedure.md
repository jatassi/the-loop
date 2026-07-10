# Validation procedure: worktree-setup

**Feature:** worktree-setup
**Surface:** `worktree-create` provisioning path (`plugin/bin/cli-commands.js`), `worktreeSetup` hook family (`plugin/src/resolve-model-bindings.js`, `plugin/bin/hooks-commands.js`), configure/onboard detection, agent-surface timeout lines
**Date of this pass:** 2026-07-10
**Mode:** release ready-check pass against the landed tree (the run's validator was stopped mid-run on the human's instruction after the criterion-8 amendment; criteria 1–7 were judged met by that validator under direct exercise before the stop). This procedure re-exercises the CLI surface end-to-end from the outside.

## Bring-up

Fixture-repo binding: `node bin/create-sample-repo.js` → temp git repo; all commands
run `node <plugin-root>/bin/the-loop.js …` with cwd = the fixture.

Suite context at the same tip: `npm test` 299/299, `npm run check` (graph check +
eslint) clean. The oracle corpus carries a worktree-create bound-success case and a
bound-failure/refusal case exercised by the suite.

## Exercise (all observed this pass)

1. **Unbound resolution.** `hooks-list --compact` shows
   `worktreeSetup: {"provisioning":"none","provenance":"fallback"}`.
2. **Unbound create.** `worktree-create wt-unbound` → `{ path, branch, created: true }`,
   no provisioning, **no `node_modules` symlink anywhere** (linkNodeModules deleted).
3. **Bound success.** `hooks-set worktreeSetup project '{"command":"touch provisioned.marker"}'`,
   then `worktree-create wt-bound` → marker exists in the new worktree root; JSON
   output shape unchanged.
4. **created:false never re-runs setup.** Marker removed, `worktree-create wt-bound`
   again → `created: false`, marker not recreated.
5. **Bound failure.** Binding `echo boom-stderr >&2; exit 7` → exit 1 with
   `worktree provisioning failed: command "…" in .claude/worktrees/wt-fail (layer project) exit code 7`
   plus the stderr tail (`boom-stderr`); the worktree directory is removed; the
   branch survives.
6. **Clean retry.** Binding fixed → `worktree-create wt-fail` recreates the worktree
   on the surviving branch, `created: true`, provisioned fresh.

### Not exercised in this pass

- Timeout kill path (default 600000 ms / per-binding override) — pinned by the suite;
  not live-exercised (would need a deliberately hanging command and a long wait).
- Malformed-binding worktree-create refusal — judged met by the run validator
  (criteria 1–7) and covered by the oracle corpus refusal case in the suite.
- This repo's own `npm ci` self-binding under a real pipeline run — first exercised
  by the next concurrent-worktree run after this release.

## Expected observations

| Check | Expected | Observed |
| --- | --- | --- |
| Unbound resolution | fallback `provisioning: none` | met |
| Unbound create | no provisioning, no symlink, shape unchanged | met |
| Bound success | command runs in worktree root, `created: true` | met |
| `created: false` | no re-provision | met |
| Bound failure | teardown + self-contained message (phrase, command, path, layer, exit code, stderr tail), exit 1 | met |
| Branch after failure | survives | met |
| Retry after fix | provisions fresh | met |

## Teardown

`rm -rf` the fixture path printed at bring-up (done this pass; nothing left behind).
