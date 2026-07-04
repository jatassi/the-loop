# Actions — the-loop

Open design/process actions that live nowhere else — not feature work (the feature
graph's job), not decisions already made (the ADRs' job), and not feature-scoped design
guidance (that is baked into the relevant feature-graph node's `notes`, which travel
with the injected slice when the feature is designed). Born in the 2026-07-01
design-review session. **Delete an item when it lands**; git history is the archive
(the escalation-record pattern, ADR-0009).

- **V2 taming rebuild** — *due: now; branch `taming`; hand-built outside the loop.*
  Implement ADR-0034 through ADR-0040 (the 2026-07-04 taming session), staged in
  dependency order, each stage independently verifiable:
  1. **Spine CLI**: one-shot `launch` snapshot assembler with gates built in;
     section-addressable fetches; worktree lifecycle (create/setup/prune); unpark;
     ledger render-on-demand; delete dead subcommands (escalation resolve, validate
     waive, corridor bookkeeping).
  2. **Artifact migration**: split design.md (system narrative + graph file +
     per-feature design docs); reshape plan format; delete `docs/validations/` and
     `docs/escalations/`; dictionary standard-terms pass; `ports.md` → config.
  3. **Workflow rewrite**: ready-set scheduler, three lanes, kernel+menu prompts,
     feature/task concurrency, worktree spawns.
  4. **Agent & skill rewrites**: role cards (build ~2KB, validate ~2–3KB, plan,
     simplified drive); front door ~2KB; ship skeleton; delete `adjust` and `derive`.
  5. **Test-suite reshape** alongside each stage (pure core / thin CLI discipline).
  6. **Benchmark**: run one real small feature and one real standard feature through
     the new loop; transcript forensics; judge against the targets below.

  **Acceptance targets (order-of-magnitude commitments, measured not felt):**

  | Metric (per feature) | Baseline (measured 2026-07-04) | Target |
  |---|---|---|
  | Small-lane agents | 8 | 2 |
  | Small-lane wall clock | 61 min + session ceremony | ≤ 15 min |
  | Small-lane cache-read tokens | ~20M | ≤ 2M |
  | Commits landed per feature | 15 (1 code) | ≤ 3 |
  | Standard-lane wall clock (5 tasks) | ~146 min serial | ≈ slowest task + validate |
  | Launch overhead | 7 steps, 5–12 CLI calls | 1 CLI call + 1 Workflow call |
  | Human interventions per clean run | continuous shepherding | 2 |
  | Fixed context per build agent | ~66–84KB | ≤ 8KB |

  Retired into this item: *Effort-level rigor scaling* (landed as ADR-0038's three
  lanes) and *Hand-building-only-as-recorded-escalation* (superseded by ADR-0038's
  bypass lane).
