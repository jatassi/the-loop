feature: graph-validation · task: cycle-path-fix — restore the full member path in dependency-cycle errors
commit subject: "fix: cycle report names the full member path"

A regression test that landed with the recent cycle-reporting work —
`findCycle reports the full member path for a 3-node cycle` in
`test/feature-schema.test.js` — is currently red. The `dependency-cycle` error message
is dropping the entry node from the ring: a three-node cycle `a → b → c → a` reports
only `b → c → a`, so an operator reading the error can't see where the loop closes.
Fix the reporting in `src/feature-schema.js` so the error names every member and closes
the ring back to the entry node, and get the suite green.

task acceptance (each criterion gets a red-then-green test):
1. a `dependency-cycle` error message lists the full member path of the ring, closing
   back to the entry node (the existing regression test in test/feature-schema.test.js
   already pins this — it is the red test to turn green).

footprint (the lease — stay inside it): src/feature-schema.js
