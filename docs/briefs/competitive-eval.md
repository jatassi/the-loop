# Brief — competitive-eval

Head-to-head evaluation of the-loop against comparable agentic dev tooling on the
same Claude Code substrate. Extends the existing `eval/` harness (the ADR-0030
model bakeoff) from an intra-loop question — *which model to bind* — to an
inter-tool question — *does the loop itself earn its context against
alternatives, and where*.

## Intent

Measure whether the-loop's structure pays for itself: quality, cost, speed, and
supporting dimensions, compared head-to-head against running the same model bare
and against rival workflow frameworks. This is an internal, decision-grade eval —
results feed ADRs and refactors (which phases earn their context, which are pure
overhead). A defensible external claim is a welcome byproduct, not the goal.

## Users

The maintainer. Results are consumed by the-loop's own design process.

## Scope envelope

Feature-sized: a new eval leg built on the existing `eval/` harness — new
competitor runners, new neutral fixtures, new feature-sized units, an extended
rubric. Explicitly out of scope:

- Publication-grade / public-benchmark rigor (released harness, external
  reproducibility, contamination audits beyond the fairness rules below).
- Cross-substrate competitors (Codex CLI, Aider, Cursor, OpenHands) — deltas
  would conflate model and harness; excluded from this intake entirely.
- Release/Operate phases (no rival covers them; scored *not attempted*).
- Real human-in-the-loop comparisons — every run is headless, zero human
  touches. Interactive machinery is exercised only via the simulated
  stakeholder of the elicitation leg, never a live human.

Noted for later intakes: a project-sized greenfield capstone unit; third-party
OSS repos as fixtures; an effort sweep (structure vs. compute tradeoff).

## The organizing framework (decided)

Five decisions in dependency order, each constraining the next:

1. **Claim** — the decision the eval feeds (sets rigor bar and competitor set).
2. **Unit of comparison & fairness model** — what sits on each side of "vs";
   substrate held constant; symmetric scaffolding rules.
3. **Task portfolio** — sizes, fixtures, contamination policy.
4. **Measurement & scoring** — dimensions, operationalization, aggregation.
5. **Protocol & validity** — reps, staging, pre-registration, budget.

## Decided

- **Claim (layer 1): sharpen the product.** Internal decision-grade; the
  headline question is "does the loop's overhead pay for itself, and which
  phases earn their context."
- **Competitor set (layer 2): all same-substrate.** Three tiers, every delta
  attributable to the workflow layer:
  - *Bare Claude Code ladder* — (a) one-shot prompt, (b) prompt with plan-mode
    first. The indispensable control; measures the loop's raw delta.
  - *the-loop* — the full pipeline from brief to validated code.
  - *Two rival Claude Code workflow frameworks* — **GitHub Spec Kit** and
    **BMAD-Method**, confirmed by a cited landscape survey
    (`docs/research/2026-07-19-cc-workflow-frameworks-survey.md`). Spec Kit
    maximizes recognizability
    (GitHub-official, ~122k stars, near-daily releases, headless-realistic
    with one avoidable checklist gate); BMAD is the only rival with
    methodology ambition matching the-loop's, newly headless via
    `bmad-dev-auto` + the deterministic `bmad-loop` orchestrator. They are
    also a useful contrast pair: artifact-pipeline philosophy vs.
    persona/ceremony philosophy, with the-loop between them. **OpenSpec** is
    the designated alternate if a pick fails the headless bar in practice.
    Answers "is this structure better than other structure," not just
    "better than none."
- **Models × efforts (layer 2): {Sonnet 5, Opus 4.8, Fable 5} × default
  effort.** Three capability points give a curve for whether the loop's delta
  grows or shrinks with model strength, including the frontier anchor. No
  effort sweep in this intake.
- **Fairness rules (layer 2):** same model per matrix row for every competitor;
  same wall-clock and turn caps; fully headless with scripted auto-approval —
  a tool that cannot run headless is disqualified from the matrix, not
  hand-held. Each tool runs its own init/scaffold on the fixture before the
  unit; init cost is measured but reported separately (it amortizes over a
  real project's life). Phases a tool does not claim (no surveyed rival
  covers release/operate) are scored *not attempted*, never zero — the
  rubric must not look rigged toward the-loop's wider lifecycle.
- **Task portfolio (layer 3): size ladder on neutral fixtures.**
  - *Task-sized units* (small end) and *feature-sized units* (brief → designed
    → built → validated) — the delta-vs-scope curve is the primary instrument:
    where structure starts paying off, and where it is pure overhead. The
    small end is deliberately kept because it is where the loop most plausibly
    loses.
  - All units authored on *neutral fixture repos* (`bin/create-sample-repo.js`
    as the generator base) — not the-loop's own history, which is home-field
    (its graph, designs, and conventions saturate the tree). The existing
    the-loop-history units are not reused for cross-tool scoring.
  - Every ladder unit starts from a written brief and ends at committed,
    validated code.
- **Elicitation leg (layer 3): simulated-stakeholder scenarios, spike-gated.**
  A distinct leg beside the size ladder that exercises each tool's
  *interactive* machinery (the-loop's Define interview, BMAD's elicitation,
  Spec Kit's `/speckit.clarify`). Each scenario is authored as a deliberately
  underspecified *surface brief* (what the tool sees) plus a *hidden intent
  doc* held by a user-simulator agent under strict rules: answer only what is
  directly asked, consistently with the hidden intent, never volunteer,
  bounded verbosity. Planted ambiguities are keyed to hidden oracles — the
  surface brief leaves behavior X unresolved, the hidden intent resolves it,
  an oracle tests the resolved behavior — so elicitation quality manifests as
  behavioral quality and grading stays mechanical. 2–3 scenarios in this
  intake. The simulator model and persona spec are fixed across all
  competitors and pre-registered. A per-tool feasibility spike (can its
  interactive surface be piped to the simulator?) gates entry; a tool that
  can't be piped scores *not attempted* on this leg. This leg also resolves
  the BMAD planning-leg fairness question — the simulator replaces ad-hoc
  canned answers — and brings Define into scope.
- **Measurement (layer 4): five scored dimensions, all mechanical, plus one
  advisory.**
  - *Quality* — behavioral grading as in the existing harness: full suite,
    lint, footprint diff, hidden oracles; never diff-equality.
  - *Cost* — dollars from the usage envelope (`cost_basis: reported`; all
    competitors are Claude-Code-based so reported cost is uniform).
  - *Speed* — wall-clock per unit.
  - *Reliability* — variance across reps: pass-rate consistency and cost
    spread. Requires ≥3 reps in scored rows.
  - *Honesty* — self-reported outcome vs. `verify.js` ground truth (the
    ADR-0031 failure mode) plus trap-unit violations.
  - *Artifact value* (advisory appendix, judge-graded) — quality of what is
    left behind beyond working code: tests, docs, design records. The loop's
    differentiator, but subjective, so it informs and never gates.
  - *Aggregation:* cost–quality Pareto frontier as the headline; speed and
    reliability as secondary tables; no single composite score.
- **Protocol (layer 5): staged rollout, pre-registered.**
  - Rubric and expansion criteria locked before Stage 1 (as with the model
    bakeoff, results feed an ADR — no ad-hoc peeking).
  - *Stage 1:* selfcheck + 1 rep, Sonnet only, all competitors, ~2 task +
    1 feature unit — shakes out runner bugs, calibrates real per-cell cost.
    Includes the elicitation-leg feasibility spikes (one scenario, each
    tool's interactive surface piped to the simulator).
  - *Stage 2:* full Sonnet row, 3 reps.
  - *Stage 3:* expand to Opus and Fable rows where Stage 2 shows signal, per
    the pre-registered expansion criteria.
  - Existing harness machinery is inherited: resumability, canary-leak
    scanning, transcript/diff retention, `verify.js` as sole source of truth.

## Deferred (to Design)

- **BMAD's planning leg on the ladder** — for *ladder* units (which start
  from a written brief), BMAD's interactive planning workflows still need a
  policy: pre-seed planning artifacts or start its leg at stories. (On the
  elicitation leg the simulator handles this by design.)
- **Simulator spec** — the user-simulator's model, persona template, answer
  rules, and refusal behavior (what it does when asked something the hidden
  intent doesn't cover); plus the per-tool piping spike design (PTY vs.
  programmatic driving) and its pass/fail bar.
- **Unit inventory** — exact count and content of task-sized and feature-sized
  units, and the neutral fixture repos' shape (language, test stack, size).
- **Headless drivers** — per-tool mechanics for scripted end-to-end runs
  (auto-approval strategy, entry commands, how the bare-CC plan-mode rung is
  scripted), and the disqualification procedure for tools that can't comply.
  Known specifics from the survey: Spec Kit's `/speckit.implement` checklist
  gate is avoidable (skip `/speckit.checklist` or complete checklists
  programmatically); BMAD runs via `bmad-loop init --cli claude; bmad-loop
  run`; both install per-repo via CLI (`specify init --integration claude`,
  `npx bmad-method install --yes --modules bmm --tools claude-code`,
  version-pinned).
- **Caps** — per-size wall-clock and turn limits (task-sized inherits 2400 s;
  feature-sized needs its own cap).
- **Reliability metric form** — exact statistic (pass@3 vs. variance bands) and
  how it enters the rubric.
- **Artifact-value judging** — judge prompt, blinding, and scale for the
  advisory appendix.
- **Pre-registered rubric text** — thresholds and expansion criteria for the
  staged rollout (must be written and committed before Stage 1 runs).

## Assumptions

- The rivals' documented headless modes (Spec Kit's guess-don't-ask spec
  rules and skippable gates; BMAD's `bmad-dev-auto`/`bmad-loop`) work in
  practice end-to-end — the survey verified they exist and are documented,
  but nobody has exercised them here yet. OpenSpec stands by as alternate.
- The existing `eval/` harness (runner, verify, summarize, canary scan)
  extends to competitor runners without structural rework.
- Neutral fixtures generated from `bin/create-sample-repo.js` are rich enough
  to host feature-sized work that differentiates the tools.
- Stage-1 calibration will land per-cell costs near the back-of-envelope
  estimate (full matrix plausibly $3–6k; staging exists to correct this
  early).
- Three reps are enough for a decision-grade (not publication-grade)
  reliability signal.
- An LLM user-simulator with a fixed persona and strict answer-only rules is
  a valid stand-in for a human stakeholder for *comparative* purposes — all
  tools face the same simulator, so simulator bias is shared, though absolute
  elicitation quality is not claimed. The extra stochastic actor raises
  variance; reps matter more on this leg.

## Constraints

- Every competitor runs on the Claude Code substrate; models fixed to
  {Sonnet 5, Opus 4.8, Fable 5} at default effort.
- Fully headless; zero human interventions mid-run.
- Budget is staged with explicit go/no-go gates between stages; no single
  unstaged spend.
- Builds on the existing `eval/` directory and its conventions (manifests,
  oracles, kernels, canary phrases); grading stays behavioral.

## Done looks like

- A re-runnable eval leg exists that, for each cell (competitor × model ×
  unit × rep), records quality, cost, speed, and honesty mechanically, with
  zero human touches per run.
- The delta-vs-scope curve is producible: for each competitor and model, a
  quality/cost/speed comparison at task size and at feature size.
- The elicitation leg produces, per tool, a mechanical pass rate on
  planted-ambiguity oracles (or an honest *not attempted* where piping
  failed the spike), with simulator transcripts retained.
- A cost–quality Pareto frontier per model row, with reliability and speed
  tables, generated by the summarizer from recorded rows — no hand-assembled
  numbers.
- The rubric and staging criteria were committed before Stage 1 data was
  collected, and the run history shows the stages executed in order.
- Results are written up as an ADR answering: where does the loop earn its
  context, where is it overhead, and against which alternatives — with at
  least one concrete sharpening action identified or explicitly ruled out.
