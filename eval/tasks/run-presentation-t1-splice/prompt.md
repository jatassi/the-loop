feature: run-presentation · task: splice — scope-derived workflow description via prepare-execution-context --script-out
commit subject: "run-presentation/splice: scope-derived workflow description via prepare-execution-context --script-out"

task acceptance (each criterion gets a red-then-green test):
1. given a valid scope, prepare-execution-context with --script-out <path> writes a copy of the canonical workflow script differing only in its meta description — one line naming the target branch and every in-scope feature id (past 5 ids, the first 5 then +<k> more) — while stdout stays the unchanged execution context; without the flag nothing is written
2. the splice is quote-safe (the description value lands JSON-stringified, meta stays one physical line) and shape-gated — a canonical script whose meta line doesn't match the expected description shape makes the command exit 1 with nothing written

footprint (the lease — stay inside it): src/splice-workflow-description.js, bin/cli-commands.js, test/splice-workflow-description.test.js, test/prepare-execution-context-script-out.test.js
wiring: prepare-execution-context lives in bin/cli-commands.js; the canonical script is workflows/execution-pipeline.js (its meta is a single physical line). Put the pure splice (scope-derived description shaping + the meta-line rewrite) in the new src/splice-workflow-description.js and call it from the command's --script-out leg.

Fetch more only if needed:
- feature design doc: docs/designs/run-presentation/design.md
- system design (architecture, cross-feature contracts): docs/architecture.md
