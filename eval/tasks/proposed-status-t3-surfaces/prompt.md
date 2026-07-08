feature: proposed-status · task: surfaces — status-enum surface sweep + design route
commit subject: "proposed-status/surfaces: status-enum surface sweep + design route"

The feature-status enum is gaining a fourth durable value, `proposed` (a backlog stage:
recorded intent, not yet designed), leading the enum ahead of `designed`. And the
next-action orientation now emits a `design` proposal kind (routing proposed work to
Design). The living surfaces that state the enum, and the /the-loop route table, must
catch up.

task acceptance (each criterion gets a red-then-green test):
1. the /the-loop route table maps a `design` proposal to the design skill, and every living surface stating the status enum lists the four values (`proposed | designed | validated | shipped`) — the old three-value statement greps to zero outside historical records (ADRs, founding/per-feature design docs, plans, releases, bugs, research, briefs)

footprint (the lease — stay inside it): README.md, bin/the-loop.js, docs/architecture.md, docs/feature-graph.md, docs/glossary.md, skills/design/SKILL.md, commands/the-loop.md, test/proposed-status.test.js
wiring: the surfaces stating the enum are README.md, bin/the-loop.js (the set-status usage line), docs/architecture.md (Operating model + Feature record contract), docs/feature-graph.md (header), docs/glossary.md ([[feature graph]] entry), and skills/design/SKILL.md (the yaml sample); the `design` route belongs in commands/the-loop.md's route table. Edit prose/comments only — do not touch the feature-graph yaml.

Fetch more only if needed:
- feature design doc: docs/designs/proposed-status/design.md
- system design (architecture, cross-feature contracts): docs/architecture.md
