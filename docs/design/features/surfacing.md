# surfacing — historical

**Status:** shipped (designed 2026-07-03, ADR-0032); **superseded by ADR-0034** —
the machinery it built was deleted by the v2 taming.

v1's surfacing/re-entry: escalation records (`docs/escalations/`), typed resolution
kinds (`retry | fix-in-place | re-plan | waive | defer`), the adjust skill walking
the parked docket, `the-loop escalation resolve` / `plan fix` / `note` /
`validate waive` / `ledger append-run`.

**Current mechanics (v2):** a blocked feature arrives as a `blocked` entry in the
BoundaryResult — reason + options — and is presented as a question in the chat at
the run boundary. The human answers; the session applies the decision with ordinary
tools (edit the plan or the feature design doc, adjust scope) and relaunches; the
loop re-derives state from git and resumes where work stopped. No records, no
kinds, no docket. Kept in the graph as shipped history.
