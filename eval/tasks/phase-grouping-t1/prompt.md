feature: workflow-phase-grouping · task: phases — SDLC phase opts + meta.phases declaration
commit subject: "workflow-phase-grouping/phases: SDLC phase opts + meta.phases declaration"

Workflow progress should group by SDLC phase (Plan | Build | Validate), not by feature.
Today each spawn's `phase` opt carries the feature id (grouping the /workflows tree per
feature); it should carry the SDLC phase name instead, while the feature id and resolved
model keep riding the spawn label.

task acceptance (each criterion gets a red-then-green test):
1. every workflow spawn's phase opt names its SDLC phase (build and drive spawns Build, derive and validate spawns Validate, plan spawns Plan), with the feature id and resolved model riding the label
2. meta declares phases as three title-only entries in Plan, Build, Validate order on its single physical line, pinned by a source-shape test that extracts and evaluates the meta line

footprint (the lease — stay inside it): workflows/inner-loop.js, test/inner-loop-happy.test.js, test/inner-loop-drive.test.js, test/inner-loop-halt.test.js, test/inner-loop-park.test.js, test/inner-loop-remediation.test.js, test/inner-loop-meta.test.js
wiring: each spawn's opts.phase currently holds the feature id — set it to the SDLC phase (plan→Plan, build & drive→Build, derive & validate→Validate). meta stays on one physical line (the eslint preprocessor and the test shim's regex both pin it there); add `phases: [{ title: 'Plan' }, { title: 'Build' }, { title: 'Validate' }]` to it.

Fetch more only if needed:
- feature design doc: docs/design/design.md
- system design (architecture, cross-feature contracts): docs/design/design.md
