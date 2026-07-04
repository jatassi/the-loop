# Ledger — the-loop   ·   projected from design.md (feature graph) · established at Design finalize, 2026-06-29

## What this is
the-loop: an owned, composable agentic dev loop built from native Claude Code primitives, shipped as a plugin. It moves an idea through the full SDLC and — by design — its first job is to build itself. Full design in [design.md](../design/design.md); the *why* of every choice in [the ADRs](../adr/).

## Where we are
Total: 25 (design_version 8)

- designed: 11
- planned: 0
- building: 3
- validated: 0
- shipped: 11
- parked: 0
- drifted: 0

## What needs you
Nothing parked — no open escalations.

## What's next
`frame`, `plan`, `workflow-phase-grouping`, `system-map`, `worktree-parallelism`, `configure-step-full`, `research-tiers`

## Run history
- 2026-07-04 | ship-1 | deployed | features: artifact-spine, the-loop-entry, build, craft-baseline, validate, inner-loop-workflow, ledger-title-preservation, model-selection, executor-delegation, surfacing, ship
- 2026-07-04 | wf_bcf2df42-2a7 | completed: ship
- 2026-07-03 | wf_cf833be4-9b0 | stalled: ship
- 2026-07-04 | wf_74be8a1f-77f | completed: executor-delegation
- 2026-07-03 | wf_dfcca65b-283 | parked: executor-delegation
- 2026-07-03 | wf_1c210607-7f2 | halted: environment-blocked — Build entry found the tree dirty — untracked directory 1bddab65-fc91-4f88-8117-969eadb754f6/ (a concurrent session's executor-delegation e2e debris: scratchpad/e2e-target/.claude/worktrees/drive-widget-t1.prompt.md); the build agent stopped before touching branch, plan, or code and cleaned nothing. Ship was planned and booked in-run (1bede8d, 605e3f6) before the halt
- 2026-07-03 | wf_2d4c3940-0e0 | completed: surfacing | budget: undefined/undefined
**2026-07-03 · runs wf_81a89a5d / wf_16bdf774 / wf_97851563 / wf_9efd8be6 — model-selection, passes 2–5 to validated** — the fix-in-place cycle after the pass-1 park: pass 2 halted on a dirty tree (an uncommitted session dictionary edit — clean-tree gate save #1), pass 3 halted on the harness's own agent worktree at .claude/worktrees/ (save #2; now gitignored), pass 4 ran all four legs to a would-be-PERFECT verdict blocked only by a concurrent session's worktree holding main, pass 5 parked on surfacing's design_version bump breaking the test pin (delta-proved unrelated to this diff; fixed as main-side maintenance), and pass 6 hit the patch-id dedup rule against the stale deviation entry — surfacing's retry-despite-dedup criterion (ADR-0032) observed live before the feature is built. Resolved by the recorded human-merge in docs/validations/model-selection.md; squash 37af221, booked validated. The hand-rolled binding fork is retired: workflows/inner-loop.js on main now reads args.models for real. Also landed post-merge: the halted.detail reconciliation fix (54f98f2, Opus subagent in an isolated worktree, session-reviewed).

**2026-07-03 · run wf_f1c42418-2a0 — model-selection** (11 agents, ~83 min, ~1.04M subagent tokens): Plan cut 8 tasks → all eight built with per-task fold-ins → derive → validate → **parked at validate** on the one acceptance-leg finding above; every booking self-made in-run, tree left clean, HEAD on main. **Model bindings were hand-rolled for this run** (human-directed accommodation: this very run built the bindings infra, so it could not read it) via a session-only, never-committed fork of `workflows/inner-loop.js` applying the ADR-0030 default table — transcript-verified: plan on fable (session inherit), build ×8 + validate on sonnet, derive on opus@low — declared by a `log()` line at run start. Side findings: workflow `agent()` `opts.model` is empirically honored (the run itself supplies the t1 probe's missing observation and falsifies t1's introspective no-opt-sent claim — its own transcript shows sonnet); the opts-vs-present-frontmatter conflict pair stays untested and inert (no plugin agent carries model frontmatter); the `budget` global again returned `{}` (live shape still unconfirmed).

**2026-07-03 · run wf_a240ff37-200 — ledger-title-preservation** (4 agents): the first fully self-hosted feature — Build(t1,t2 with fold-ins) → Derive → Validate → perfect → squash-merge + booking, zero hand-touches mid-run; the validator's own post-merge ledger render restored the very title line the feature fixed.

Pre-run hand-maintenance era (per the since-retired CLAUDE.md rule for loop-made commits); last hand-render 2026-07-03 (surfacing design finalized by grilling — ADR-0032: the adjust skill realizes Adjust; typed resolution kinds (retry | fix-in-place | re-plan | waive | defer) with pre-steps attaching content; the resolution toolkit (spine escalation resolve / plan fix / note / validate waive / ledger append-run); the retried mark makes retry survive patch-id dedup and closes the deviation-crash healing gap; waiver expiry retired; design_version 5→6 — escalation-record menu gains resolution kinds, validator-verdict gains retried and drops waiver expiry, task-contract documents marker tasks; earlier same day: model-selection design finalized by grilling — ADR-0030 per-role bindings/decision-density strata + ADR-0031 delegated-executor registry (multi-CLI via executor playbooks, grok first); executor-delegation split out as its own designed node; design_version 4→5: task-contract gains tier, model-binding contract added; earlier same day: inner-loop-workflow building — task t7 landed: `agents/build.md` gained the mechanical per-task booking protocol (fold the completion report, flip the feature's first task planned→building, typed blocked returns, crash healing), and this booking is that very flip's first real trigger; hand-mirrored rather than run for real because `spine set-status`/`spine ledger render` (t1/t4/t5) live only on the feature branch until Validate's squash-merge; earlier 2026-07-02: inner-loop-workflow planned — ADR-0029 run mechanics + a 14-task plan cut by dogfooding the Plan agent live; earlier same day: validate building, per the ADR-0028 protocol: the blind deriver (`agents/derive.md`) and independent validator (`agents/validate.md`) landed, with the forensics scanner (`spine validate scan` — seven tripwires + patch-id dedup over the feature branch's diff) and the fixture-repo probe (`bin/probe-fixture.js`); verdicts will persist at `docs/validations/`, pinned exercises at `docs/probes/`; validates on the first real feature run through readiness + the four legs).
