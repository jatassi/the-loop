# Plan — inner-loop-workflow

The Workflow orchestration: `workflows/inner-loop.js` (script = brain, no filesystem,
agents = hands), the booking toolkit that lets phase agents book their own endings on
the integration target, the agent-surface amendments that make them do so, and the
`/the-loop` launch leg that assembles `args` and starts the run. Runs end in a
`BoundaryResult`; feature-shaped failures park and the run drains the remaining
frontier; environment-shaped blocks and budget exhaustion halt the run.

## Decomposition — three strands

**Strand A — the booking toolkit (t1–t5).** Pure-core mutations first (`setStatus`,
the remediation round-marker, escalation-block parsing, the deterministic Ledger
projection), then one task wiring all three CLI surfaces into `bin/spine.js` —
the hub file gets a single owning task. No agent ever hand-edits graph YAML or
Ledger prose again; every mutation goes parse → mutate the retained document →
render, byte-identical outside the block.

**Strand B — self-booking agent surfaces (t6–t8).** Each agent file is amended in
its own task: the plan agent books plan-commit + status flip (or the park on
bounce), each build agent folds its own completion report per task, the validator
books validate-or-park post-verdict and gains the `remediation-pending` composition.
These depend on t5 so the commands the surfaces cite exist when written.

**Strand C — the script and its shim harness (t9–t13), plus the launch leg (t14).**
The shim (t9) comes first because every script task proves its criteria through it.
The script then grows in chained layers over one file: core + happy path (t10),
park-and-drain (t11), halts and stalls (t12), the remediation round (t13). t14
teaches `/the-loop` to assemble `args` and launch the Workflow.

Strands A/B and C are footprint-disjoint and can build concurrently; the pinned
conventions below are the single spec both sides build against — neither side may
improvise a shape the other would have to guess.

## Pinned conventions (cross-task contract — do not improvise)

**Escalation record.** `docs/escalations/<feature-id>.md`: narrative prose, then one
fenced ` ```yaml ` block under the exact heading `## Escalation` with keys
`{ feature, phase: plan|build|validate, kind: feature|environment, deviation, menu: [option], branch }`
(`branch` is the `loop/<feature-id>` ref or `null`). `src/escalation.js` owns the
parse; parking agents write the file; resolution (a later feature) deletes it.

**Ledger sections.** `spine ledger render` preserves `## What this is` and
`## Run history` byte-identically from the prior text and regenerates `## Where we
are` (status counts + total + design_version), `## What needs you` (one entry per
escalation record: feature, phase, deviation summary, menu, branch; none → an
explicit "nothing parked" line), and `## What's next` (the dependency-ready
frontier). Deterministic: same inputs, byte-identical output.

**Booking commits.** Bookings are separate commits on the integration target
(default `main` unless the design narrative binds another ref), message
`<feature-id>: book <event>` with `<event>` one of `planned`, `task <task-id>`,
`parked at <phase>`, `validated`, `remediation-pending`. The perfect-verdict
squash-merge commit (`<feature-id>: validated at design_version <n>`) stays a
separate code commit, followed by its booking commit. Every booking that flips a
graph status re-renders the Ledger in the same commit. Every agent leaves HEAD on
the integration target. The parking agent authors the recommendation menu.

**Remediation round-marker.** The appended task: `id: remediation`,
`remediation: true`, `status: pending`, `covers: []`, footprint = the deduplicated
file paths from the findings' `file:line` locations (standards-axis findings cite
`file:line` by construction; a findings set yielding no file paths is refused with
nothing written — the plan on disk never fails plan check), one acceptance entry
per finding ("addressed, or rebutted with evidence"), `size: s`, `depends_on` =
every existing task id (which also satisfies plan check's overlap ordering
mechanically). Its presence is the durable round-marker; appending twice is
refused.

**Agent return-shape deltas** (the script's spawn schemas encode exactly these):

- **plan** — planned: `{ result: "planned", feature, tasks: [{ id, status, depends_on, size }], plan, notes? }`
  (the task summaries are the script's only way to learn a plan written this run).
  Bounce (park booked): `{ result: "bounce", kind: "feature", feature, deviation, menu: [option] }`.
  New environment block (nothing booked): `{ result: "blocked", kind: "environment", feature, detail }`.
- **build** — built: unchanged. Blocked gains `kind`: feature-kind (park booked)
  adds `menu: [option]`; environment-kind books nothing.
- **validate** — `result: "perfect" | "deviation" | "remediation-pending"`; adds
  `remediation_task` (remediation-pending only), `menu: [option]` when it booked a
  park, and top-level `kind: "feature" | "environment"` when a readiness block ended
  the feature's run-participation (semantic conflict → feature; dirty tree or
  precondition down → environment, nothing booked). Two minimal short-circuit
  shapes exist — dedup `{ feature, patch_id, result, merged: false, dedup: true }`
  and crash-healed `{ feature, design_version, patch_id, result: "perfect",
  merged: true, reconstruction: <sha> }` — so the spawn schema requires only
  `feature` + `result` and leaves the rest optional.
- **derive** — unchanged; the script maps its `blocked` to an environment halt
  (an args-construction defect).

**Script conventions.** The script consumes harness globals (`agent`, `parallel`,
`pipeline`, `log`, `args`, `budget`) — never `import`s them and never touches the
filesystem; `eslint.config.js` gains a `workflows/` block declaring them. Every
spawn passes `{ agentType, label, phase: <feature-id>, schema }` (deriver adds
`effort: "low"`); the harness validates returns against the schema. **Completion
channel**: the documented harness contract — `export const meta` plus a
top-level `return` of the BoundaryResult (the file is a workflow script, not
plain ESM; the harness applies its own transform), also emitted as the final
`log()` line as belt-and-braces. Lint absorbs the shape: the `workflows/` block
in `eslint.config.js` preprocesses the meta export before parsing with
`globalReturn` on, justified in-config. The live return channel joins the
budget-error identity on the first-live-run confirmation list. Frontier semantics: runnable
statuses are `designed` (enter at Plan), `planned` (enter at Build), `building`
(resume at the first non-`built` task); a dependency is satisfied iff its feature
is `validated` or `shipped`; statuses update in memory from agent returns; an
in-scope feature that isn't runnable is skipped with a `log()` line, never an
error — which makes dependent exclusion on park/stall transitive for free. Error
policy at a spawn: a thrown error is classified by one named helper — only an
error whose `name` or `code` identifies budget exhaustion halts the run
`budget-exhausted` (message text alone never halts; the true harness identity is
confirmed at the first live run, and the conservative default degrades a missed
budget error to per-feature stalls, never a wrong halt); any other throw, a `null`
return, or a schema-exhausted spawn → the feature stalls and the run continues.
v1 is fully sequential — straight awaited `agent()` calls; no
`parallel()`/`pipeline()`.

The `parked` and `stalled` entry keys above and in the tasks (`feature`,
`deviation`, `menu`; `feature`, `phase`, `note`) deliberately concretize the
boundary-result sketch's prose placeholders (`feature-id`,
`recommendation-menu`) — surfacing consumes these concrete keys.

**`args` orientation snapshot** (assembled by the session per t14):
`{ target, scope: [feature-id], index (spine index output), slices: { <id>: spine resolve output }, plans: { <id>: task summaries }, probe (the runtime-probe binding excerpt) }`.
Run-scoped slices ride `args` so the Read-only deriver stays blind and prompt-fed;
the whole design never crosses the edge.

## Size-ceiling justifications

- **t8 (`m`)** — `agents/validate.md` is one self-contained surface; splitting the
  booking, remediation, and typed-block amendments into sequential edits of the
  same file would leave it internally inconsistent between tasks and cost each
  builder a full re-read of the longest agent doc. One coherent rewrite is smaller
  than two half-rewrites.
- **t10 (`m`)** — the script skeleton (meta, args consumption, frontier loop,
  four spawn schemas, happy-path sequence, exported result) is the irreducible
  core: no strict subset of it runs at all, so there is no smaller first slice
  that a test could observe. Later layers (t11–t13) stay small because t10 carries
  the skeleton. Keep it lean — the file must stay inside the 350-line lint budget
  after t13; compact schemas, no speculative branches.

## Tasks

```yaml
feature: inner-loop-workflow
design_version: 4
tasks:
  - id: t1
    title: setStatus — round-trip-safe feature-status mutation in the pure core
    status: built
    covers: [1]
    acceptance:
      - setStatus(model, featureId, status) flips exactly that feature's status in both the JS model and the retained YAML document, and render() of the mutated model changes only that feature's status line of the source text
      - an unknown feature id or a status outside the feature-node enum is refused with a thrown error naming the offender, leaving the model untouched
    injects: [feature-node]
    standards: [docs/standards/pure-core-thin-cli.md, docs/standards/derived-and-hybrid-artifacts.md]
    footprint: [src/status.js, test/status.test.js]
    size: xs
    depends_on: []
    report:
      result: built
      footprint_actual:
        - src/status.js
        - test/status.test.js
      diff_actual:
        files: 2
        insertions: 70
        deletions: 0
      deviations: []
      summary: "src/status.js exports setStatus(model, featureId, status), following the same parse→mutate-retained-doc→render pattern as plan.js's foldReport: it locates the feature by id in model.features, validates the new status against schema.js's STATUS enum, then writes the flip into both the in-memory node and the retained YAML doc via doc.setIn, so render() changes only that feature's status line and the artifact still round-trips byte-identically elsewhere. An unknown feature id or an out-of-enum status throws an Error naming the offender before any mutation occurs. Both acceptance criteria proven by one test each in test/status.test.js, watched red then green. Full suite (72 tests) and eslint pass; one commit on loop/inner-loop-workflow."

  - id: t2
    title: Remediation round-marker — appendRemediation + plan-check exemption
    status: built
    covers: [1]
    acceptance:
      - appendRemediation(plan, findings) appends the pinned round-marker task (id remediation, remediation true, pending, covers empty, footprint = the deduplicated file paths from the findings' file-and-line locations, one addressed-or-rebutted acceptance entry per finding, size s, depends_on = all existing task ids) to both the JS model and the retained YAML document, and the result survives render() round-trip
      - a plan already carrying a remediation-marked task is refused with a thrown error — the marker is durable and the round runs once — and a findings set yielding no file paths is likewise refused with the plan untouched
      - validatePlan raises no covers-related error for a remediation-marked task (empty covers allowed, coverage accounting unchanged both ways), and parsePlan preserves the remediation flag so a consumer detects the round mechanically
    injects: [task-contract, validator-verdict]
    standards: [docs/standards/pure-core-thin-cli.md, docs/standards/derived-and-hybrid-artifacts.md]
    footprint: [src/plan.js, test/plan.test.js]
    size: s
    depends_on: []
    report:
      result: built
      footprint_actual:
        - src/plan.js
        - test/plan.test.js
      diff_actual:
        files: 2
        insertions: 98
        deletions: 2
      deviations: []
      summary: "src/plan.js gains appendRemediation(plan, findings): it refuses a second append when any task already carries remediation:true (the marker is durable, one round per feature), derives footprint as the deduplicated file paths parsed from findings whose location matches the 'path:line' shape (probe-observation locations without a trailing :line contribute nothing), and refuses when that set is empty, leaving the plan untouched. On success it pushes the pinned marker task onto both plan.tasks and the retained YAML doc via doc.setIn, so render() persists it and the artifact still round-trips. checkTaskCovers gained a one-line exemption so an empty covers on the marker raises no task-covers-nothing, without touching coverage accounting elsewhere. normalizeTask now carries the remediation flag through parsePlan, so a consumer detects the round mechanically. All three acceptance criteria proven by one test each in test/plan.test.js, each watched red then green. Full suite (75 tests), eslint, and npm run check all pass; one commit (0c957f4) on loop/inner-loop-workflow, rebased cleanly onto main's current tip."

  - id: t3
    title: Escalation-record block parsing
    status: built
    covers: [1]
    acceptance:
      - parseEscalation(text) returns { feature, phase, kind, deviation, menu, branch } from the yaml block under the pinned "## Escalation" heading, defaulting menu to an empty list and absent scalars to null
      - text with no Escalation block or no yaml fence returns null rather than throwing
    injects: [escalation-record]
    standards: [docs/standards/pure-core-thin-cli.md]
    footprint: [src/escalation.js, test/escalation.test.js]
    size: xs
    depends_on: []
    report:
      result: built
      footprint_actual:
        - src/escalation.js
        - test/escalation.test.js
      diff_actual:
        files: 2
        insertions: 98
        deletions: 0
      deviations: []
      summary: "src/escalation.js exports parseEscalation(text), reusing blocks.js's yamlBlockAfter to locate the yaml block under the pinned '## Escalation' heading, then YAML.parse's the inner text into a plain object with the pinned keys {feature, phase, kind, deviation, menu, branch}: absent scalars default to null, an absent menu defaults to []. No Document/round-trip machinery since this task carries no mutation contract — escalation records are write-once and deleted at resolution, never edited in place. Both acceptance criteria proven by one test each in test/escalation.test.js, each watched genuinely red (the second by temporarily removing the null-guard) then green. Full suite (77 tests), eslint, and npm run check all pass; one commit (9784f7d) on loop/inner-loop-workflow, rebased cleanly onto main's current tip before building."

  - id: t4
    title: renderLedger — deterministic Ledger projection from graph + escalations
    status: built
    covers: [1]
    acceptance:
      - renderLedger(model, escalations, priorText) returns a full Ledger document that preserves the "## What this is" and "## Run history" sections byte-identically from priorText and regenerates "## Where we are" (counts by status, total, design_version), "## What needs you" (one entry per escalation with feature, phase, deviation summary, menu, branch; an explicit nothing-parked line when empty), and "## What's next" (the dependency-ready frontier ids)
      - the projection is deterministic — identical inputs render byte-identical output, twice
      - a priorText missing a preserved section still renders, seeding a minimal placeholder for it
    injects: [escalation-record, feature-node]
    standards: [docs/standards/pure-core-thin-cli.md, docs/standards/derived-and-hybrid-artifacts.md]
    footprint: [src/ledger.js, test/ledger.test.js]
    size: s
    depends_on: [t3]
    report:
      result: built
      footprint_actual:
        - src/ledger.js
        - test/ledger.test.js
      diff_actual:
        files: 2
        insertions: 156
        deletions: 0
      deviations: []
      summary: "src/ledger.js exports renderLedger(model, escalations, priorText): a five-section document — priorText's '## What this is' and '## Run history' sliced out verbatim, interleaved with three regenerated sections: '## Where we are' (Total + design_version, then a count per STATUS enum value in enum order), '## What needs you' (one bullet per escalation record: feature, phase, deviation, menu, branch; explicit 'Nothing parked' when empty), '## What's next' (reuses frontier(model) from src/entry.js rather than reimplementing; 'Nothing dependency-ready.' when empty). Pure — no fs/clock/process — so determinism falls out for free. The missing-preserved-section path was watched fail against real code before the seeded-placeholder fallback was added. Three criteria, one test each: byte-equality against a hand-built fixture, same-inputs-twice equality, heading-omitted render. Full suite (85 tests), eslint, npm run check pass; one commit (b7f7f64) on loop/inner-loop-workflow, rebased onto main's tip."

  - id: t5
    title: CLI wiring — spine set-status, spine ledger render, spine plan remediate
    status: built
    covers: [1]
    acceptance:
      - spine set-status <feature-id> <status> rewrites docs/design/design.md with only that feature's status changed (byte-identical elsewhere), prints the updated node as JSON, and exits 0; an unknown id or bad status exits 1 without writing
      - spine ledger render reads design.md, docs/escalations/*.md (absent dir = none), and the current Ledger, writes docs/ledger/ledger.md per the pinned section rules, and is idempotent — a second run changes nothing
      - spine plan remediate <feature-id> [findings.json|-] appends the round-marker task and writes the plan back such that spine plan check passes; a second invocation, or a findings set yielding no file paths, exits 1 having written nothing
      - the spine usage string names all three new commands, and effects stay at the bin edge (fs/git/exit) with mutation logic in src
    injects: [feature-node, task-contract, escalation-record]
    standards: [docs/standards/pure-core-thin-cli.md, docs/standards/derived-and-hybrid-artifacts.md]
    footprint: [bin/spine.js, test/spine-cli.test.js]
    size: s
    depends_on: [t1, t2, t4]
    report:
      result: built
      footprint_actual:
        - bin/spine.js
        - test/spine-cli.test.js
      diff_actual:
        files: 2
        insertions: 273
        deletions: 6
      deviations: []
      summary: "bin/spine.js gains the three booking-toolkit commands over the src/ logic built in t1/t2/t4: spine set-status (writes design.md only on success, prints the updated node, exits 1 via the existing top-level catch before any write on refusal), spine ledger render (readEscalations() helper guards an absent docs/escalations/ to []; idempotent via renderLedger's determinism), and spine plan remediate (findings from file, '-', or stdin mirroring plan report; refuses a second round-marker or footprint-less findings with nothing written). Usage string and header name all three; effects stay at the bin edge, mutation logic in src/ untouched. Four criteria, one test each, each spawning the real CLI as a subprocess against a throwaway fixture dir; all four watched genuinely red by stashing the bin diff against the old CLI, then green restored. Full suite (89 tests) and eslint pass; one commit (5482238) on loop/inner-loop-workflow, rebased onto main's tip."

  - id: t6
    title: agents/plan.md — self-booking, typed blocks, task-summary return
    status: built
    covers: [1, 2]
    acceptance:
      - the surface instructs the plan agent to book on the integration target after plan check passes — commit the plan artifact, spine set-status designed→planned, spine ledger render, one booking commit per the pinned message convention, HEAD left on the target
      - the bounce path books the park — escalation record in the pinned format (menu authored by the agent), spine set-status parked, spine ledger render, one booking commit — and the bounce return carries kind feature and the menu
      - a new environment-shaped blocked return (e.g. dirty tree) is documented that books nothing, per the pinned return-shape deltas
      - the planned return carries task summaries [{ id, status, depends_on, size }] exactly as pinned
      - the surface stays self-contained — no ADR or internal-doc references, no session context assumed
    injects: [escalation-record, task-contract]
    standards: [docs/standards/loop-surfaces.md]
    footprint: [agents/plan.md]
    size: s
    depends_on: [t5]
    report:
      result: built
      footprint_actual:
        - agents/plan.md
      diff_actual:
        files: 1
        insertions: 85
        deletions: 29
      deviations: []
      summary: "agents/plan.md gained: a Readiness step returning { result: blocked, kind: environment, detail } on a dirty tree (booking nothing); a bounce path that authors the 2-3-option menu and books the park (escalation record with the pinned '## Escalation' block, phase plan, branch null; spine set-status parked; spine ledger render; one 'book parked at plan' commit; HEAD on the target) with the bounce return carrying kind feature + menu; a Book-the-plan step after plan check is clean (plan-artifact commit, then set-status planned + ledger render as one 'book planned' commit); and the planned return's tasks as [{id, status, depends_on, size}] per the pinned shape. Cross-references renumbered; grepped for ADR refs (none); re-read end-to-end for self-containment. No test file — agents/*.md are prose surfaces with no test harness (none carry one); verification was a criterion-by-criterion re-read plus a full-suite regression run (89 tests, eslint, spine check). One commit (329b0ed) on loop/inner-loop-workflow, rebased onto main's tip."

  - id: t7
    title: agents/build.md — per-task fold-in booking, typed blocks, crash healing
    status: built
    covers: [1, 2, 3]
    acceptance:
      - after the one branch commit, the surface instructs the agent to book on the integration target — spine plan report folds its completion report, the feature's first task also flips planned→building via spine set-status, spine ledger render on any flip, one booking commit, HEAD left on the target — replacing the old never-write-docs/plans ban with this mechanical protocol
      - blocked returns are typed per the pinned deltas — feature-kind books the park (escalation record with agent-authored menu, spine set-status parked, spine ledger render, one booking commit; nothing committed on the branch) while environment-kind books nothing
      - crash healing is documented — a task commit already on the branch with the plan entry still pending is re-folded from that commit, reconstruction noted in the report (deviation prose lost, footprints not)
      - the surface stays self-contained — no ADR or internal-doc references
    injects: [completion-report, escalation-record, task-contract]
    standards: [docs/standards/loop-surfaces.md]
    footprint: [agents/build.md]
    size: s
    depends_on: [t5]
    report:
      result: built
      footprint_actual:
        - agents/build.md
      diff_actual:
        files: 1
        insertions: 111
        deletions: 31
      deviations: []
      summary: "agents/build.md gained a mechanical self-booking protocol mirroring t6's agents/plan.md: a new step 5 'Book on the integration target' that switches to the target after the branch commit and, on Built, folds the completion report via spine plan report, flips the feature planned→building via spine set-status only when this is the feature's first task (checked via spine resolve), re-renders the Ledger only on that flip, and commits plan.md (plus design.md/ledger.md when flipped) as one 'book task <task-id>' commit. Blocked returns are now typed: feature-shaped (a contradictory/untestable contract from step 1/3, or a rebase conflict from step 2) authors a menu and books the park — escalation record under the pinned '## Escalation' heading (phase build, branch loop/<feature-id>), spine set-status parked, spine ledger render, one 'book parked at build' commit, leaving the task itself pending in the plan for a later retry; environment-shaped (dirty tree, mis-sequencing) books nothing. Step 4's old absolute 'never write to docs/plans/ or docs/design/' ban is replaced with a pointer to the new mechanical step 5 as the one sanctioned place those files change. Crash healing is documented in step 2: before building fresh, search the feature branch's commits since it diverged from the target for one matching this task's own commit pattern; a match (code already committed, plan still pending) skips straight to deriving the report from that commit, with 'deviations' noting the reconstruction explicitly — the original run's deviation prose is lost, but footprint_actual/diff_actual are not, since git recomputes both exactly. Return shapes in step 6 now carry kind (feature|environment) and menu (feature-shaped only) alongside the unchanged built shape. Grepped the finished file for 'ADR' (no hits) and re-read it end-to-end for self-containment; no test file — agents/*.md are prose surfaces with no test harness, per the same convention t6 documented. Full suite (89 tests), eslint, and npm run check all pass; one commit (0b6fd9f) on loop/inner-loop-workflow, rebased cleanly onto main's tip before building."

  - id: t8
    title: agents/validate.md — post-verdict booking, remediation-pending, typed readiness blocks
    status: built
    covers: [1, 2, 3]
    acceptance:
      - the verdict composition gains remediation-pending exactly as contracted — all legs would-PASS and readiness clean and standards findings exist (advisory-only included) and no remediation-marked task in the plan — with the merge withheld, the round-marker appended via spine plan remediate, and the task named in the return as remediation_task
      - remediation-pending books like any verdict — the pass-1 entry appended to docs/validations/<feature-id>.md, spine ledger render, one booking commit per the pinned convention, graph status unchanged
      - post-verdict booking on the integration target is instructed — append the verdict entry to docs/validations/<feature-id>.md keyed by patch_id, pin the exercise into docs/probes/ on perfect, spine set-status (validated on perfect / parked on deviation), spine ledger render, escalation record with menu on deviation, the booking as its own commit after any squash-merge commit, HEAD left on the target — and the write ban is rescoped to the judged tree during validation
      - readiness blocks are typed per the pinned deltas — semantic conflict is feature-kind and books the park; a dirty tree or failed precondition is environment-kind and books nothing — and the return carries the kind
      - crash healing is documented — a landed squash commit with the graph unflipped completes the booking with a reconstruction-marked validations entry citing the squash commit
      - a plan carrying the round-marker routes surviving standards findings by severity and composes plain perfect or deviation — never a second remediation-pending
      - the return shape reflects all deltas and the surface stays self-contained — no ADR or internal-doc references
    injects: [validator-verdict, escalation-record]
    standards: [docs/standards/loop-surfaces.md]
    footprint: [agents/validate.md]
    size: m
    depends_on: [t2, t5]
    report:
      result: built
      footprint_actual:
        - agents/validate.md
      diff_actual:
        files: 1
        insertions: 200
        deletions: 39
      deviations: []
      summary: "agents/validate.md gained the four ADR-0029 deltas over the existing four-leg protocol. Readiness (step 1) now types every BLOCK: a dirty tree or a failed precondition is environment-shaped (books nothing); a semantic rebase conflict is feature-shaped and books the park (escalation record phase validate, spine set-status parked, spine ledger render, one 'book parked at validate' commit) before returning BLOCKED with kind. A new crash-healing check (step 1 item 2) runs first: it searches the target's log for a landed '<feature-id>: validated at design_version <n>' commit newer than the feature's last docs/validations entry while the graph is still short of validated, and if found skips the legs entirely, recomputes patch_id from the squash commit's own diff against its parent, and completes the booking with a validations entry carrying reconstruction: <squash-commit-sha> in place of the lost readiness/legs/exercise. Step 6 (Verdict) gained the three-way ADR-0029 composition: perfect unchanged; remediation-pending iff every leg would satisfy the perfect bar once the conformance leg's standards-axis findings are set aside, that axis carries at least one finding of either severity, and the plan carries no remediation-marked task yet; deviation is everything else, with a plan already carrying the round-marker routing surviving standards findings by severity into plain perfect|deviation, never a second remediation-pending. A new step 7 'Book on the integration target' implements post-verdict booking for all three results plus the feature-shaped readiness block: every result first appends a patch_id-keyed entry to docs/validations/<feature-id>.md; perfect additionally pins the executed exercise into docs/probes/<feature-id>.md, flips the graph to validated, re-renders the Ledger, and commits 'book validated' after the squash-merge commit; remediation-pending feeds the surviving standards findings to spine plan remediate (stdin), re-renders the Ledger, and commits 'book task remediation' (reusing the pinned task <task-id> convention) with the graph status left unchanged; deviation authors a menu, writes the escalation record, flips the graph to parked, re-renders the Ledger, and commits 'book parked at validate'. The intro's 'Flags, not fixes' rule is rescoped: the tree-edit ban now binds only the judged tree through the four legs, with step 7's booking named as the sanctioned, separate, post-verdict write on the target. Step 8 (Return) adds the previously-undocumented 'blocked' shape (kind: feature|environment, menu on feature-kind only) and adds remediation_task and reconstruction to the verdict shape, each scoped to when they apply. Grepped the finished file for 'ADR' (no hits) and re-read it end-to-end for self-containment, per the same convention t6/t7 documented; no test file — agents/*.md are prose surfaces with no test harness. Full suite (89 tests), eslint, and npm run check all pass; one commit (47c31a9) on loop/inner-loop-workflow, rebased cleanly onto main's tip before building."

  - id: t9
    title: Workflow shim harness — execute the real script under node:test
    status: built
    covers: [1, 2, 3]
    acceptance:
      - the shim executes a workflow script file with stub agent/parallel/pipeline/log/args/budget installed as the harness globals, isolated per scenario (repeat runs of the same file with different scripted replies never share state), and returns { result, spawns, logs } where result is the script's returned value — the shim wraps the body so the workflow-script shape (meta export + top-level return) executes
      - the agent stub replays scripted replies in spawn order, records each spawn's prompt and opts (agentType, label, phase, schema, effort), and can be scripted to return null or to throw a given error (including a budget-named one)
      - a self-test proves the shim against a small fixture script — the recorded spawn carries its opts and the fixture's returned value comes back as result
      - the shim module has no top-level side effects, so bare node --test discovery executing it directly is a no-op pass
    injects: [boundary-result]
    standards: []
    footprint: [test/workflow-shim.js, test/workflow-shim.test.js]
    size: s
    depends_on: []
    report:
      result: built
      footprint_actual:
        - test/workflow-shim.js
        - test/workflow-shim.test.js
      diff_actual:
        files: 2
        insertions: 156
        deletions: 0
      deviations: []
      summary: "test/workflow-shim.js exports runWorkflowScript(scriptPath, {agentReplies, args, budget}): it reads the script file, neutralizes the export const meta line, then compiles the rest as the body of a dynamically-constructed AsyncFunction taking agent/parallel/pipeline/log/args/budget as parameters — so the workflow-script shape's top-level await and return execute as the real harness runs them. Fresh closures per call: two runs of the same file scripted differently never share state. The agent stub replays agentReplies in call order, records {prompt, opts} per spawn, returns .returns (null past the end) or throws .throws — proven with a null + thrown BudgetExceededError fixture. A self-test fixture proves the recorded spawn carries its exact opts (including effort) and the fixture's returned value comes back as result. The shim module has no top-level side effects; bare node --test discovery of it is a no-op pass, asserted by shelling out (clearing NODE_TEST_CONTEXT) and red-proofed via a temporary top-level throw. Full suite (82 tests), eslint, npm run check pass; one commit (51f34c7) on loop/inner-loop-workflow, rebased onto main's tip."

  - id: t10
    title: inner-loop.js core — args, frontier, happy-path spawn sequence
    status: built
    covers: [1]
    acceptance:
      - workflows/inner-loop.js exists with an export const meta line, consumes the pinned args snapshot, and computes the runnable frontier per the pinned semantics from args.index plus in-memory status updates
      - under the shim, a designed feature runs Plan → Build (tasks in depends_on order, from the plan return's task summaries) → Derive (effort low, prompt carrying the feature's slice from args.slices plus args.probe) → Validate (prompt carrying the expectation sheet), every spawn passing agentType, label, phase, and a schema encoding the pinned return shapes
      - a scripted perfect verdict yields the BoundaryResult per the pinned completion channel (top-level return, echoed as the final log() line) — completed carrying the feature, parked and stalled empty, budget present
      - a feature entering as planned or building skips Plan and enters Build from args.plans, resuming at the first non-built task, and still spawns Derive before Validate (the pass-1 sheet lives only in run memory — a crashed run re-derives); an in-scope feature that isn't runnable is skipped with a log() line, never an error
      - npm run check passes with a workflows/ block in eslint.config.js declaring the harness globals and absorbing the workflow-script shape (meta export + top-level return), justified in-config
    injects: [boundary-result, validator-verdict, completion-report]
    standards: []
    footprint: [workflows/inner-loop.js, test/inner-loop-happy.test.js, eslint.config.js]
    size: m
    depends_on: [t9]
    report:
      result: built
      footprint_actual:
        - eslint.config.js
        - test/inner-loop-happy.test.js
        - workflows/inner-loop.js
      diff_actual:
        files: 3
        insertions: 272
        deletions: 0
      deviations:
        - "The plan narrative names the eslint mechanism as 'preprocesses the meta export before parsing with globalReturn on'. Checked directly against the installed espree: no sourceType/parserOptions combination parses a file needing both a top-level await and a top-level return together. Used an async-IIFE-wrapping processor instead (preprocess wraps the body, neutralizing only the export const meta line; postprocess un-shifts line numbers), satisfying the criterion's functional requirement without the specific named knob."
      summary: "workflows/inner-loop.js exists with export const meta and consumes the pinned args snapshot plus the agent/log/budget harness globals — no imports, no filesystem. Frontier: statusById/nodeById seed from args.index.features; isRunnable() checks the feature's status against designed|planned|building and every depends_on edge against validated|shipped; statusById updates in memory on a perfect verdict so a later in-scope dependent sees an in-run completion. runFeature() runs Plan (only from designed) then runBuild() — topologically orders task summaries by depends_on, filters to non-built, spawns one build agent per remaining task — then always spawns Derive (effort low, prompt carrying args.slices[id] + args.probe verbatim) before Validate (prompt carrying the derive return as the expectation sheet). Every spawn passes agentType, label, phase: featureId, and a schema encoding the pinned result enum and minimum required keys. planned/building features skip Plan and resume from args.plans at the first non-built task; a non-runnable in-scope feature is skipped via one log() line. The BoundaryResult is the literal top-level return, echoed as the final log() line. Three tests, each watched red then green: two-feature happy path (frontier, phase sequence, depends_on-ordered builds despite an out-of-order plan return, result+echo), building-status resume with Plan skipped, unsatisfied-dependency skip with zero spawns. eslint.config.js gained the workflows/ processor block with in-comment justifications; the file's real max-lines budget untouched (108 lines). Full suite (92 tests) and npm run check pass; one commit (91e7f46) on loop/inner-loop-workflow, rebased onto main's tip."

  - id: t11
    title: inner-loop.js park-and-drain — typed feature parks, frontier draining
    status: built
    covers: [2]
    acceptance:
      - a plan bounce (kind feature) produces a parked entry { feature, deviation, menu } carrying the agent-authored menu verbatim, and the run continues
      - a feature-kind blocked build return parks the feature with no further task spawns for it (first block parks), and a validate deviation return parks likewise
      - an in-scope dependent of a parked feature never spawns (transitive exclusion via frontier semantics) while an independent in-scope feature still runs to completion in the same run — the drain, asserted on the spawn sequence
    injects: [boundary-result]
    standards: []
    footprint: [workflows/inner-loop.js, test/inner-loop-park.test.js]
    size: s
    depends_on: [t10]
    report:
      result: built
      footprint_actual:
        - workflows/inner-loop.js
        - test/inner-loop-park.test.js
      diff_actual:
        files: 2
        insertions: 180
        deletions: 8
      deviations: []
      summary: "workflows/inner-loop.js gained typed feature-shaped parking layered over t10's happy path: runBuild now returns the first feature-kind blocked build return so runFeature stops spawning further tasks for that feature (build.md's 'first block parks' contract); runFeature itself short-circuits on a plan 'bounce' return before ever calling runBuild; and the outer loop's verdict switch gained a 'deviation' arm alongside the existing 'perfect' arm. All three park sources funnel through a new parkEntry(featureId, r) helper that reconciles plan/build's differently-shaped defect fields (plan's singular deviation; build's plural deviations array joined into one string; validate's deviation verdict carries neither field on its own return, since that detail already lives only in the escalation record the validate agent itself booked) into the pinned { feature, deviation, menu } parked-entry shape. Because a parked feature's statusById entry never advances past its pre-run status, isRunnable's existing dependenciesSatisfied check excludes its dependents for free — no new exclusion logic was needed, just the existing frontier semantics running against a status a park never flips. Four tests in test/inner-loop-park.test.js, each watched red against the unmodified t10 code then green: (1) a plan bounce parks with its deviation/menu carried verbatim while an independent feature completes in the same run; (2) a feature-kind blocked build return stops task spawning at the first block, before derive/validate ever run for that feature; (3) a validate deviation return parks the feature after the full phase sequence runs; (4) an in-scope dependent of a parked feature contributes zero spawns while an unrelated in-scope feature still completes — the drain, asserted on the spawn-phase sequence. Full suite (96 tests), eslint, and npm run check all pass; one commit (568c2aa) on loop/inner-loop-workflow, rebase onto main's tip was a no-op."

  - id: t12
    title: inner-loop.js halts and stalls — environment blocks, budget, agent death
    status: pending
    covers: [3]
    acceptance:
      - an environment-kind return from any phase (plan blocked, build blocked, validate readiness, derive blocked) stops all further spawning and sets halted { reason environment-blocked, detail }, preserving completed and parked booked so far
      - a thrown error whose name or code identifies budget exhaustion sets halted { reason budget-exhausted } with prior results retained, via the pinned classification helper; a null return, any other throw (message text alone never halts), or a schema-exhausted spawn adds a stalled entry { feature, phase, note } and the run continues with the next runnable feature
      - every BoundaryResult — halted or not — carries budget { spent, remaining } from the harness budget global
    injects: [boundary-result]
    standards: []
    footprint: [workflows/inner-loop.js, test/inner-loop-halt.test.js]
    size: s
    depends_on: [t11]

  - id: t13
    title: inner-loop.js remediation round — one bounded pass, sheet reuse
    status: pending
    covers: [1]
    acceptance:
      - a remediation-pending verdict makes the script spawn a build agent for the named remediation_task and then re-validate passing the pass-1 expectation sheet — the deriver is not respawned, asserted on the spawn sequence
      - a round-2 perfect completes the feature and a round-2 deviation parks it, each reflected in the BoundaryResult
      - a second remediation-pending on the same feature is treated as a stall with a protocol-violation note, never a loop
    injects: [validator-verdict]
    standards: []
    footprint: [workflows/inner-loop.js, test/inner-loop-remediation.test.js]
    size: s
    depends_on: [t12]

  - id: t14
    title: /the-loop launch leg — args assembly, clean-tree gate, agent resolution, relay
    status: pending
    covers: [1, 3]
    acceptance:
      - the advance-frontier route instructs the session to verify a clean tree at the integration-target checkout before launching (dirty tree is surfaced, unattributed, and nothing runs), confirm the scope handshake, and assemble the pinned args snapshot mechanically — target from the design binding, index via spine index, per-feature slices via spine resolve, task summaries via spine plan parse for features with plans, and the runtime-probe binding excerpt
      - the route launches the Workflow with scriptPath pointing at the plugin's workflows/inner-loop.js and the assembled args, after checking plugin-agent resolution and, when agents do not resolve, symlinking the plugin's agents/*.md into the target repo's .claude/agents/
      - the returned BoundaryResult is relayed — completed, parked with menus, stalled, and halted with its reason are each stated to the human
      - the explicit plan/build/validate jumps route through this same launch leg, and the surface stays self-contained — no ADR or internal-doc references
    injects: [boundary-result, runtime-probe]
    standards: [docs/standards/loop-surfaces.md]
    footprint: [commands/the-loop.md]
    size: s
    depends_on: [t10]
```
