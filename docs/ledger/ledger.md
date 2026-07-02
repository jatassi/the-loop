# Ledger — the-loop   ·   projected from design.md (feature graph) · established at Design finalize, 2026-06-29

## What this is
the-loop: an owned, composable agentic dev loop built from native Claude Code primitives, shipped as a plugin. It moves an idea through the full SDLC and — by design — its first job is to build itself. Full design in [design.md](../design/design.md); the *why* of every choice in [the ADRs](../adr/).

## Where we are
**Building the walking skeleton (hand-built until self-hosting).** The skeleton is now **13 features** (ADR-0023 pulled the System Map + brownfield comprehension inside it; ADR-0027 added the craft bundle, so every self-hosted build happens under the craft regime); 8 remain deferred, built by self-hosting.

- ✓ 2 / 21 — `validated` (`artifact-spine`, `the-loop-entry` — hand-built; tests + `npm run check` green)
- ◐ 4 / 21 — `building` (`frame`, `design` — both skills landed, one real Frame → Design run validates both; `plan` — agent + plan-artifact toolkit landed, validates on its first live decomposition; `build` — task agent + task-slice/report toolkit landed, validates on its first real task execution)
- ○ 15 / 21 — `designed`
- ▶ Next milestone — **the walking skeleton (v1.0)**: the thinnest end-to-end greenfield engine, plus brownfield comprehension of its own repo, reaching self-hosting.

## What needs you
Nothing parked — no open escalations. Feature-scoped design actions from the 2026-07-01 review are baked into their feature-graph nodes as `notes` (they travel with the injected slice when each feature is designed); the two standing process actions live in [actions.md](../actions/actions.md).

## What's next
Continue the skeleton in dependency order (`artifact-spine`, `the-loop-entry` ✓ done):

`frame` ◐ · `design` ◐ (validate both with one real Frame → Design run) · `plan` ◐ (validate with a live decomposition of a real feature) · `build` ◐ (validate by building a planned feature's tasks into a single merged diff) · `craft-baseline` · `system-map` · `validate` → `inner-loop-workflow` → `surfacing` → `ship` · `brownfield-comprehension`.

The moment that path is green end-to-end, **stop hand-building and self-host** — feed the 8 deferred features (worktree parallelism, Evolve + severity tiering, Operate, calibration capture, full configure step, full ports/adapters, research tiers) through the-loop as its own intakes. From then on, hand-building only as a recorded escalation decision (see actions.md).

## Run history
None yet — the loop hasn't run itself. Hand-maintained per the CLAUDE.md rule (same-commit graph + ledger updates) until self-hosting; last hand-render 2026-07-02 (craft bundle designed into the graph: ADR-0027 — two-layer craft baseline as a port, build constitution always-injected, per-task `standards:` selection on the task contract (design_version → 2), Design's project-standards nudge, Validate's two-axis conformance with one bounded remediation round; new skeleton feature `craft-baseline`, hand-built before self-hosting).
