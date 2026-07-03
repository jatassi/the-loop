## What this is
the-loop: an owned, composable agentic dev loop built from native Claude Code primitives, shipped as a plugin. It moves an idea through the full SDLC and — by design — its first job is to build itself. Full design in [design.md](../design/design.md); the *why* of every choice in [the ADRs](../adr/).

## Where we are
Total: 22 (design_version 4)

- designed: 12
- planned: 0
- building: 4
- validated: 6
- shipped: 0
- parked: 0
- drifted: 0

## What needs you
Nothing parked — no open escalations.

## What's next
`frame`, `plan`, `ledger-title-preservation`, `surfacing`, `system-map`, `worktree-parallelism`, `configure-step-full`, `research-tiers`

## Run history
None yet — the loop hasn't run itself. Hand-maintained per the CLAUDE.md rule (same-commit graph + ledger updates) until self-hosting; last hand-render 2026-07-03 (inner-loop-workflow building — task t7 landed: `agents/build.md` gained the mechanical per-task booking protocol (fold the completion report, flip the feature's first task planned→building, typed blocked returns, crash healing), and this booking is that very flip's first real trigger; hand-mirrored rather than run for real because `spine set-status`/`spine ledger render` (t1/t4/t5) live only on the feature branch until Validate's squash-merge; earlier 2026-07-02: inner-loop-workflow planned — ADR-0029 run mechanics + a 14-task plan cut by dogfooding the Plan agent live; earlier same day: validate building, per the ADR-0028 protocol: the blind deriver (`agents/derive.md`) and independent validator (`agents/validate.md`) landed, with the forensics scanner (`spine validate scan` — seven tripwires + patch-id dedup over the feature branch's diff) and the fixture-repo probe (`bin/probe-fixture.js`); verdicts will persist at `docs/validations/`, pinned exercises at `docs/probes/`; validates on the first real feature run through readiness + the four legs).
