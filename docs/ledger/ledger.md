# Ledger — the-loop   ·   projected from design.md (feature graph) · established at Design finalize, 2026-06-29

## What this is
the-loop: an owned, composable agentic dev loop built from native Claude Code primitives, shipped as a plugin. It moves an idea through the full SDLC and — by design — its first job is to build itself. Full design in [design.md](../design/design.md); the *why* of every choice in [the ADRs](../adr/).

## Where we are
**Building the walking skeleton (hand-built until self-hosting).** The skeleton is now **13 features** (ADR-0023 pulled the System Map + brownfield comprehension inside it; ADR-0027 added the craft bundle, so every self-hosted build happens under the craft regime); 8 remain deferred, built by self-hosting.

- ✓ 2 / 21 — `validated` (`artifact-spine`, `the-loop-entry` — hand-built; tests + `npm run check` green)
- ◐ 7 / 21 — `building` (`frame`, `design` — both skills landed, one real Frame → Design run validates both; `plan` — agent + plan-artifact toolkit landed, validates on its first live decomposition; `build` — task agent + task-slice/report toolkit landed, validates on its first real task execution; `craft-baseline` — pack + per-task standards machinery landed, validates on its first standards-selected build; `validate` — blind deriver + validator agents, forensics scanner, fixture-repo probe landed; its first real four-leg run executed 2026-07-03; `inner-loop-workflow` — first validation returned deviation, human chose fix-in-place: t15 covers both findings, then re-validate; [verdict record](../validations/inner-loop-workflow.md))
- ○ 12 / 21 — `designed`
- ▶ Next milestone — **the walking skeleton (v1.0)**: the thinnest end-to-end greenfield engine, plus brownfield comprehension of its own repo, reaching self-hosting.

## What needs you
Nothing parked — the 2026-07-03 escalation on `inner-loop-workflow` was resolved fix-in-place (escalation record deleted per the resolution rule; git history is its archive). Feature-scoped design actions from the 2026-07-01 review are baked into their feature-graph nodes as `notes`; the two standing process actions live in [actions.md](../actions/actions.md).

## What's next
Continue the skeleton in dependency order (`artifact-spine`, `the-loop-entry` ✓ done):

`frame` ◐ · `design` ◐ (validate both with one real Frame → Design run) · `plan` ◐ (validate with a live decomposition of a real feature) · `build` ◐ (validate by building a planned feature's tasks into a single merged diff) · `craft-baseline` ◐ (validate on the first live plan that selects standards) · `validate` ◐ (validate by running a real built feature through readiness + the four legs) · `inner-loop-workflow` ◐ (fix-in-place — build t15, then re-validate; a perfect verdict squash-merges and lands the booking toolkit on `main`) · `system-map` → `surfacing` → `ship` · `brownfield-comprehension`.

The moment that path is green end-to-end, **stop hand-building and self-host** — feed the 8 deferred features (worktree parallelism, Evolve + severity tiering, Operate, calibration capture, full configure step, full ports/adapters, research tiers) through the-loop as its own intakes. From then on, hand-building only as a recorded escalation decision (see actions.md).

## Run history
None yet — the loop hasn't run itself. Hand-maintained per the CLAUDE.md rule (same-commit graph + ledger updates) until self-hosting; last hand-render 2026-07-03 (inner-loop-workflow building — task t7 landed: `agents/build.md` gained the mechanical per-task booking protocol (fold the completion report, flip the feature's first task planned→building, typed blocked returns, crash healing), and this booking is that very flip's first real trigger; hand-mirrored rather than run for real because `spine set-status`/`spine ledger render` (t1/t4/t5) live only on the feature branch until Validate's squash-merge; earlier 2026-07-02: inner-loop-workflow planned — ADR-0029 run mechanics + a 14-task plan cut by dogfooding the Plan agent live; earlier same day: validate building, per the ADR-0028 protocol: the blind deriver (`agents/derive.md`) and independent validator (`agents/validate.md`) landed, with the forensics scanner (`spine validate scan` — seven tripwires + patch-id dedup over the feature branch's diff) and the fixture-repo probe (`bin/probe-fixture.js`); verdicts will persist at `docs/validations/`, pinned exercises at `docs/probes/`; validates on the first real feature run through readiness + the four legs).
