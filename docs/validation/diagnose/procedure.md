# diagnose — runbook record

Fixture-repo runbook (this repo's own binding): the CLI exercised from the outside,
as a user would, never in-process.

## Bring-up

```
node bin/create-sample-repo.js
```
Printed a temp git repo path (`/var/folders/.../loop-probe-BvVP1O`) seeded as a
populated v2 target repository: `greet-core` (validated), `greet-cli` (designed,
depends_on greet-core), committed on `main`.

## Exercise

1. **Baseline** — `node <plugin-root>/bin/the-loop.js status --json` against the
   fixture as seeded: `proposal.kind` = `advance-eligible-set`, `eligible_set` =
   `["greet-cli"]`. Confirms the fixture is a sane starting point before
   simulating a diagnose intake.

2. **Criterion 1 & 3 (fix + RCA doc + run-preparation fallback)** — hand-landed a
   diagnose-shaped commit on the fixture: added `fix-greet-race` to
   `docs/feature-graph.md` (`status: designed`, regression-shaped acceptance,
   `design_version` bumped 1→2) and `docs/bugs/fix-greet-race.md` shaped exactly per
   the SKILL.md / design-doc template (header with Date/Affects/Class/Cause
   established by/Environment/Determinism/Regressed since, then Steps to
   reproduce → Expected → Actual → Root cause(s) → Evidence → Fix design →
   Regression → Runbook, in that order — used the `inspected` waiver path with a
   `waiver:` reason to also exercise the non-repro branch of criterion 1).
   Committed both as one commit (mirroring SKILL.md step 6).
   - `node <plugin-root>/bin/the-loop.js status --json` — `eligible_set` now
     includes `fix-greet-race`; `proposal.kind` = `advance-eligible-set`.
   - `node <plugin-root>/bin/the-loop.js check` — `OK 3 features — 0 error(s), 0
     warning(s)`: the fix is an ordinary, schema-valid feature record, no
     diagnose-specific graph shape needed.
   - `node <plugin-root>/bin/the-loop.js prepare-execution-context --features
     fix-greet-race` — the printed execution context's
     `features["fix-greet-race"].designDoc` is byte-identical to
     `docs/bugs/fix-greet-race.md`'s contents, proving `gatherFeatureInputs`'s
     designs/-then-bugs/ fallback fired (no `docs/designs/fix-greet-race/design.md`
     exists in the fixture) and the fix runs the unmodified
     `prepare-execution-context` assembler like any other feature —
     `branch: "loop/fix-greet-race"` fell out for free from the ordinary
     id↔branch convention.

3. **Criterion 4 (release prunes the fix, RCA survives)** —
   `set-status fix-greet-race validated`, then hand-simulated the release skill's
   Record step (SKILL.md §4): flipped `greet-cli` to `shipped`, removed the
   `fix-greet-race` yaml entry from `docs/feature-graph.md` entirely (no status
   flip), wrote a `docs/releases/ship-1.md` listing `fix-greet-race (pruned)` among
   the shipped features, one commit.
   - `node <plugin-root>/bin/the-loop.js check` — `OK 2 features — 0 error(s), 0
     warning(s)`: the graph is still schema-valid post-prune (no dangling
     `depends_on` edge referenced the removed id; nothing else pointed at it).
   - `ls docs/bugs/` — `fix-greet-race.md` still present, untouched, after the
     prune: the RCA doc survives while the graph entry is gone, exactly as
     designed.

4. **Criterion 5 (routing)** — flipped `greet-core` to `shipped` too (everything
   now shipped) and re-ran `status --json`: `proposal.kind` = `new-intake`,
   `summary: "everything is shipped — bring the next intake"`. This is the
   precondition `commands/the-loop.md`'s route table keys off (`new-intake` → ask
   what kind of intake this is → bug-shaped answer routes to the `diagnose`
   skill), confirmed unchanged and pre-existing in `src/propose-next-action.js`
   (this feature adds no orientation-side code, only the route-table prose and the
   skill it points to) — read directly in `commands/the-loop.md` lines 26-29 and
   `skills/diagnose/SKILL.md` in full.

Criterion 2 (environment-shaped blocker surfaced, never silently degraded) and the
"runbook rides the affected feature's runbook, never orphaned" clause of criterion 4
are prose/judgment properties of the skill text and the generic Validate agent
reading a fix's RCA-doc-as-designDoc; not independently runtime-probable without a
live agent conversation (the validation-runbook binding's own sanction: sparing
`claude -p` calls are "the first thing shed under time pressure"). Verified instead
by reading `skills/diagnose/SKILL.md` step 3 (explicit stop-and-surface-with-cost
language, waiver framed as the human's grant) and the RCA template's `## Runbook`
fold-in instruction, which a Validate agent receives as its designDoc content per
the existing `gatherFeatureInputs` fallback.

## Expected observations

All five bulleted outcomes above matched what ran; no fail.

## Teardown

```
rm -rf /var/folders/c8/87s4yg6j7q90fkn7_6tnftkc0000gn/T/loop-probe-BvVP1O
```
Confirmed gone (directory listing no longer shows `loop-probe-*`).
