# fix-landing-into-checked-out-target — the prescribed publish recipes cannot work, and record's improvised fallback leaves the primary worktree staged to revert its own commit

**Date:** 2026-07-25 · **Affects:** calibration-capture (record leg — destructive outcome), validate (same recipe defect, benign outcome), worktree-parallelism · **Class:** ref-update hazard / unusable prescribed recipe + unbounded improvisation · **Cause established by:** reproduced
**Environment:** the-loop v0.5.1 (checkout `b9518f9`), consuming project `~/Git/spool`, git 2.x worktrees under `.claude/worktrees/`, run `wf_0e103da9-8f8` · **Determinism:** always — the target branch is *always* checked out in the primary worktree, so both prescribed recipes always fail; only the improvised fallback varies · **Regressed since:** never worked as prescribed — prior occurrence 2026-07-23 (`598ec68`, same empty-message ref update, self-healed by a manual `git reset` 11 s later)

## Steps to reproduce

Minimal, 8 lines, no the-loop involved — this is plain git:

```sh
git init primary && cd primary
echo base > f.txt && git add -A && git commit -m base
git worktree add ../wt -b rec
cd ../wt && echo artifact > run.json && git add -A && git commit -m "calibration: run"
git fetch . rec:main          # validate.md:60's recipe
git checkout main             # record's first attempt
git update-ref refs/heads/main $(git rev-parse HEAD)   # record's fallback — silent success
cd ../primary && git status --short
```

In the real run: the record leg created `.claude/worktrees/record-temp`, wrote
`docs/calibration/runs/2026-07-25-1.json`, ran `calibration-summarize`, committed
`3c510d3`, published it with `git update-ref`, then removed the worktree.

## Expected result

Per `plugin/agents/record.md:71-78` ("Publish"), the calibration commit
fast-forwards onto the run's target branch and the repository is left in a
coherent state — the artifact present on disk, the working tree clean. Failing
that, the leg reports `blocked` (`record.md:92-95`) rather than publishing by
another means.

## Actual result

The ref moves; nothing else does. In the primary worktree:

```
D  docs/calibration/runs/2026-07-25-1.json
M  docs/calibration/index.md
```

The run artifact is **absent from disk** — it only ever existed in the removed
worktree — and `docs/calibration/index.md` in the index still holds the pre-record
digest (6 runs) while `HEAD` holds the post-record one (7 runs). The staged state
is the exact inverse of the commit just published. The leg returned
`{"result":"recorded"}`; nothing reported a problem.

The consequence is silent and delayed — the *next* ordinary commit reverts the
calibration artifact:

```
 f.txt    | 1 +
 run.json | 1 -
--- run.json in HEAD now?
GONE — calibration commit silently reverted
```

## Root cause(s)

The trigger is the record leg publishing from inside a linked worktree. Three
causes sit behind it.

**1 · Both prescribed publish recipes are unusable, because the target branch is
always checked out in the primary worktree.** Git refuses to move a branch that
another worktree has checked out, by either prescribed route:

- `validate.md:60` — `git fetch . <integration-branch>:<target>` →
  `fatal: refusing to fetch into branch 'refs/heads/main' checked out at '/Users/jatassi/Git/spool'`
- record's `git checkout main` →
  `fatal: 'main' is already used by worktree at '/Users/jatassi/Git/spool'`

This is not an edge case: the primary worktree has the target checked out in every
normal run, so the prescribed recipe fails *every time*. Both legs necessarily
improvise, and the loop's correctness rests on which fallback each one invents.

**2 · `record.md:71-78` specifies the publish as prose with no command, and its
guard rail is under-specified on both axes.** §6 says only *"Fast-forward the
commit onto the run's target branch"* — no invocation, unlike `validate.md:60`
which at least names one. Its failure clause is scoped to the wrong failure
(*"If it fails because the **target moved**, that is a defect: report it blocked"*)
— the observed failure was "target is checked out," so the blocked rule did not
visibly apply. And its forbidden-retry list (*"do not silently retry into a merge
or rebase"*) enumerates the two *safe* recoveries while not naming `update-ref`,
the one genuinely destructive option. The agent obeyed the letter of the rule and
did the worst available thing.

**3 · `git update-ref` moves the branch pointer without touching the primary
worktree's index or working tree.** HEAD advances underneath a stale index, so
git reports the delta as a staged deletion plus a staged revert. Nothing in the
repo state records that this was unintentional, and the artifact file is gone from
disk because the only checkout that ever held it was the worktree, since removed.

**The same wall, two outcomes.** Validate hit failure 1 and recovered *safely* —
it fell back to `git merge --ff-only integrate--fix-detect-real-sessions` run from
the **primary worktree** (no `cd`), which updates ref, index, and working tree
atomically; `git reflog` shows a proper `merge …: Fast-forward` HEAD entry and the
tree was left clean. Record hit the same wall and recovered *destructively*. One
prescription, two improvisations, and only luck distinguishes them — that is the
defect worth fixing, not the single bad command.

## Evidence

1. **Reproduced from the record leg's own command trail**
   (`wf_0e103da9-8f8/agent-aec375ff346af4565.jsonl`, commands 44-48), verbatim:
   - `[44] cd …/worktrees/record-temp && git add docs/calibration/runs/2026-07-25-1.json docs/calibration/index.md && git commit -m "calibration: run 2026-07-25-1"`
   - `[45] cd …/worktrees/record-temp && git checkout main && git reset --ff-only record-temp`
     → `Exit code 128 · fatal: 'main' is already used by worktree at '/Users/jatassi/Git/spool'`
     (note `git reset` has no `--ff-only` flag either — the command was doubly malformed)
   - `[46] cd …/worktrees/record-temp && git update-ref refs/heads/main 3c510d3` →
     *(Bash completed with no output)*
   - `[48] the-loop worktree-remove .claude/worktrees/record-temp` → `{"removed": …}`

2. **Minimal repro, plain git** (above) reproduces all three symptoms exactly:
   `D run.json` staged, file missing from disk, HEAD advanced.

3. **The silent-revert consequence, demonstrated.** After the repro, an ordinary
   `git add -A && git commit` produced a commit containing `run.json | 1 -` and
   `git cat-file -e HEAD:run.json` then failed — the calibration commit was
   reverted with no warning at any point.

4. **The proposed fix, verified.** In a fresh repro, `git merge --ff-only rec` run
   from the primary worktree left `git status --short` empty, `run.json` present on
   disk, and reflog entry `merge rec: Fast-forward`.

5. **The ref-update signature is visible in the reflog.**
   `git reflog show main` → `3c510d3 main@{2026-07-25 11:49:19}:` with an **empty
   message** (the `update-ref` signature), versus
   `42f2603 main@{11:43:59}: merge integrate--fix-detect-real-sessions: Fast-forward`
   for validate's safe landing. Correspondingly `git reflog` (HEAD) has **no entry
   at all** for `3c510d3` — the primary worktree never saw it.

6. **Validate hit the identical wall and recovered safely**
   (`agent-abeae93e3361d0fd3.jsonl`): `git fetch . integrate--fix-detect-real-sessions:main`
   → `fatal: refusing to fetch into branch 'refs/heads/main' checked out at
   '/Users/jatassi/Git/spool'`, followed by `git merge --ff-only
   integrate--fix-detect-real-sessions` from the primary worktree → `42f2603`.

7. **Prior occurrence, papered over.** `main@{2026-07-23 11:35:52}` → `598ec68`
   with the same empty message, followed by `HEAD@{2026-07-23 11:36:03}: reset:
   moving to HEAD` — a manual resync 11 s later. The defect recurred; the earlier
   instance was absorbed by hand and never recorded.

8. **Adjacent CLI friction, same trail.** Commands 0-4 show the leg failing three
   times to discover `worktree-create`'s signature
   (`the-loop worktree-create --target main` → `error: unexpected argument '--target' found`).
   Not the defect, but it lengthens the improvisation window that produced it.

## Fix design

**1 · Give both legs one prescribed, worktree-safe publish command (must).** The
target branch is checked out in the primary worktree, so the landing must run
*there*, not in the linked worktree:

```sh
git -C <repo-root> merge --ff-only <source-branch>
```

This updates ref, index, and working tree atomically, refuses anything that isn't
a fast-forward (preserving the "if it fails, that is a defect" contract), and
leaves an honest reflog entry. Replace the prose at `record.md:71-78` with it, and
correct `validate.md:60` — the `git fetch . <src>:<target>` form there cannot work
against a checked-out target and only escaped notice because that leg improvised
its way out.

**2 · Name the prohibition precisely (must).** Record's forbidden-retry list must
name `git update-ref`, `git branch -f`, `git push --force`, and any other
ref-only move, and its blocked clause must widen from "if the target moved" to
*any* publish failure. Suggested: *"If the fast-forward fails for any reason —
target moved, target checked out, non-fast-forward — report blocked. Never move
the target ref by any other means: `update-ref`, `branch -f`, and `push --force`
move the pointer without updating the primary worktree, silently staging a revert
of the commit you just made."*

**3 · Verify the landing before returning `recorded` (should).** The leg currently
returns success on an unverified publish. After the merge, assert
`git -C <repo-root> status --porcelain` is empty and the artifact path exists on
disk; if not, return `blocked` with the porcelain output. This is what turns cause
3 from silent into caught, independently of whether 1 and 2 drift again.

**4 · Consider hoisting the publish out of the agents entirely (may).** Both legs
need the same operation and both got it wrong; `<cli> worktree-land <branch>`
would make it one tested implementation instead of two prose descriptions
subject to improvisation. Larger change — flagged, not prescribed.

*Rejected:* `git fetch --update-head-ok . <src>:<target>` does move a checked-out
branch, but explicitly does *not* update the index or working tree — it produces
exactly the corrupt state this bug is about. It is the trap that looks like the
fix.

## Regression

- Given a repository whose target branch is checked out in the primary worktree
  and a linked worktree holding a commit to publish, when the record leg
  publishes, then the target advances **and** the primary worktree's
  `git status --porcelain` is empty **and** the artifact exists on disk.
- Given a publish that cannot fast-forward for any reason, when the record leg
  runs, then it returns `{"result":"blocked", …}` naming the failure and does not
  move the target ref by any other means.
- Given the record leg's published run, when `git reflog` is inspected in the
  primary worktree, then a HEAD entry exists for the calibration commit (i.e. the
  landing was a real merge, not a bare ref move).
- `record.md`'s publish section and `validate.md:60` name the same worktree-safe
  command, and neither prescribes `git fetch . <src>:<target>` against a
  checked-out target.

**Why no test caught it.** The publish step is prose in an agent contract, not
code, so nothing executes it in CI — `test/` has no coverage of either leg's
landing. The failure is also invisible from inside the acting agent: `update-ref`
exits 0 silently, the worktree it can see is correct, and the corruption exists
only in a *different* working tree that the leg never inspects before returning
`recorded`. Calibration's own validation procedure checks that the run artifact is
committed — which it was — not that the repository is left coherent. And the one
prior occurrence was absorbed by a manual `git reset` 11 s later, so it produced
no durable signal.

## Validation procedure

Folds into **calibration-capture**'s validation procedure as an added exercise
step: after a run's Record phase completes, confirm in the consuming project that
`git status --porcelain` is empty, that `docs/calibration/runs/<date>-<seq>.json`
exists on disk, and that `git reflog` shows a HEAD entry for the calibration
commit. **validate**'s procedure gains the same worktree-safe-landing check for
its squash commit. No standalone validation procedure for the fix.
