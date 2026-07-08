feature: status-reporting · task: progress-rollup — add a completion rollup line to the status summary
commit subject: "status-summary: progress rollup line"

Add a one-line completion rollup to the status summary (`src/status-summary.js`),
rendered just below the status counts block:

    **Progress:** <done>/<total> validated or shipped (<pct>%)

where `<done>` is the number of features whose status is `validated` or `shipped`,
`<total>` is the total feature count, and `<pct>` is `done/total` as a whole-number
percent rounded to the nearest integer. An empty graph must render
`**Progress:** 0/0 validated or shipped (0%)` — never a divide-by-zero.

task acceptance (each criterion gets a red-then-green test):
1. a graph with some validated or shipped features renders the rollup line with the
   correct done count, total, and rounded percent
2. an empty graph renders `**Progress:** 0/0 validated or shipped (0%)`

footprint (the lease — stay inside it): src/status-summary.js, test/status-summary.test.js
