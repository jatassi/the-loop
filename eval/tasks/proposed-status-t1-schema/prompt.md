feature: proposed-status · task: schema — proposed status enum + acceptance exemption
commit subject: "proposed-status/schema: proposed status enum + acceptance exemption"

`proposed` is a new backlog stage in the feature-status lifecycle: recorded intent that
isn't designed yet, sitting ahead of `designed` in the durable enum.

task acceptance (each criterion gets a red-then-green test):
1. a graph containing a feature with status `proposed` and no acceptance list passes `the-loop check` OK, while a `designed` feature missing acceptance still fails with missing-acceptance
2. the human status summary counts the `proposed` stage alongside the existing durable statuses — `the-loop status` renders a `- proposed: <n>` count

footprint (the lease — stay inside it): src/feature-schema.js, test/feature-schema.test.js, test/status-summary.test.js
wiring: the status enum and the per-feature field checks both live in src/feature-schema.js. Adding `proposed` to the enum makes `the-loop status` render a new `- proposed: <n>` count, so the status-summary test's expected output needs updating too.

Fetch more only if needed:
- feature design doc: docs/designs/proposed-status/design.md
- system design (architecture, cross-feature contracts): docs/architecture.md
