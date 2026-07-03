# Ledger — the-loop   ·   projected from design.md (feature graph) · established at Design finalize, 2026-06-29

## What this is
the-loop: an owned, composable agentic dev loop built from native Claude Code primitives, shipped as a plugin. It moves an idea through the full SDLC and — by design — its first job is to build itself. Full design in [design.md](../design/design.md); the *why* of every choice in [the ADRs](../adr/).

## Where we are
Total: 25 (design_version 5)

- designed: 14
- planned: 0
- building: 4
- validated: 7
- shipped: 0
- parked: 0
- drifted: 0

## What needs you
Nothing parked — no open escalations.

## What's next
`frame`, `plan`, `model-selection`, `workflow-phase-grouping`, `surfacing`, `system-map`, `worktree-parallelism`, `configure-step-full`, `research-tiers`

## Run history
**2026-07-03 · run wf_f1c42418-2a0 — model-selection** (11 agents, ~83 min, ~1.04M subagent tokens): Plan cut 8 tasks → all eight built with per-task fold-ins → derive → validate → **parked at validate** on the one acceptance-leg finding above; every booking self-made in-run, tree left clean, HEAD on main. **Model bindings were hand-rolled for this run** (human-directed accommodation: this very run built the bindings infra, so it could not read it) via a session-only, never-committed fork of `workflows/inner-loop.js` applying the ADR-0030 default table — transcript-verified: plan on fable (session inherit), build ×8 + validate on sonnet, derive on opus@low — declared by a `log()` line at run start. Side findings: workflow `agent()` `opts.model` is empirically honored (the run itself supplies the t1 probe's missing observation and falsifies t1's introspective no-opt-sent claim — its own transcript shows sonnet); the opts-vs-present-frontmatter conflict pair stays untested and inert (no plugin agent carries model frontmatter); the `budget` global again returned `{}` (live shape still unconfirmed).

**2026-07-03 · run wf_a240ff37-200 — ledger-title-preservation** (4 agents): the first fully self-hosted feature — Build(t1,t2 with fold-ins) → Derive → Validate → perfect → squash-merge + booking, zero hand-touches mid-run; the validator's own post-merge ledger render restored the very title line the feature fixed.

Pre-run hand-maintenance era (per the since-retired CLAUDE.md rule for loop-made commits); last hand-render 2026-07-03 (model-selection design finalized by grilling — ADR-0030 per-role bindings/decision-density strata + ADR-0031 delegated-executor registry (multi-CLI via executor playbooks, grok first); executor-delegation split out as its own designed node; design_version 4→5: task-contract gains tier, model-binding contract added; earlier same day: inner-loop-workflow building — task t7 landed: `agents/build.md` gained the mechanical per-task booking protocol (fold the completion report, flip the feature's first task planned→building, typed blocked returns, crash healing), and this booking is that very flip's first real trigger; hand-mirrored rather than run for real because `spine set-status`/`spine ledger render` (t1/t4/t5) live only on the feature branch until Validate's squash-merge; earlier 2026-07-02: inner-loop-workflow planned — ADR-0029 run mechanics + a 14-task plan cut by dogfooding the Plan agent live; earlier same day: validate building, per the ADR-0028 protocol: the blind deriver (`agents/derive.md`) and independent validator (`agents/validate.md`) landed, with the forensics scanner (`spine validate scan` — seven tripwires + patch-id dedup over the feature branch's diff) and the fixture-repo probe (`bin/probe-fixture.js`); verdicts will persist at `docs/validations/`, pinned exercises at `docs/probes/`; validates on the first real feature run through readiness + the four legs).
