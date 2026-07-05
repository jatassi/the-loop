# Actions — the-loop

Open design/process actions that live nowhere else — not feature work (the feature
graph's job), not decisions already made (the ADRs' job), and not feature-scoped design
guidance (that lives in the feature's own design doc). Born in the 2026-07-01
design-review session. **Delete an item when it lands**; git history is the archive.

- **Feature-status enum expansion (pre-designed state)** — *due: design amendment
  immediately after `rename-sweep` lands; deliberately kept out of the sweep (a
  semantic change to the three-status durable core, not a rename).* Jackson approved
  the enum's new name (`feature status`) at the 2026-07-05 naming-map boundary and
  asked for a state before `designed` (a backlog/proposed stage). The amendment must
  decide: the new value's name (blind-derived per the naming standard), what creates
  a pre-designed node, how launch gates it (refuse un-designed scope), and how the
  orientation proposal surfaces it. Touches: status enum in the schema module,
  graph docs, launch gating, orientation, `/the-loop` route table.

- **Mid-feature human gate vs the built-predicate** — *observed 2026-07-05 on the
  naming-map runs (wf_54a2f4da).* A build leg that deliberately stops halfway for a
  human decision (draft-then-block, per naming-map's design) commits with the
  standard `<feature>/feature:` subject prefix — which satisfies the engine's
  built-iff-prefix-commit derivation, so the re-run after the human answers skips
  the build leg entirely and validation fails on the half-done artifact. Repaired
  manually this time (the session transcribed the verdicts — zero-judgment work).
  Decide one: a distinct draft-commit subject shape the derivation ignores; or the
  derivation also requiring the feature doc's completion marker; or a rule that
  draft-then-block designs name the session (not a build agent) as the recorder of
  boundary answers. Fold into the post-sweep amendment batch.

- **V2 benchmark (taming stage 6)** — *due: first fresh session on the `taming`
  branch.* Stages 1–5 of the ADR-0034..0040 rebuild landed 2026-07-04 (commits
  `ce0f9bb`, `a18fc70`, `3cc6db5`; net −9,731 lines; 129 tests + `npm run check`
  green; snapshot→engine round-trip proven via the shim). What remains is the live
  proof, which needs a fresh session (agent registration is read at session start):
  1. Open a new session on `taming`, run `/the-loop`, accept a small frontier
     feature (e.g. `research-tiers`); then a standard-lane feature.
  2. Re-run the transcript forensics from the 2026-07-04 taming session and judge
     against the targets below. Numbers within target = tamed; misses get diagnosed,
     not rationalized. Then merge `taming` → `main` and ship.

  | Metric (per feature) | Baseline (measured 2026-07-04) | Target |
  |---|---|---|
  | Small-lane agents | 8 | 2 |
  | Small-lane wall clock | 61 min + session ceremony | ≤ 15 min |
  | Small-lane cache-read tokens | ~20M | ≤ 2M |
  | Commits landed per feature | 15 (1 code) | ≤ 3 |
  | Standard-lane wall clock (5 tasks) | ~146 min serial | ≈ slowest task + validate |
  | Launch overhead | 7 steps, 5–12 CLI calls | 1 CLI call + 1 Workflow call |
  | Human interventions per clean run | continuous shepherding | 2 |
  | Fixed context per build agent | ~66–84KB | ≤ 8KB (measured now: ~3KB card+kernel) |

  Known-stale note: the seven v1 probe packs were deleted with the machinery they
  pinned; v2 validators pin fresh packs as features validate, so the first few ships
  lean on the test suite alone — deliberate, not an oversight.
