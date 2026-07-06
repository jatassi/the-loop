# proposed-status — runbook record

Fixture-repo runbook (this repo's own binding): the CLI exercised from the outside,
as a user would, never in-process. `bin/create-sample-repo.js` now seeds a third,
`proposed` record (`greet-farewell`, id + title only, no acceptance) alongside the
existing validated/designed pair, so the fixture itself carries the backlog stage.
The eligible-set-exclusion and proposed-only-backlog criteria (3 and 4) need graph
shapes the shipped fixture doesn't produce (a designed feature depending on a
proposed one; a graph whose only unshipped features are proposed), so those two
were exercised against small scratch graphs written by hand, same CLI, same
black-box posture.

## Bring-up

```
node bin/create-sample-repo.js
```
Printed a temp git repo path (`/var/folders/.../loop-probe-YyW8KM`) seeded as a
populated v2 target repository: `greet-core` (validated), `greet-cli` (designed,
depends on greet-core), `greet-farewell` (proposed, no acceptance) — committed on
`main`.

## Exercise

1. **Criterion 1 — proposed needs no acceptance; designed still does.**
   Against the fixture's own graph:
   ```
   node <plugin-root>/bin/the-loop.js check docs/feature-graph.md
   ```
   `OK   3 features — 0 error(s), 0 warning(s)`, exit 0 — `greet-farewell` (proposed,
   no `acceptance` key) raised nothing.
   Against a scratch graph with one `designed` feature and no `acceptance`:
   ```
   node <plugin-root>/bin/the-loop.js check <scratch>/docs/feature-graph.md
   ```
   `ERROR missing-acceptance: feature has no acceptance criterion
   (no-acceptance-designed)`, `FAIL 1 features — 1 error(s), 0 warning(s)`, exit 1.

2. **Criterion 2 — prepare-execution-context refuses a proposed feature.**
   Against a scratch repo whose graph names one `proposed` feature
   (`backlog-thing`):
   ```
   node <plugin-root>/bin/the-loop.js prepare-execution-context --features backlog-thing --target-branch main
   ```
   Exit 1; stdout empty; stderr:
   `error not-designed: feature is proposed, not designed — it must be designed
   first (backlog-thing)` followed by `spine: scope gate failed — nothing prepared`.

3. **Criterion 3 — a designed feature blocked on a proposed dependency.**
   Against a scratch graph: `proposed-blocker` (proposed), `stuck-designed`
   (designed, `depends_on: [proposed-blocker]`, has acceptance):
   ```
   node <plugin-root>/bin/the-loop.js status --json .
   ```
   Returned `eligibleSet: []` (stuck-designed excluded) and
   `proposal: { kind: "design", features: ["proposed-blocker"], summary: "1
   proposed feature(s) block the stuck designed set — design them first" }`.

4. **Criterion 4 — a proposed-only remaining backlog.** Against a scratch graph:
   `shipped-one` (shipped), `backlog-a` and `backlog-b` (both proposed):
   ```
   node <plugin-root>/bin/the-loop.js status --json .
   node <plugin-root>/bin/the-loop.js status docs/feature-graph.md
   ```
   JSON orientation returned `eligibleSet: []` and `proposal: { kind: "design",
   features: ["backlog-a", "backlog-b"], summary: "2 proposed feature(s) are the
   whole remaining backlog — design them next" }` — never `new-intake`. The human
   summary rendered `- proposed: 2` in the status-count block alongside the other
   three stages.

5. **Criterion 5 — route table and enum prose.** Covered by the merged automated
   suite (`test/proposed-status.test.js`), which spawns the real CLI and reads the
   shipped prose files directly: `commands/the-loop.md` maps a `design` proposal to
   the `design` skill and mentions parking an idea as a `proposed` record; the six
   named living surfaces (`docs/feature-graph.md`, `docs/architecture.md`,
   `docs/glossary.md`, `README.md`, `skills/design/SKILL.md`, `bin/the-loop.js`)
   each carry `proposed | designed | validated | shipped` together; a repo-wide
   grep for the old three-value statement returns zero hits outside the declared
   historical directories (`docs/adr/`, `docs/research/`, `docs/briefs/`,
   `docs/design/`, `docs/designs/`, `docs/plans/`, `docs/releases/`, `docs/bugs/`).
   Re-run directly: `node --test test/proposed-status.test.js` — 5/5 pass.

## Expected observations

- `check` passes a proposed feature with no acceptance, still fails a designed one
  without it.
- `prepare-execution-context` on a proposed scope exits 1, prints nothing to
  stdout, and names the feature with "must be designed first" on stderr.
- A designed feature depending on a proposed one never enters the eligible set;
  the orientation proposes `kind: "design"` naming the blocking proposed id
  (direct or transitive).
- A proposed-only remaining backlog proposes `kind: "design"` naming all of them,
  never `kind: "new-intake"`; the human summary counts the proposed stage.
- The `/the-loop` route table and every named living surface state the four-value
  enum; the old three-value statement is gone outside historical records.

## Teardown

```
rm -rf /var/folders/.../loop-probe-YyW8KM
```
Confirmed removed — a directory listing of the parent temp dir shows no
`loop-probe-*` entries remaining. The four hand-written scratch graphs (criteria
1b, 2, 3, 4) lived under this session's scratchpad directory, not the target repo;
removed the same way (`rm -rf`) once each check was recorded above.
