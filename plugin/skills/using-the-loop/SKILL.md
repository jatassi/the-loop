---
name: using-the-loop
description: Orient in a project run with the-loop. Use when starting a new feature or idea, fixing a reported bug, preparing a release, or deciding what to build next; before creating, editing, or deleting the loop-owned `docs/` artifacts (`feature-graph.json`, `briefs/`, `designs/`, `bugs/`, …); or when asking how this project is set up, organized, or developed.
---

# Using the-loop

## What this project runs, and what the loop owns

This project is developed with the-loop, which moves ideas through
define → design → build → validate → release (bugs enter via diagnose; deployed
instances are operated via operate). That is the full phase model here.

The loop owns project state under `docs/`. Treat every path below as loop-owned:

| Path | What it is |
|---|---|
| `docs/feature-graph.json` | the machine feature graph — tool-owned JSON, never hand-edit; read via `the-loop list`, statuses via the loop |
| `docs/architecture.md` | system narrative + recorded bindings (validation, release, operations) |
| `docs/briefs/` | Define outputs — one brief per intake |
| `docs/designs/<id>/design.md` | one design doc per feature |
| `docs/glossary.md` | pinned project vocabulary |
| `docs/adr/` | architectural decision records |
| `docs/bugs/` | RCA docs from diagnose |
| `docs/runbooks/<topic>.md` | operational runbooks |
| `docs/validation/` · `docs/releases/` · `docs/calibration/` · `docs/adapters/` | validation procedures, release reports, run calibration, bound-store adapters |

`docs/feature-graph.json` is written only by the loop's own tooling and must never
be hand-edited. The prose artifacts are amended only through their owning phases —
don't casually rewrite, rename, or delete any of these paths, and don't "clean up"
paths that look stale.

## Engaging the loop

`/begin` is the single entry point: it states where the project stands and proposes
the next action; `/begin <phase>` jumps straight to a phase.

## Live state and deeper tiers

Live state comes from the CLI, not from prose that can go stale:

- `the-loop status` (`--json` for machine orientation)
- `the-loop list` (the parsed graph)
- `the-loop hooks-list` (the resolved configuration)
- `the-loop models-list` (role → model bindings)

The project's story lives in its own artifacts: `docs/architecture.md` for the
system narrative, `docs/designs/<id>/design.md` for any feature's design,
`docs/glossary.md` for vocabulary, and git log for history. Deeper engagement is
`/begin`.
