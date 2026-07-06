---
status: accepted
date: 2026-07-05
---

# ADR-0045 · `proposed` — a backlog stage in the durable status core

**Context.** ADR-0034 fixed durable state at exactly two things — code commits and
the feature graph's three-status field (`designed | validated | shipped`) — which
made the graph a picture of *specified* work only. Feature-shaped intent with no
design yet had no durable home: it landed in `docs/TODO.md` (built for process
actions, not features), in chat history, or nowhere. The 2026-07-05 naming-map
boundary approved the enum's name (`feature status`) and requested a stage before
`designed`; the rename-sweep deliberately excluded it as a semantic change, not a
rename. The alternative — keeping the backlog outside the graph — preserves the
"everything in the graph is runnable-after-deps" invariant but splits roadmap truth
across two surfaces and leaves the next-action proposal blind to known future work.

**Decision.** The feature status enum gains a first value, **`proposed`**: a
feature accepted onto the roadmap as recorded intent — id + title, optionally
notes/edges/an acceptance sketch — with no design doc and no required acceptance.
The graph becomes the single backlog. The name was blind-derived under the naming
standard (ADR-0044: fresh-context generations shown only the purpose line, role,
and siblings; outsider quiz passed) and human-approved at this amendment's gate.

- **Design is the only promotion path.** Designing the feature writes its design
  doc and acceptance and flips the status. No demotion automation; backwards moves
  are human edits.
- **Nothing downstream loosens.** `proposed` never satisfies a dependency edge,
  never enters the eligible set, and the execution-context gate refuses it —
  acceptance stays required from `designed` onward.
- **The proposal learns one kind.** `design`: stuck designed features whose
  blockage traces to proposed dependencies, or a graph whose only unshipped
  features are proposed, route to the design skill instead of reading as "repair"
  or "bring the next intake". On a validate-clean graph, `blocked` returns to
  being a true safety net — the stuck case now has a legitimate explanation.

**Consequences.** ADR-0034's posture survives amended: durable state is still
code commits plus the status field; `proposed` is durable recorded intent, not
in-flight state. The schema relaxes exactly one rule (acceptance optional at
`proposed`). All enum-stating prose lands atomically with the code, sweep-style.
The cost accepted: the graph no longer guarantees every record is buildable —
consumers must key on `designed`, not on presence. Reversal after backlog records
accumulate means migrating them out, which is why this is an ADR and not a schema
footnote. **Amends** ADR-0034 (durable status core) and ADR-0037 (feature-graph
artifact semantics).
