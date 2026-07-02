# Ledger — the-loop   ·   projected from design.md (feature graph) · established at Design finalize, 2026-06-29

## What this is
the-loop: an owned, composable agentic dev loop built from native Claude Code primitives, shipped as a plugin. It moves an idea through the full SDLC and — by design — its first job is to build itself. Full design in [design.md](../design/design.md); the *why* of every choice in [the ADRs](../adr/).

## Where we are
**Building the walking skeleton (hand-built until self-hosting).** The skeleton is now **12 features** (ADR-0023 pulled the System Map + brownfield comprehension inside it, so the engine can dogfood its own repo); 8 remain deferred, built by self-hosting.

- ✓ 2 / 20 — `validated` (`artifact-spine`, `the-loop-entry` — hand-built; tests + `npm run check` green)
- ◐ 2 / 20 — `building` (`frame`, `design` — both skills landed; each validates on its first live session, one real Frame → Design run covers both)
- ○ 16 / 20 — `designed`
- ▶ Next milestone — **the walking skeleton (v1.0)**: the thinnest end-to-end greenfield engine, plus brownfield comprehension of its own repo, reaching self-hosting.

## What needs you
Nothing parked — no open escalations. Feature-scoped design actions from the 2026-07-01 review are baked into their feature-graph nodes as `notes` (they travel with the injected slice when each feature is designed); the two standing process actions live in [actions.md](../actions/actions.md).

## What's next
Continue the skeleton in dependency order (`artifact-spine`, `the-loop-entry` ✓ done):

`frame` ◐ · `design` ◐ (validate both with one real Frame → Design run) · `plan` · `system-map` · `build` → `validate` → `inner-loop-workflow` → `surfacing` → `ship` · `brownfield-comprehension`.

The moment that path is green end-to-end, **stop hand-building and self-host** — feed the 8 deferred features (worktree parallelism, Evolve + severity tiering, Operate, calibration capture, full configure step, full ports/adapters, research tiers) through the-loop as its own intakes. From then on, hand-building only as a recorded escalation decision (see actions.md).

## Run history
None yet — the loop hasn't run itself. Hand-maintained per the CLAUDE.md rule (same-commit graph + ledger updates) until self-hosting; last hand-render 2026-07-01 (design building: `skills/design/SKILL.md` — Brief → design.md + feature graph, with the Ledger and Dictionary born at finalize; validated by `spine check`'s hard gate plus a live session, the same Frame → Design run that validates `frame`).
