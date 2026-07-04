---
name: adjust
description: Walk the docket of parked escalations and fold each human decision back through the resolution toolkit. Use when parked features need decisions — /the-loop hands off here at a run boundary that carries parks, and again at re-entry when the proposal is resolve-parked.
---

# Adjust — parked docket → resolved, folded back

Each parked feature holds a decision the engine can't make
for itself; this session lays them all out, takes one decision at a time recommended-
answer style, and folds each back through the toolkit so the feature re-enters the loop
exactly where its resolution kind sends it. Every mutation is mechanical — the tools own
the feature graph, the plan, the validations record, and the Ledger; you never hand-edit
any of them.

## 1 · Clean-tree gate — on the integration target

The integration target is `main`, unless the design narrative in `docs/design/design.md`
names another ref. Check it out and run `git status`.

A dirty tree stops everything right here: tell the human the tree isn't clean and nothing
ran — never say whose change it is, and never stash, reset, or commit anything to make it
clean. Every resolution below books on this target, and HEAD stays on it from the first
command to the last.

## 2 · Present the full docket

Read every record in `docs/escalations/`. Each is one parked feature: a narrative plus a
structured block carrying `feature`, `phase` (plan | build | validate), `kind` (feature |
environment), `deviation`, a `menu` of `{ resolution, option }` entries (recommended
first), and `branch` (the `loop/<feature-id>` ref, when one exists). Order the records by
where their feature ids appear in the feature graph — `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js"
index` lists the features in graph order.

Lay the whole docket out before deciding anything. For each entry state the feature, its
phase and kind, the deviation in a line, and its menu with the recommended option first.

Arriving from a run boundary, also state — but do not act on — what the relay carried
alongside the parks:

- **`stalled`** items, each `feature` / `phase` / `note`: nothing was booked, and the phase
  re-runs on the next pass. This session does not decide them.
- **`halted`**, if present: its `reason` and `detail`. The run stopped; name it and move on.
  It is not a decision for this session.

## 3 · Walk one escalation — the recommended answer

Take the docket in order, one escalation at a time. Present its menu; the first option is
your recommendation. The human confirms it, overrides with another menu option, or goes
off-menu with a resolution the menu didn't list. Their answer names the resolution kind —
`retry`, `fix-in-place`, `re-plan`, `waive`, or `defer` — which selects the recipe in §4.

A decision may attach **pre-steps** before the resolution runs. Pre-steps add content; they
never change the kind:

- **Research** — investigate before deciding; carries no artifact of its own.
- **A config rebind** — change the project setting the decision depends on.
- **A design amendment** — route to the `design` skill for a graph change, or attach a
  steering note: `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" note <feature-id> "<text>"`.
- **Waiver recording** — `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" validate waive <feature-id> -`
  with the `{ obligation, reason, approver }` JSON on stdin; this is the pre-step the `waive`
  and mixed `fix-in-place` recipes build on.

**Removing a parked node is not a resolution.** If a design amendment deletes the feature
from the graph entirely, there is no status to flip — but the record and the Ledger would
still show a park for a node that no longer exists. That amendment's commit must also delete
`docs/escalations/<feature-id>.md` and carry the re-rendered Ledger
(`node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" ledger render`), so no park outlives its node.
Then move to the next docket entry.

## 4 · The per-kind recipes

`node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" escalation resolve <feature-id> <kind>` does the
mechanical fold-back — flip the graph status, run the kind's extras, delete the escalation
record, re-render the Ledger — reading the park's phase from the record. It writes but never
commits; you own the booking commit (§5). It prints JSON naming the feature, kind, phase, new
status, files deleted, and any retried mark. Each recipe below ends by booking, except
`defer`.

**defer** — the human wants it to stay parked. Run nothing: `escalation resolve` refuses
`defer` by design, because deferring touches neither the record nor the status. Note the
decision and move to the next entry. No commit.

**retry** — the same work, run again (a transient failure, an environment since fixed). Run
`node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" escalation resolve <feature-id> retry`. On a
**validate** park add `--reason "<why>"`: it is required there (the command refuses without
it) and stamps the latest validations entry so the next scan re-runs all four legs instead of
deduping on the unchanged patch. The status flips to where the parked phase re-enters —
`designed` for a plan park, `building` for a build or validate park. Book (§5).

**fix-in-place** — the human hands you the fix; record it as the input the re-entering phase
will consume, then resolve.

- On a **plan** park the fix steers the next plan — attach it as a note:
  `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" note <feature-id> "<the fix>"`.
- On a **build** or **validate** park the fix is a new task — feed
  `{ directive, acceptance: [<criterion>], footprint: [<path>], title? }` to
  `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" plan fix <feature-id> -` (JSON on stdin). It appends
  a `fix-N` task and, on a build park, chains any blocked task behind it.

Then `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" escalation resolve <feature-id> fix-in-place`
flips the status (`designed` for a plan park, `building` for a build or validate park) so the
phase re-enters and picks up the note or the fix task. Book (§5).

**re-plan** — the plan itself was wrong; discard it and plan again. Optionally amend the design
first as a pre-step (the `design` skill, or a steering `spine note`). Then
`node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" escalation resolve <feature-id> re-plan` flips the
status to `designed` and deletes `docs/plans/<feature-id>.md`, so Plan writes a fresh one. Book
(§5) — and only after that booking commit lands, discard the feature branch when one exists:
`git branch -D loop/<feature-id>`. A re-plan abandons the built work, so the branch goes with the
stale plan; deleting it before the booking commit would strand the resolution if anything failed
in between.

**waive** — the human accepts the feature as-is despite validator findings; it merges on human
authority. This is validate-only, and `waive` is the kind **only** when every contract-breaking
finding is waived. Record each waiver first (the pre-step in §3, one
`spine validate waive <feature-id> -` per `{ obligation, reason, approver }`); if any contract-
breaking finding is left unwaived, this is `fix-in-place` with the waivers as pre-steps, not
`waive`. The recipe lands two commits — a merge, then the booking:

1. **Heal the crash window first.** Probe the target log for this feature's merge:
   `git log <target> --grep="<feature-id>: validated at design_version .* — waived"`. A hit
   means a prior run already merged and crashed before booking — skip step 2 and go straight
   to step 3, never re-merging.
2. **Squash-merge the branch, code alone.** `git merge --squash loop/<feature-id>`, then commit:
   `<feature-id>: validated at design_version <n> — waived` (`<n>` is the `designVersion` from
   `spine index`).
3. **Pin the probe pack, conditionally.** Read the latest entry in
   `docs/validations/<feature-id>.md`; if its runtime leg PASSed, pin that entry's executed
   `exercise` into `docs/probes/<feature-id>.md` (narrative plus the steps as
   `{ action, expected observation }`). If the runtime leg did not PASS, skip the pin.
4. **Resolve.** `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" escalation resolve <feature-id> waive`
   flips the status to `validated`, deletes the record, and re-renders the Ledger.
5. Book (§5). Then, last of all, delete the branch: `git branch -D loop/<feature-id>`.

## 5 · Book the resolution

One booking commit per resolution — `defer` books nothing. It carries the resolve command's
mutations (the status flip, the deleted record, the re-rendered Ledger) plus any pre-step
artifacts (a note, a `fix-N` task, recorded waivers, a design amendment, a probe-pack pin).
Stage exactly those and commit:

    <feature-id>: escalation resolved — <kind>

`waive` is the two-commit exception: its merge commit (§4) lands first with the code alone, then
this booking commit carries the resolve mutations, the recorded waivers, and the probe-pack pin.

A `spine` command that errors is the environment telling you to stop: discard your own
uncommitted edits, book nothing further, and tell the human which command failed and what it
printed — never hand-edit an artifact to paper over it.

## 6 · Close the docket

When every escalation has been decided — resolved or deliberately deferred — the docket is done.
Propose the next stateless run: `/the-loop` re-orients on the mutated graph and advances the
frontier, each resolved feature re-entering where its kind sent it. Deferred features stay on
the docket for a future session.
