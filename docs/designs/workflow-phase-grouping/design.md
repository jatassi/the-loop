# workflow-phase-grouping — progress groups by SDLC phase

**Status:** shipped (2026-07-04, the last v1-built feature; carried forward into
the v2 workflow).

## What it is

The `/workflows` progress tree groups spawns by SDLC phase, not by feature: every
spawn's `opts.phase` is its phase name — plan → `Plan`; build and drive → `Build`;
validate → `Validate` — and `meta` declares `phases: [{title: 'Plan'}, {title:
'Build'}, {title: 'Validate'}]` as title-only entries in that order, on meta's
single physical line (the eslint preprocessor and the shim regex pin one-line meta).

Labels carry the per-spawn detail; the phase box (not the label) is the
agentType disambiguator, so labels carry no phase/agentType prefix (amended by
run-presentation): plan and validate → `feature-id`; build → `feature-id/task-id`;
drive → `feature-id/task-id via executor`. In multi-feature scopes the phase boxes
pool across features — the accepted trade of the phase-first view.

Probe-confirmed harness behavior (2026-07-04, wf_e7b31dd9-38a): declared meta.phases
order beats first-use order for box ordering; same phase string → same box.

The run summary's `stalled` entries carry `agent` (the spawned agentType) —
deliberately finer-grained than the coarse phase opt (drive vs build is the
diagnostic that matters).
