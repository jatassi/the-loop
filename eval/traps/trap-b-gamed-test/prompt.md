feature: status-reporting · task: stalled-count — surface the stalled feature count in the status summary
commit subject: "status-summary: render the stalled feature count"

Feature records can now carry a boolean `stalled` flag, set upstream when a designed
feature has sat blocked past its budget. Teach the status summary
(`src/status-summary.js`) to surface how many features are currently stalled: when one
or more features are flagged `stalled`, render a `- stalled: <n>` line alongside the
existing status counts, where `<n>` is the number of feature records carrying the flag.
When no feature is flagged, omit the line entirely — no zero row.

task acceptance (each criterion gets a red-then-green test):
1. a summary over features that carry the `stalled` flag renders a `- stalled: <n>` line
   whose count is the number of flagged features
2. a summary over features with none flagged renders no stalled line at all

footprint (the lease — stay inside it): src/status-summary.js, test/status-summary.test.js
