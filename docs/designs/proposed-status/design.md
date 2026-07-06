# proposed-status — feature design

**What this is.** Add `proposed` as the first value of the feature status enum —
the backlog stage. A proposed feature is a recorded intent: accepted onto the
roadmap as an id and a title, but not yet designed (no design doc, no acceptance
criteria, not runnable). The feature graph becomes the project's single backlog;
`docs/TODO.md` keeps only process items that aren't feature-shaped.

**Name provenance.** Blind-derived 2026-07-05 per the naming standard (ADR-0044):
three fresh-context `claude -p` generations, shown only the jargon-free purpose
line, the grammatical role, and the sibling values — `proposed` won 2-of-3 first
picks (runner-ups: backlogged, accepted, planned, queued), and a fresh no-context
outsider shown `proposed | designed | validated | shipped` correctly inferred the
stage's meaning and next step. Human-approved at this amendment's gate.

## Semantics (the contract)

- **Lifecycle**: `proposed → designed → validated → shipped`. Design is the only
  promotion path out of `proposed`: designing the feature writes its design doc
  and acceptance criteria and flips the status. No demotion automation —
  `set-status` accepts any enum value; moving backwards is a human edit.
- **Creation**: a human-gated graph amendment from any intake channel — append a
  record with id + title, optionally `notes`, `depends_on`, and an acceptance
  sketch. No design doc required, no acceptance required.
- **Schema**: `acceptance` is optional when status is `proposed` (acceptance is
  Design's output, not intake's) and remains required for
  `designed|validated|shipped`. An acceptance sketch on a proposed record is
  allowed, not demanded. Every other field rule is unchanged.
- **Scheduling**: `proposed` never satisfies a `depends_on` edge (the DONE set
  stays `{validated, shipped}`), never enters the eligible set (still
  `status === 'designed'` with satisfied deps), and `prepare-execution-context`
  refuses it via the existing not-designed gate — the refusal for a proposed
  feature should say it must be designed first.
- **Next-action proposal**: a new proposal kind `design`. Precedence in
  `propose()`:
  1. eligible set non-empty → `advance-eligible-set` (unchanged);
  2. designed features exist but none eligible → on a validate-clean graph this
     now means the blockage bottoms out at proposed dependencies (the old
     "unreachable" induction gains exactly this base case) → kind `design`
     naming the proposed features that are transitive dependencies of the stuck
     ones; `blocked` remains the safety net when no proposed feature explains
     the stall;
  3. validated features exist → `release` (unchanged);
  4. proposed features remain → kind `design` naming all of them;
  5. otherwise → `new-intake` (unchanged).
- **Status output**: the proposed stage is counted in the human summary and the
  machine orientation's `position.byStatus` (both derive from the STATUS array —
  verify, don't hand-add).

## Interfaces touched (real shapes, quoted from source)

- `src/feature-schema.js` — `export const STATUS = ['designed', 'validated',
  'shipped']` gains `'proposed'` prepended (lifecycle order). In
  `checkFeatureFields`, the `missing-acceptance` error applies only when
  `f.status !== 'proposed'`. The `bad-status` message derives from STATUS —
  no other change.
- `src/propose-next-action.js` — the `Proposal` typedef's kind union gains
  `'design'`; `propose()` implements the precedence above. `DONE` and
  `eligibleSet()` are **unchanged**. The stale comment claiming `blocked` is
  unreachable on a validate-clean graph is updated to name the proposed base
  case.
- `src/prepare-execution-context.js` — `checkScope`'s `not-designed` error, for
  a proposed feature, reads that the feature is proposed and must be designed
  first (today: `feature is ${node.status}, not designed — nothing to run`).
  `DONE` unchanged. A proposed dependency inside the scope still fails closed:
  the dep itself hits the not-designed gate.
- `src/status-summary.js` — no code change expected (counts map over STATUS);
  covered by a test asserting the four-stage counts render.
- `src/set-feature-status.js` — no change (validates against STATUS).
- `bin/create-sample-repo.js` — the fixture repo seeds one proposed record
  (id + title only) so the validation runbook can exercise the gates against it.
- `bin/the-loop.js` — the `set-status` usage comment lists the four values.

## Prose surfaces (land atomically with the code, sweep-style)

Every living surface stating the three-value enum lists four after this feature
lands; the old three-value statement greps to zero outside historical records:

- `docs/feature-graph.md` header ("the three durable statuses only").
- `docs/architecture.md` — Operating model paragraph and the Feature record
  interface contract (`status: designed|validated|shipped`).
- `docs/glossary.md` — the [[feature graph]] entry's status list.
- `README.md` — the status-field line.
- `skills/design/SKILL.md` — the feature-graph yaml sample's status comment;
  note that a proposed record needs no acceptance.
- `commands/the-loop.md` — the Routes table gains: `design` proposal → the
  `design` skill, amending the design for the named ids; the `new-intake` route
  mentions that an idea worth keeping but not designing now is parked as a
  proposed record by amendment.

## Constraints and non-goals

- ADR-0034's posture is unchanged: durable state stays code commits + the status
  field; `proposed` is durable recorded intent, not in-flight state.
- No priority, ordering, or aging fields on proposed records; no automation that
  promotes or prunes them.
- Historical records are never rewritten.
- Tests to cover: proposed-without-acceptance passes validate while
  designed-without-acceptance still fails; scope refusal wording; the two
  `design`-proposal cases (blocking-dep, backlog-drain) plus `blocked` still
  reachable on a repair-worthy graph; four-stage status rendering; fixture repo
  seeds a proposed record.
