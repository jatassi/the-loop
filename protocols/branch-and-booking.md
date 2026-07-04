# Branch and booking protocol

Shared mechanics for any agent that lands one task's code on a feature branch
and then books the outcome on the integration target itself. Read this
whole file — the calling agent's own contract covers everything task-specific;
this doc covers only what's identical across agents: the branch mechanics and
the booking mechanics.

## Branch protocol

All work on the code lands on the feature's branch; you leave exactly one
commit there, or none — the booking commit (the Booking protocol below) is
separate and always lands on the integration target.

1. `git status` must be clean. A dirty tree is environment-shaped: book
   nothing (the Booking protocol below), return blocked naming what you saw
   — never stash, reset, or clean state you did not create.
2. The integration target is `main` unless the design narrative names another
   ref.
3. Check out `loop/<feature-id>`, creating it from the target tip if it
   doesn't exist.
4. Rebase the branch onto the target (a no-op unless the target moved while
   the branch sat). A conflict is feature-shaped: abort the rebase, book the
   park (the Booking protocol's feature-shaped path, below) naming the
   conflicting paths.
5. **Crash healing.** Search `loop/<feature-id>`'s commits since it diverged
   from the target for one matching this task's own pattern,
   `<feature-id>/<task-id>: `. A match means a prior run already committed
   this task's code and then crashed before booking it — the plan still shows
   the task `pending`, which is why you got this far. Don't redo the work:
   derive the report from that commit (step 6 below) instead of building
   fresh, and note in `deviations` that it's a reconstruction — the original
   run's deviation prose is lost, but `footprint_actual` and `diff_actual` are
   not, since git recomputes both exactly from the commit. Read the commit's
   own diff to write a faithful `summary` regardless. No match → build fresh
   (step 3 above), then commit everything as one commit:
   `<feature-id>/<task-id>: <title>`.
6. Derive the report from that commit, fresh or healed: `footprint_actual` =
   its changed files, `diff_actual` = its files/insertions/deletions counts.
7. Any blocked return leaves the feature branch exactly as you found it:
   discard your own uncommitted work — never anyone else's, and never the
   crash-healed commit above — so its tip stays the last completed task.

## Booking protocol

After the branch commit — fresh or crash-healed — the Built and
feature-shaped paths below both write on the target: switch to it (`git
checkout <target>`, a no-op if an environment-shaped block below never left
it). One commit; leave HEAD on the target when you're done, in every case.

A `spine` booking command that errors is environment-shaped: discard your own
uncommitted booking edits, book nothing further, and return blocked naming
the failing command and its output. Never hand-edit the artifacts the toolkit
owns (the plan, the feature graph, the Ledger); a hand edit where the tool
failed hides the failure it should surface.

**Built.**

1. Fold the completion report — feed the JSON on stdin via `-`
   (`node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" plan report <feature-id>
   <task-id> -`), never via a file written into the repo: an untracked
   leftover dirties the tree for every agent after you. The fold writes it
   into `docs/plans/<feature-id>.md` and flips the task's own status to
   `built`.
2. Check the feature's status: `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js"
   resolve <feature-id>`. Still `planned` means this is the feature's first
   task — flip it: `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" set-status
   <feature-id> building`, then `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js"
   ledger render`. Any other status (already `building`) gets neither call.
3. Commit whatever the two steps above wrote — `docs/plans/<feature-id>.md`
   always; `docs/design/design.md` and `docs/ledger/ledger.md` too when step 2
   flipped — as one commit: `<feature-id>: book task <task-id>`.

**Blocked, feature-shaped** (a contradictory task contract, or the rebase
conflict from the Branch protocol above) — park the feature; the task itself
stays `pending` in the plan, ready to retry once a human resolves the park:

1. Author the menu — 2–3 concrete ways to unblock (resolve the conflict by
   hand, revisit the contract, re-plan the task) — addressed to a human, not
   a builder. Each option is kind-stamped `{resolution, option}`, the
   recommended option first — `resolution` is one of `retry | fix-in-place |
   re-plan | defer` (`waive` belongs to validate parks only and is never
   offered here).
2. Write `docs/escalations/<feature-id>.md`: narrative prose naming the
   defect, then one fenced `yaml` block under the exact heading
   `## Escalation`:

       ## Escalation
       ```yaml
       feature: <feature-id>
       phase: build
       kind: feature
       deviation: <the defect, one paragraph>
       menu: [{resolution: retry|fix-in-place|re-plan|defer, option: <text>}, …]  # recommended first
       branch: loop/<feature-id>
       ```

   `phase` reads `build` regardless of which agent parks — the parking phase
   is Build's, whether Build itself parks or a task Build delegated out
   parks.
3. `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" set-status <feature-id> parked`
4. `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" ledger render`
5. Commit the escalation record with the status flip and the re-rendered
   Ledger as one commit: `<feature-id>: book parked at build`.

**Blocked, environment-shaped** (a dirty tree, mis-sequencing, or any other
environment block hit while resolving or running the task) — books nothing:
the target, the branch, and `docs/plans/<feature-id>.md` all stay exactly as
found.
