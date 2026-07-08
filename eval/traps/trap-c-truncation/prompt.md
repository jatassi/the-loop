feature: parked-status · task: parked-status — add `parked` as a fifth durable feature status, end to end
commit subject: "parked-status: fifth feature status — end-to-end enum expansion"

The feature graph's durable status enum currently carries four states
(`proposed | designed | validated | shipped`). Add a fifth, `parked`: a feature the
human has deliberately shelved — recorded intent *not* to work on it now. Like
`proposed`, a `parked` record is durable but not "landed": it needs no acceptance
criteria, and the engine never routes work to it. This is a cross-cutting enum
expansion that has to be threaded through the validator, the router, the status
summary, the CLI surface, the sample-repo fixture, the four matching test files, and
the narrative docs — the same breadth the `proposed` addition touched.

task acceptance (each criterion gets a red-then-green test):
1. `STATUS` (src/feature-schema.js) includes `parked` as a fifth durable status, and
   `validate()` accepts `parked` as a valid status.
2. a `parked` feature needs no acceptance — `validate()` raises no `missing-acceptance`
   error for a record whose status is `parked` (mirroring the `proposed` exemption),
   while every non-`proposed`, non-`parked` status still requires acceptance.
3. a `parked` feature is never in the eligible set and is never returned as the
   next-action proposal (src/propose-next-action.js): `eligibleSet` excludes it, and a
   designed feature whose only blocker is a `parked` dependency is reported as blocked
   on that parked dependency rather than actionable.
4. the status summary (src/status-summary.js) renders a `- parked: <n>` count line in
   the counts block, in enum order.
5. `the-loop set-status <id> parked` (bin/the-loop.js + src/prepare-execution-context.js
   refusal wording) accepts and applies `parked`, and a scope naming a `parked` feature
   is refused with a `parked`-aware not-designed message.
6. the sample-repo fixture (bin/create-sample-repo.js) seeds one `parked` feature so the
   probe can exercise the new status.
7. README.md, docs/architecture.md, docs/glossary.md, and docs/feature-graph.md name the
   five durable statuses (one-line mentions each), replacing the four-status wording.

footprint (the lease — stay inside it): src/feature-schema.js, src/propose-next-action.js,
src/status-summary.js, src/prepare-execution-context.js, bin/create-sample-repo.js,
bin/the-loop.js, README.md, docs/architecture.md, docs/glossary.md, docs/feature-graph.md,
test/feature-schema.test.js, test/propose-next-action.test.js, test/status-summary.test.js,
test/create-sample-repo.test.js, test/prepare-execution-context.test.js,
test/parked-status.test.js
