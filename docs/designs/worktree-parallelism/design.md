# worktree-parallelism — trivial-merge relaxation (test-gated merge policy)

**Status:** designed (ADR-0042, 2026-07-05). The v2 substrate (ADR-0038) already
landed worktrees everywhere, task branches cut from dependency tips, and
concurrency-policy feature/task concurrency. This record holds the remainder: the
hub-file story.

## The problem

Plan-check errors on unordered footprint overlap, so tasks sharing any file must be
chained via `depends_on`. Hub files — barrel exports, route registration, shared
types — are touched by most tasks for a line or two each, so the chains serialize
otherwise-independent work, defeating the parallel substrate.

## The design (declaration-free)

Three changes, no new schema:

1. **Delete the `unordered-overlap` error** from plan linting (`src/plan.js` — the
   `overlaps()` generator, the ordering-path check, and their tests). Disjointness
   becomes the plan agent's *bias*: chain tasks whose shared-file edits genuinely
   interact; leave registration-shaped sharing unordered so it runs in parallel.
   The footprint lease itself is unchanged — every expected file still listed.
2. **No declaration layer.** No `hubs:` field anywhere. Footprints already carry the
   contention data; the merge point classifies conflicts with better evidence than
   any lint-time pre-declaration — and cross-feature contention (publish-rebase onto
   a moved target) could never be pre-declared by a per-feature plan anyway.
3. **One universal merge posture — the test-gated merge policy — at all three merge points:**
   - the build agent's sibling-branch merge (a task with multiple `depends_on`),
   - the validator's integration merge of the branch DAG,
   - the validator's publish-rebase when the target moved mid-validation.

   The merging agent may resolve a textual conflict only when it can state both
   sides' intents and write a resolution serving both — then must prove it: both
   branches' tests ride the merged tree, and the resolution counts only if the suite
   goes green. Can't compose it, or tests stay red → semantic conflict → `blocked`
   (kind `feature`) naming the conflicting paths. Conflict resolution is part of the
   merge, not a footprint excursion. The validator resolving its own conflicts is a
   bounded authoring exception to assembly-not-authoring: small, test-proven, still
   under its judgment legs (ADR-0042).

## Surfaces this touches

- `src/plan.js` — delete the unordered-overlap rule and its machinery; the doc
  comment stops claiming overlapping footprints must be chained. Suite updated to
  assert unordered overlap now lints clean.
- `agents/plan.md` — decomposition guidance shifts from "tasks sharing a file must
  be chained" to disjointness-as-bias with chain-when-interacting judgment.
- `agents/build.md` — the sibling-merge paragraph drops "a clean merge is expected;
  a real conflict means the plan is wrong" for the test-gated merge policy.
- `agents/validate.md` — "a merge conflict is a real finding — abort" becomes
  the test-gated merge policy, applied at both the integration merge and the
  publish-rebase retry.
- `workflows/execution-pipeline.js` — the build prompt's "merge these sibling branches first
  (clean by construction)" line and the scheduler comment stop promising
  conflict-free merges.

## Interfaces (unchanged, quoted for the builder)

- Task contract: `{ id, title, covers, acceptance, footprint, size, judgment_level,
  depends_on, wiring? }` — no new fields.
- Blocked return: `{ result: "blocked", kind: "feature|environment", detail,
  options, summary }` — a non-composable conflict uses `kind: "feature"` with the
  conflicting paths in `detail`.
- Branch topology: task branch `loop/<feature>--<task>` cut from `deps[0]`'s tip;
  remaining dep branches merged by the task's build agent; validator merges
  `[feature-branch, ...tasks in topo order]` in the integration worktree and
  publishes fast-forward.

## Constraints

- The footprint lease and its excursion-as-deviation rule are untouched.
- Conflicts on *any* file get the same posture — there is no hub/non-hub
  distinction at merge time.
- The trade accepted (ADR-0042): a genuinely colliding plan is caught at the merge
  point after build tokens are spent, not at lint time — blocked with precise
  evidence instead of refused on a guess.

## Acceptance

- A plan whose unordered tasks share a footprint file passes `the-loop plan check`
  clean.
- No loop surface still promises conflict-free merges — build and validate carry
  the test-gated merge policy (resolve only with a resolution serving both sides'
  stated intents, proven by the merged suite including both branches' tests going
  green; otherwise blocked naming the conflicting paths).
- In a two-branch fixture scenario editing the same file, a composable conflict
  lands both edits with the suite green, and a non-composable conflict returns
  blocked naming the paths.
