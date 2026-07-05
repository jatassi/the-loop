# diagnose — probe record

Fixture-repo probe (this repo's own binding): the CLI exercised from the outside,
as a user would, never in-process.

## Bring-up

```
node bin/probe-fixture.js
```
Printed a temp git repo path (`/var/folders/.../loop-probe-BvVP1O`) seeded as a
populated v2 target repo: `greet-core` (validated), `greet-cli` (designed,
depends_on greet-core), committed on `main`.

## Exercise

1. **Baseline** — `node <plugin-root>/bin/the-loop.js orient` against the fixture
   as seeded: `proposal.kind` = `advance-frontier`, `frontier` = `["greet-cli"]`.
   Confirms the fixture is a sane starting point before simulating a diagnose
   intake.

2. **Criterion 1 & 3 (fix node + RCA doc + launch fallback)** — hand-landed a
   diagnose-shaped commit on the fixture: added `fix-greet-race` to
   `docs/design/graph.md` (`status: designed`, regression-shaped acceptance,
   `design_version` bumped 1→2) and `docs/rca/fix-greet-race.md` shaped exactly per
   the SKILL.md / design-doc template (header with Date/Affects/Class/Cause
   established by/Environment/Determinism/Regressed since, then Steps to
   reproduce → Expected → Actual → Root cause(s) → Evidence → Fix design →
   Regression → Probe, in that order — used the `inspected` waiver path with a
   `waiver:` reason to also exercise the non-repro branch of criterion 1).
   Committed both as one commit (mirroring SKILL.md step 6).
   - `node <plugin-root>/bin/the-loop.js orient` — `frontier` now includes
     `fix-greet-race`; `proposal.kind` = `advance-frontier`.
   - `node <plugin-root>/bin/the-loop.js check` — `OK 3 features — 0 error(s), 0
     warning(s)`: the fix node is an ordinary, schema-valid feature node, no
     diagnose-specific graph shape needed.
   - `node <plugin-root>/bin/the-loop.js launch --scope fix-greet-race` — the
     printed snapshot's `features["fix-greet-race"].designDoc` is byte-identical to
     `docs/rca/fix-greet-race.md`'s contents, proving `gatherFeatureInputs`'s
     features/-then-rca/ fallback fired (no `docs/design/features/fix-greet-race.md`
     exists in the fixture) and the fix runs the unmodified `launch` assembler like
     any other feature — `branch: "loop/fix-greet-race"` fell out for free from the
     ordinary id↔branch convention.

3. **Criterion 4 (ship prunes the fix node, RCA survives)** —
   `set-status fix-greet-race validated`, then hand-simulated the ship skill's
   Record step (SKILL.md §4): flipped `greet-cli` to `shipped`, removed the
   `fix-greet-race` yaml entry from `docs/design/graph.md` entirely (no status
   flip), wrote a `docs/ships/ship-1.md` listing `fix-greet-race (pruned)` among the
   shipped features, one commit.
   - `node <plugin-root>/bin/the-loop.js check` — `OK 2 features — 0 error(s), 0
     warning(s)`: the graph is still schema-valid post-prune (no dangling
     `depends_on` edge referenced the removed id; nothing else pointed at it).
   - `ls docs/rca/` — `fix-greet-race.md` still present, untouched, after the prune:
     the RCA doc survives while the graph entry is gone, exactly as designed.

4. **Criterion 5 (routing)** — flipped `greet-core` to `shipped` too (everything
   now shipped) and re-ran `orient`: `proposal.kind` = `new-intake`,
   `summary: "everything is shipped — bring the next intake"`. This is the
   precondition `commands/the-loop.md`'s route table keys off (`new-intake` → ask
   what kind of intake this is → bug-shaped answer routes to the `diagnose`
   skill), confirmed unchanged and pre-existing in `src/entry.js` (this feature
   adds no orient-side code, only the route-table prose and the skill it points
   to) — read directly in `commands/the-loop.md` lines 26-29 and
   `skills/diagnose/SKILL.md` in full.

Criterion 2 (environment-shaped blocker surfaced, never silently degraded) and the
"probe rides the affected feature's pack, never orphaned" clause of criterion 4 are
prose/judgment properties of the skill text and the generic Validate agent reading
a fix's RCA-doc-as-designDoc; not independently runtime-probable without a live
agent conversation (the probe binding's own sanction: sparing `claude -p` calls are
"the first thing shed under time pressure"). Verified instead by reading
`skills/diagnose/SKILL.md` step 3 (explicit stop-and-surface-with-cost language,
waiver framed as the human's grant) and the RCA template's `## Probe` fold-in
instruction, which a Validate agent receives as its designDoc content per the
existing `gatherFeatureInputs` fallback.

## Expected observations

All five bulleted outcomes above matched what ran; no deviation.

## Teardown

```
rm -rf /var/folders/c8/87s4yg6j7q90fkn7_6tnftkc0000gn/T/loop-probe-BvVP1O
```
Confirmed gone (directory listing no longer shows `loop-probe-*`).
