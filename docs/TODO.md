# the-loop — Process backlog

Open design/process items that live nowhere else — not feature work (the feature
graph's job), not decisions already made (the ADRs' job), and not feature-scoped design
guidance (that lives in the feature's own design doc). Born in the 2026-07-01
design-review session. **Delete an item when it lands**; git history is the archive.

- **Feature-status enum expansion (pre-designed state)** — *due: an amendment
  immediately after `rename-sweep` lands; deliberately kept out of the sweep (a
  semantic change to the three-status durable core, not a rename).* Jackson approved
  the enum's new name (`feature status`) at the 2026-07-05 naming-map boundary and
  asked for a state before `designed` (a backlog/proposed stage). The amendment must
  decide: the new value's name (blind-derived per the naming standard), what creates
  a pre-designed record, how the run-preparation step gates it (refuse un-designed
  scope), and how the status proposal surfaces it. Touches: status enum in the
  schema module, feature-graph docs, run-preparation gating, status output,
  `/the-loop` route table.

- **Mid-feature human gate vs the built-predicate** — *observed 2026-07-05 on the
  naming-map runs (wf_54a2f4da).* A build leg that deliberately stops halfway for a
  human decision (draft-then-block, per naming-map's design) commits with the
  standard `<feature>/feature:` subject prefix — which satisfies the execution
  pipeline's built-iff-prefix-commit derivation, so the re-run after the human
  answers skips the build leg entirely and validation fails on the half-done
  artifact. Repaired manually this time (the session transcribed the verdicts —
  zero-judgment work). Decide one: a distinct draft-commit subject shape the
  derivation ignores; or the derivation also requiring the feature doc's completion
  marker; or a rule that draft-then-block designs name the session (not a build
  agent) as the recorder of boundary answers. Fold into the post-sweep amendment
  batch.
