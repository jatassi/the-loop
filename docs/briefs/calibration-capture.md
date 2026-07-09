# Brief — calibration-capture: Calibration Memory (per-project capture, recalled at Plan/Design)

## Intent

The loop makes sizing judgments every run — workflow paths, task sizes, judgment
levels, footprints — and today it learns nothing from how they turn out. Calibration
Memory closes that gap: every run automatically leaves behind a structured record of
estimated-vs-actual, and Plan/Design consult the accumulated history so the loop
decomposes better over time *in this repo*. It also makes the founding thesis
measurable: each record separates loop-overhead tokens from build tokens, so "earns
its context" is a number that trends, not an assumption (constraint carried from the
2026-07-01 review; seed methodology = the v2 benchmark's transcript forensics —
per-feature agent counts, cache-read tokens, wall clock, commits, human
interventions).

ADR-0007 settled the contested ground: per-project, in the target repo
(markdown + frontmatter + index), v1 capture-only and human-glanceable, recalled at
Plan/Design; cross-project wisdom rides the human-tuned plugin defaults, never
automatic averaging.

## Users

Jackson (sole dogfooder), in two postures: the operator whose runs get automatically
recorded, and the reader glancing at a project's calibration history. The plan and
design surfaces are the machine consumers.

## What it looks like (demonstrative scenario)

Concrete walkthrough — imagine `recipe-app`, an ordinary target repo the-loop
operates on (self-hosting is just the degenerate case where target = the-loop
itself). Everything below lives in **recipe-app's** repo, because ADR-0007 put
calibration with every other artifact in the target:

**Capture (invisible, per run).** You run `/the-loop`, it builds `meal-planner`. The
run's final scribe commits `docs/calibration/runs/2026-07-08-1.md` to recipe-app's
target branch: planned 3 tasks (`s`,`s`,`xs`) → actual squash touched 9 files vs 6
planned, 5 agents, 22 min, validated. Last week's record holds a re-slice event:
`export-pdf`'s plan returned `needs_refinement` because one criterion spanned UI and
worker. You never triggered any of this.

**The digest (recipe-app's own posterior).** After ~10 runs,
`docs/calibration/index.md` says things like: small-path features run 2 agents /
~14 min median; `m`-sized tasks overran their planned footprint 60% of the time; 2
of 13 features re-sliced, both spanning the UI/worker boundary; "playwright fixture
flaky" blocked twice.

**Recall at Plan (machine-fed).** Next run, `prepare-execution-context` — executed
in recipe-app — splices recipe-app's digest into the execution context. The plan
agent sizing `shopping-list-sync` sees that history and biases: cut smaller than
instinct says, don't emit an `m` task touching the worker, expect the playwright
fixture to bite.

**Recall at Design (human-attended).** Next intake's design session consults the
digest while slicing: "the only two re-slices in this repo crossed the UI/worker
seam — slice along it."

And per ADR-0007's wall: recipe-app's calibration never leaks into the-loop's or any
other project's. If you notice every project re-slices UI/worker-spanning features,
*you* tune the plugin's defaults — cross-project transfer is human-curated, never
averaged.

## Scope envelope

- **In:** deterministic capture wired into the execution pipeline (script-computed
  record + one rote scribe spawn); the record and digest artifacts under
  `docs/calibration/`; the CLI digest recompute; recall hooks at Plan (digest rides
  the execution context) and Design (the design skill consults the digest when
  slicing).
- **Out:** auto-feedback — calibration never adjusts behavior mechanically;
  recall-time judgment is an agent reading history, nothing more (ADR-0007's v1
  line). Cross-project aggregation of any kind. Capture-time interpretation (prose
  pattern-reading in records). Deep per-agent transcript forensics — that stays a
  human/offline methodology; the automated record just makes room for the numbers.
- **Later:** the founding-thesis trending ledger (charts/analysis over the
  overhead-vs-build split — the raw per-run numbers keep the door open); auto-tuned
  defaults from accumulated calibration; hook-based transcript harvesting if per-agent
  token truth ever matters enough.

## Decided

- **Capture is fully automatic, inside the execution pipeline.** No human, session,
  or agent remembers to trigger anything: if the run happened, the record exists.
  Rejected: the session writes it at the run boundary (a manual step in disguise —
  depends on the session surviving and obeying); a plugin hook harvesting harness
  state (richer token data, but coupled to harness hook semantics around background
  completion, fires on non-run sessions, lives outside the loop's machinery).
- **Script computes; scribe writes.** The record is a pure function over what the
  workflow script observed — structured data, deterministic, byte-final. The final
  spawn is a scribe, not an author: it exists only because the script has no
  filesystem (ADR-0038 — every repo-touching action is an agent's). Rote judgment
  level, cheapest bound model.
- **The scribe's marginal capacity is spent on deterministic enrichment only:**
  actual footprint + diff stats per feature (`git show --stat` on validate
  squashes), per-feature durations from commit timestamps, commit counts, the index
  line, and running the digest recompute. Capture-time *prose interpretation*
  ("auth features tend to re-slice") is refused even at zero marginal cost —
  authorship drifts, and it bakes one agent's guess into the permanent record.
  Pattern-reading is recall-time work.
- **Digest math is CLI code, not LLM arithmetic.** An LLM recomputing stats over a
  growing YAML corpus is where rote quietly becomes error-prone judgment; the digest
  recompute is a deterministic `the-loop` subcommand the scribe simply runs (the
  `worktree-create` pattern: agents invoke deterministic machinery).
- **Home and shape:** `docs/calibration/runs/<date>-<seq>.md`, one record per run —
  human-glanceable header, then the machine payload as one ```yaml block (the
  feature-graph document convention). `docs/calibration/index.md` is the recall
  surface: the CLI-recomputed digest at top (bounded one page), one-line-per-run
  index below. Records accrete uncapped (the bug-corpus precedent); the digest is
  what's bounded.
- **Recall at Plan is machine-fed:** `prepare-execution-context` splices the digest
  into the execution context — no "please read this file" agent discipline. Recall
  at Design is human-attended: the design skill consults the digest when slicing.
  The asymmetry is deliberate.
- **One capture commit per run** (not per feature), landed on the target branch by
  the scribe with the same worktree mechanics validate uses.
- **Capture runs on blocked and halted runs too, where mechanically possible** —
  failed runs are the most informative records. A workflow death before the final
  spawn loses that run's record: accepted gap, not a bug.
- **The ADR-0034 tension dissolves on inspection** — record the reasoning: the "no
  bookkeeping commits" ban targets *derivable* state (status projections,
  escalation records — things re-run rebuilds from git). Calibration observations
  are the opposite: agent counts, token totals, and wall clock live only in
  ephemeral harness state and are unrecoverable once the session ends. Evidence,
  not bookkeeping — the same footing as the bug corpus.
- **Scope is capture + explicit recall.** Capture without recall is a write-only
  database — it fails "earns its context" by construction. The trending ledger over
  the founding-thesis number is deferred; the raw numbers are captured from day one.
- **No prior-art survey.** The adjacent products (harness auto-memory,
  Cursor/Windsurf Memories, Devin's knowledge base) are agent-authored prose
  lessons — judgment-authored where we want deterministic telemetry, machine-local
  where ADR-0007 wants in-repo, session-scoped where we want run-scoped. The
  conceptual ancestors (evidence-based scheduling, agile velocity) validate the
  idea; our unit is per-project-per-workflow-path instead of per-developer. No
  shipped genre of calibration telemetry for agentic SDLC loops is known; the
  survey port stays available if Design hits something contested.

## Deferred

- **Record schema.** The exact field set and YAML shape of a run record — Design's
  call, seeded by the signal list in Done-looks-like #2.
- **Digest content.** Which tables/stats the recompute emits (re-slice rate,
  misestimate-by-size-class, agents-per-workflow-path, recurring block reasons are
  the working set) and how "bounded one page" is enforced — Design decides.
- **Overhead-vs-build mechanics.** How the script approximates the split — sampled
  `budget.spent()` deltas around phases are the known primitive; concurrency muddies
  attribution, and Design owns the honest-approximation shape.
- **Scribe spawn mechanics.** Agent type (new role vs reuse), its model-binding role
  name, and its prompt shape — Design's call under the naming law (blind
  generation for any new name).
- **CLI verb names** for the digest recompute (and any record lint) — naming law
  applies.
- **Digest-in-context conditioning.** Whether `prepare-execution-context` includes
  the digest unconditionally or only when `docs/calibration/` exists (a fresh
  project must design/plan exactly as today either way).
- **Halted-run capture mechanics.** Where in the script's halt path the capture
  spawn sits so budget-exhaustion and environment halts still record.

## Assumptions

- The workflow script can observe everything the record needs at assembly time:
  per-feature agent() call counts, workflow paths, `needs_refinement` returns,
  blocked/stalled outcomes, `budget.spent()`. (Verified against
  `workflows/execution-pipeline.js` at Define time.)
- Per-agent token usage is *not* observable from inside the workflow (agent()
  returns no usage), so the overhead-vs-build split is approximate by construction;
  the approximation is still decision-useful against the founding thesis.
- `Date.now()` stays banned in workflow scripts (resume safety), so wall clock is
  git-timestamp-derived by the scribe; commit timestamps are honest enough for
  per-feature durations.
- One rote scribe spawn per run is token noise against the runs it measures.
- The digest at one bounded page is small enough to ride every execution context
  without violating "earns its context."

## Constraints

- ADR-0007 stands: per-project, in-target-repo, capture-only v1 (no auto-feedback),
  human-glanceable, cross-project wisdom via human-tuned defaults only.
- ADR-0034's operating model stands: nothing scheduled or autonomous beyond the run
  itself; capture adds no human ceremony.
- ADR-0038's division stands: the script touches no filesystem; every repo action
  is an agent's.
- The naming law (ADR-0044): every new name (paths, CLI verbs, roles) composed from
  standard words, blind-generated, outsider-inferable.
- Plugin form: plain ESM JS, no build, node:test; digest recompute is ordinary
  `bin/the-loop.js` surface with tests.
- Records are permanent once landed (historical-record posture); the digest is
  derived and freely regenerable.

## Done looks like

1. **Capture is a side effect of running.** A run that reaches its summary ends
   with a calibration record committed to the target branch with zero human or
   session action; a run that dies before its final step is the accepted gap, not a
   bug.
2. **Records hold estimated-vs-actual.** Per feature: workflow path, planned task
   sizes/judgment levels/footprint vs actual files touched, diff stats, per-phase
   agent counts (retries included), duration, outcome; re-slice events with the
   plan's stated reason. Per run: total tokens spent, with the approximate
   loop-overhead-vs-build split — the founding-thesis number, visible on every run.
3. **The record is deterministic.** Same run observations → byte-identical record;
   every judgment-shaped interpretation is absent from capture (it happens at
   recall).
4. **The digest is bounded and derived.** One page, recomputed by deterministic CLI
   code from the record corpus — never hand-maintained, never LLM-authored; delete
   it and it recomputes identically.
5. **Plan recall is automatic.** The digest rides the execution context into plan
   agents; no "please read this file" discipline.
6. **Design recall is available.** The design skill consults the digest when
   slicing; a project with no calibration history designs exactly as today.
7. **Per-project isolation holds.** Capture and recall read and write only the
   target repo; no cross-project mixing anywhere.

## Prior art (no survey)

Surveyed from priors at Define, no research agent run (the contested architectural
ground was settled by ADR-0007; no shipped genre of calibration telemetry for
agentic SDLC loops is known to exist):

- **Harness auto-memory / editor Memories (Claude Code, Cursor, Windsurf):**
  rejected as the mechanism — agent-authored prose, machine-local, uncommitted,
  session-scoped; wrong on all three axes vs deterministic, in-repo, run-scoped
  telemetry.
- **Devin-style agent knowledge bases / Reflexion-style self-improvement:**
  prose-memory again, and their auto-feedback half is exactly what ADR-0007
  deferred.
- **Evidence-based scheduling (Spolsky) and agile velocity:** the validated
  conceptual ancestors — estimate-vs-actual distributions per estimator; our
  estimator unit is per-project-per-workflow-path instead of per-developer.
