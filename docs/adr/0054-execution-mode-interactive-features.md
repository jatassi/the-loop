---
status: accepted
date: 2026-07-25
---

# ADR-0054 · Execution mode — human-attended features as a first-class record field

**Context.** The loop's premise is that a designed feature with satisfied dependencies
can be handed to an autonomous Plan → Build → Validate pass. Some features falsify that.
`agent-surface-trim`'s acceptance reads *"every surfaced candidate carries an explicit
keep, rewrite, relocate, or delete ruling"* — the rulings are the human's, no test makes
them, and an autonomous pass would produce confident garbage.

The graph had no way to say so. Such a feature is `designed` with satisfied edges, so it
enters the eligible set, `/begin` offers it inside its default `advance-eligible-set`
proposal, and the only defense is the human remembering to hand-trim the scope every
time. The constraint lived in a human's notes rather than in the artifact — the exact
condition the loop exists to eliminate.

Alternatives weighed: a fifth status value (rejected — status is the durable lifecycle
position, and an interactive feature travels `proposed → designed → validated → shipped`
identically; overloading it would make "where is this" and "who runs this" the same
question); a naming convention on the id (rejected — unenforceable, and invisible to the
gate); a refusal only at the launch gate (rejected — `/begin` would still propose the
feature inside its default batch, and the refusal would then block the autonomous
features that were fine, reproducing today's hand-trimming).

**Decision.** The feature record gains an optional orthogonal field, **`execution`**,
valued `autonomous | interactive`, absent meaning `autonomous`. Every existing record in
every consuming project stays valid and unchanged.

- **Interactive is not unvalidated.** The human owns Plan and Build; the ordinary
  validate leg still runs — fresh eyes, the same acceptance criteria, the same
  squash-land and status flip. Nothing reaches `validated` in this system without an
  independent look, and this carves out no exception.
- **The eligible set is the primary defense.** Excluding interactive features there
  fixes the proposal, the human render, and the `eligibleSet` orientation JSON at once,
  and makes the `execute` surface safe by construction without changing it.
- **The proposal must stay honest.** Interactive features are `designed`, so a project
  whose only ready work is attended would otherwise be told `blocked — the graph needs
  repair`. A new `advance-interactive` kind precedes that branch. A consumer that keeps
  running but starts lying is the failure mode this decision most guards against.
- **Both doors are gated.** `prepare-execution-context` refuses an interactive id;
  `--interactive` refuses an autonomous one. A backstop for the hand-typed id, not the
  primary defense.
- **Fail closed on a malformed value.** A non-string `execution` is a named parse error,
  not a silently dropped marker — unlike `section`, whose silent-drop precedent would
  here mean running a human-attended feature autonomously.
- **Producers must ask, not infer.** The mode is a **required question to the human**,
  posed with a recommendation — by Design once per promotion batch, by Diagnose for its
  fix record, and posed even when nothing is flagged. An agent deciding for itself which
  work it may run unattended is the wrong party asking the wrong question; and a field
  only consumers know about is dead on arrival — nothing sets it, the gate fires on
  records nobody marked, and the human learns to route around the gate.
- **The trigger is "wants a human's eyes", not "impossible to automate".** Recommend
  `interactive` for taste (visual design, copy, naming, API ergonomics), for work whose
  deliverable *is* a set of rulings, for adjudication-shaped acceptance, for correctness
  only a person can witness, for an open fork or an unwritten preference, and for changes
  that are hard to reverse and cheap to get subtly wrong. The one-line test: *would the
  human want to look before it lands, and can the acceptance criteria make them look?*
  A model's confident default on a taste question is exactly the templated result the
  human is trying to avoid — an agent *can* produce it, which is the problem.

**Consequences.**

- A new shipped surface, `interactive-execution`, is the attended counterpart to
  `execute`. It reuses the validate contract rather than restating it.
- **A binary older than this schema silently discards the marker.** `set-status` does not
  validate; it re-emits the graph, and `emit` drops unknown keys — and `set-status` is
  the validator's final act. So the field cannot be applied to any record until the
  upgraded binary is installed, and this ADR's own landing adds no `execution` key to
  this repo's graph. The general gap is parked as `graph-schema-forward-compat`;
  forward compatibility must ship before the field it protects, so it could not have
  helped here.
- The trade-off accepted: one more axis on the record that every producer must now
  consider. Mitigated by the default — absent is autonomous, so the axis only costs
  attention on the rare feature that needs it.

*Supersedes nothing. Extends the feature record contract of ADR-0037; the status enum of
ADR-0045 is untouched.*
