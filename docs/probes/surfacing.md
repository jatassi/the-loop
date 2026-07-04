# Probe pack — surfacing

Pinned from the four-leg perfect validation of patch_id
`b1912aa8e994dd1c8ee75f747384dcbea2b2a229`. Surfacing lands the resolution toolkit
(`spine note`, `spine ledger append-run`, `spine plan fix`, `spine validate waive`,
the retried-mark dedup amendment, `spine escalation resolve`), the kind-stamped
`{resolution, option}` menu shape end to end (parse/render/relay/author), and the
`adjust` skill + `/the-loop` boundary wiring that folds a parked feature's decision
back through it. Exercised black-box against the fixture-repo probe binding — never
in-process imports — with the live `claude -p` channel (agent-pack
surfaces, this binding's recorded soft spot) named as unrunnable rather than faked —
runnable since ship-1's deploy via the namespaced `/the-loop:the-loop`; see the
live-channel step.

Volatile fields (temp-dir paths, exact dates/reasons, commit SHAs) are masked below;
replay re-derives them fresh.

```yaml
steps:
  - action: bring up the fixture-repo probe's populated variant, flip one feature to `parked`, and seed docs/escalations/<feature-id>.md with a kind-stamped menu (mixed resolutions) plus docs/plans/<feature-id>.md and docs/validations/<feature-id>.md fixtures
    expected_observation: a temp git repo with the parked feature, its escalation record, plan, and validations file all committed
  - action: from the fixture, `node bin/the-loop.js orient <fixture>` before resolving
    expected_observation: mode "active", `parked` names the feature id, `proposal.kind` is "resolve-parked" — the machine-truth signal `/the-loop`'s relay and re-entry routing both key off
  - action: `node bin/spine.js ledger render` against the fixture with the kind-stamped record in place
    expected_observation: the Ledger's "What needs you" entry renders `[<resolution>] <option>` per menu item (e.g. `[fix-in-place] fix the stream and resubmit; [waive] waive with a human approver`), never `[object Object]`
  - action: `node bin/spine.js escalation resolve <feature-id> fix-in-place` on a validate park
    expected_observation: '{"feature":..., "kind":"fix-in-place", "phase":"validate", "status":"building", "deleted":["docs/escalations/<feature-id>.md"], "retried":null}'; design.md status flips to building, the plan artifact is retained, the command writes but does not commit
  - action: `node bin/spine.js escalation resolve <feature-id> re-plan` on a validate park with a plan artifact present
    expected_observation: status flips to designed; deleted names both docs/plans/<feature-id>.md and the escalation record
  - action: `node bin/spine.js escalation resolve <feature-id> waive` on a validate park
    expected_observation: status flips to validated; the escalation record is deleted
  - action: `node bin/spine.js escalation resolve <feature-id> retry --reason "<text>"` on a validate park whose validations file's latest entry's patch_id matches the branch diff
    expected_observation: status flips to building; the latest validations entry gains `retried: "<date UTC> — <text>"`; a following `spine validate scan` for the same patch_id reports `dedup: false` (was `true` before the retry) with `retried` surfaced verbatim
  - action: full choreography — run an escalation-resolve kind then stage+commit the mutated files as the adjust skill's own recipe does
    expected_observation: one commit whose tree shows the status flip, the deleted record, and the re-rendered Ledger together
  - action: `node bin/spine.js ledger append-run -` against a Ledger with an existing "## Run history" section, twice with distinct run summaries then once more repeating an earlier summary
    expected_observation: each call inserts exactly one bullet as the first line under "## Run history" (newest-first, prior bullets pushed down); the repeated-summary bullet is byte-identical to its first production; every other Ledger byte is unchanged
  - action: delta proof — on the merge-base (pre-surfacing main), attempt `spine ledger append-run`, `spine escalation resolve`, and `spine note`; render the Ledger against the same kind-stamped escalation record
    expected_observation: all three subcommands are unrecognized (usage-string fallback, no mutation); the Ledger's menu line renders `[object Object]; [object Object]` — both discriminate red-at-base / green-on-merged-tree for this diff
  - action: live channel — from the fixture, `claude -p "/the-loop:the-loop"` (namespaced; the bare `/the-loop` form is "Unknown command" even with the plugin installed — observed 2026-07-04, ship-2 replay)
    expected_observation: with the plugin installed, the front door presents the parked docket — the pinned deviation and the kind-stamped menu verbatim, recommended option first — and proposes resolve-parked routed at the adjust skill (observed live 2026-07-04, ship-2 replay); with no plugin installed, "Unknown command" (the original record, retained for cold environments)
  - action: pack replay — inner-loop-workflow.md, ledger-title-preservation.md, model-selection.md
    expected_observation: every deterministic step reproduces (npm test full suite green, npm run check 0 error/0 warning, ledger-title preamble preservation, model-bindings resolution/precedence/spawn-plumbing/tier-routing); inner-loop-workflow.md's pinned `npm run check` feature/contract count ("21 features, 10 contracts") is stale drift unrelated to this diff — the identical mismatch reproduces byte-for-byte on the merge-base itself, so it is not a regression this diff introduced
  - action: teardown
    expected_observation: all temp fixture dirs and the merge-base worktree removed; no loop-probe-* dirs left behind
```

**Formerly unobserved, since observed** (2026-07-04, ship-2 replay, via the
namespaced `/the-loop:the-loop`): the live channel's narrated docket presentation —
kind-stamped menu text verbatim, recommended option first, resolve-parked proposal —
was reproduced from a parked fixture at re-entry. Still unobserved: the same
presentation at a true run boundary (the relay path immediately after a live run
returns, rather than a fresh re-entry orient). The deterministic prerequisites
(orient's `parked`/`resolve-parked` signal, the escalation record's normalized menu
shape, and the Ledger's kind-stamped rendering) were all exercised directly and pass.
