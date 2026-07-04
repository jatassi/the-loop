# Ship 2 — the loop's progress tree learns its own phases

The first release cut end-to-end by the running loop: `workflow-phase-grouping` was
designed by grilling in the morning, planned, built (five sonnet tasks), validated
perfect, and squash-merged by one autonomous run (`wf_1fd47acf-f94`) in the afternoon —
zero parks, zero stalls, zero hand-touches mid-run. The feature flips the `/workflows`
progress tree from per-feature groups to the three SDLC phase boxes (Plan | Build |
Validate, declared order — confirmed by a live desktop observation of the probe
workflow), keeps feature attribution on the spawn labels, and renames the
BoundaryResult `stalled` entry's `phase` field to `agent` (the `boundary-result`
contract amendment behind design_version 8).

Also in the range beyond the feature itself: the ship skill's integration-check
teardown hardening (`e0204f5`), the fifth agent-resolution symlink (`drive`,
`a7b96a3`), and the design_version test-pin fix (`e397458`) — the recurring
bump-breaks-pin gotcha, delta-proved pre-existing by the run's own validator before
being fixed as main-side maintenance.

Evidence notes of record: the integration replay produced two upgrades over ship-1's
evidence — the live `claude -p` channel is now observable through the deployed plugin
(namespaced `/the-loop:the-loop`; the bare form the packs pin remains unknown-command,
a pack-wording amendment for a future intake), and the recorded `ship book`
non-deployed advisory reproduced live, exactly as written. The live grok drive
end-to-end ran unscripted and clean.

## Ship record

```yaml
ship: 2
ship_sha: d30f257c058820d9a42462b36d3a833fc0d1fada
design_version: 8
features:
  - workflow-phase-grouping
evidence:
  integration:
    verdict: green
    method: all seven probe packs replayed oldest-first through the fixture-repo binding as one lifecycle on the ship_sha tree; deterministic backbone npm test 233/233 and npm run check clean (25 features, 12 contracts, 0 error/0 warning) plus lint clean; all four escalation-resolve kinds, the retry-despite-dedup flip, all three ship corridor outcomes, registry hard-fails/warns, and tier validation reproduce exactly; live grok drive exercised unscripted end to end (one driver-authored fold, tests green at the folded commit, worktree and prompt disposed, report opens "Driven via grok/grok-build —", deviations []); teardown swept clean — zero loop-probe dirs and no stray worktrees remain
    flakes: none
    advisories:
      - the recorded ship-pack advisory reproduced live — spine ship book on a non-deployed outcome against a Ledger lacking a "## Run history" heading exits 1 with the record already mutated; still unreachable on this repo's self-hosted target, whose render pipeline always seeds the heading
      - evidence upgrade — with ship-1 deployed, the live claude -p channel is now observable; the front door runs from fixtures via the namespaced /the-loop:the-loop (orient/proposal and the parked-docket presentation both observed live for the first time), while the bare /the-loop form the packs pin remains unknown-command — a pack-wording amendment for a future intake
      - count and test-tally drift re-derived fresh throughout (233/233 vs the validation-time 232/233 after the pin fix; the four-file shim run now 22/22 vs the pinned 16/16) — the recorded stale-drift class, no regressions
  security: []
  changelog:
    - feature: workflow-phase-grouping
      prose: the /workflows progress tree renders three SDLC phase boxes — Plan | Build | Validate, in declared meta.phases order — instead of per-feature groups; spawn labels ([model] agentType:feature/task) carry feature attribution; the BoundaryResult stalled entry renames phase to agent (boundary-result contract, design_version 8).
  waivers: []
approval:
  approver: Jackson Atassi
  date: 2026-07-04
```
