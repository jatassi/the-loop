feature: proposed-status · task: routing — proposed features surfaced as design proposals
commit subject: "proposed-status/routing: proposed excluded from build routing, surfaced as design proposals"

`proposed` is a backlog stage in the feature-status lifecycle: recorded intent, not yet
designed (it carries no acceptance list). A proposed feature is never build-eligible, and
when proposed work is what's blocking or all that remains, the next-action orientation
should route it to Design rather than reporting the graph broken or exhausted.

task acceptance (each criterion gets a red-then-green test):
1. a designed feature depending on a proposed one is excluded from the eligible set, and the machine orientation proposes kind `design` naming the blocking proposed id (the proposed root cause, direct or transitive — not the designed link between)
2. on a graph whose only unshipped features are proposed, the machine orientation proposes kind `design` naming them, never `new-intake`

footprint (the lease — stay inside it): src/feature-schema.js, src/propose-next-action.js, test/feature-schema.test.js, test/propose-next-action.test.js, test/status-summary.test.js
wiring: the machine orientation (src/propose-next-action.js, behind `the-loop status --json`) validates the graph before it proposes, so `proposed` must be a recognized, acceptance-exempt status in src/feature-schema.js for these graphs to reach the routing logic at all; expanding that enum also adds a `- proposed` row to `the-loop status`, so the status-summary test's expected output needs updating.

Fetch more only if needed:
- feature design doc: docs/designs/proposed-status/design.md
- system design (architecture, cross-feature contracts): docs/architecture.md
