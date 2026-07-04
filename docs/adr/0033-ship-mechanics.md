---
status: accepted
date: 2026-07-03
---

# ADR-0033 · Ship mechanics: pinned evidence, the approval corridor, ship records, and the marketplace-on-main binding

**Context.** ADR-0014 fixed Ship's shape — evidence package, human gate, health-gated
delegated rollback — but not its mechanics: what durably marks a ship, who executes the
evidence legs, what the approval binds to, the deploy/rollback choreography, and what
"deploy" even means for the-loop itself (a Claude Code plugin with no conventional
prod). Resolved by grilling, 2026-07-03. Amends ADR-0014 (the smoke-check letter);
extends ADR-0026 (booking choreography, the `loop/` ref namespace) and ADR-0032 (live
waivers surface in the package; the two-commit crash-window pattern reused).

**Decision.**
- **Record-as-truth.** `docs/ships/ship-<N>.md` (contract `ship-record`) pins
  `ship_sha`, design_version, the feature list, evidence, approval, and outcome; the
  `loop/ship/<N>` tag is refs-last convenience, `deployed` outcomes only. The ship diff
  range is the previous record's `ship_sha`..tip (root for ship-1). **Whole-frontier
  only** — ship deploys the target's tip, never a subset.
- **Session-inline evidence legs.** Ship is human-initiated and human-present, so the
  session executes every leg itself — no ship agents, no new model-binding roles.
  Integration check = every pinned pack replayed on the tip tree per ADR-0028 semantics
  (one bringUp → all packs → teardown; masking + flake protocol verbatim); **red blocks
  hard** — no record, no gate, no in-loop override; a consistent red on the target tip
  is bug-shaped, an Evolve intake. Security findings land verbatim, severity-ranked,
  **inform-only** — the human gate is the sole authority. Changelog is record-resident:
  the range's squash commits are the skeleton (bookkeeping excluded by construction),
  session prose on top. Live waivers on the frontier are listed (ADR-0032's promise).
- **The pin.** `ship_sha` = target tip at assembly; approval records
  `{approver, date}` against it (approver = git `user.name` — the gate is synchronous).
  Commits since `ship_sha` beyond this ship's own bookings **void the evidence** —
  reassemble, never deploy stale, and never deploy a non-tip tree.
- **The corridor, bracketed by two bookings.** Commit 1, pre-deploy: record with
  evidence + approval, plus the plugin version bump — the durable
  "approved-and-about-to-touch-prod" trace, landed before any prod-touching command.
  Then, autonomously (the one post-gate re-grant): deploy → smoke → conclude; smoke
  fail → the binding's rollback → **one smoke re-run verifying restoration**. Outcomes:
  `deployed` | `rolled-back` | `deploy-failed` (rollback still invoked — half-applied
  is indistinguishable from bad). A failed rollback verification is the loudest line
  and a full stop — the loop never takes a second autonomous swing at prod. Commit 2,
  post-corridor: outcome appended; on `deployed` only, the frontier flips
  `validated→shipped` via the mechanical `spine ship book` + Ledger re-render; every
  outcome gets one newest-first Ledger history line (the shared run-boundary stream);
  tag last. A record with approval but no outcome surfaces at re-entry as
  interrupted-mid-corridor, verify-prod-by-hand — **never auto-resumed**.
- **The smoke suite is user-defined.** The deploy-target binding is
  `{deploy, rollback, smoke}`, recorded at Design/Configure and excerpted verbatim like
  the probe binding; probe-pack steps are a suggested source, not machinery (amends
  ADR-0014's "the probe's acceptance smoke checks"; no pin-time smoke flags). **No
  smoke suite → no mechanical health signal → auto-rollback off for that ship**,
  surfaced never silent — autonomy only where a signal exists to trigger it.
- **Self-hosting binding: marketplace-on-main.** The repo's own
  `.claude-plugin/marketplace.json` (`source: "./"`, static, written once) is added via
  `claude plugin marketplace add`; consumption is **pull-at-ship** —
  `claude plugin marketplace update` + `plugin update` at the commit-1 tip, so
  main-tracking stays gate-safe: the installed cache is the deployed state between
  ships. Rollback = snapshot-restore of the installed tree, snapshotted by the deploy
  step (cache retention across updates is a build-time probe, not a design assumption).
  Smoke = `claude plugin list` asserts version `0.<N>.0` (↔ ship-N) + a headless
  `claude -p` exercising the installed plugin on a cold-start fixture — restart-required
  means the live session runs old code, which the self-hosting code-swap rule already
  accepts. Corridor tests ride a scripted fixture deploy target with injectable
  outcomes; the real plugin CLI never enters the suite.

**Why.** Evidence must describe exactly what deploys — hence the pin, and
void-and-reassemble instead of cleverness. Records beat refs because artifacts are the
spine and refs are pointers. Two commits because a crash between approval and outcome
must leave the approval visible. Smoke is user-defined because prod-safety is
per-project judgment the engine cannot derive. Autonomy is tied to the existence of a
mechanical health signal because delegated rollback without one is a guess.

**Considered and rejected.** Agent-executed evidence legs (ship is human-present; the
validator's independence argument doesn't apply to a replay the human watches);
frontier-only pack replay (that's a re-validation — the old packs are the regression
net); block-on-critical security findings (an adapter's severity labels in charge of
the gate; tiering stays deferred per ADR-0014); present-red-and-let-the-human-decide
(the gate judges shippability of green evidence, not the perfection bar);
deploy-the-pinned-sha-after-tip-moved (breaks "main means everything validated" at the
deploy boundary); pin-time `smoke` flags on pack steps (the engine deriving prod-safety
was overreach); a `release` branch or per-ship marketplace ref pins (a second durable
pointer plus per-ship manifest edits; pull-at-ship makes main-tracking equivalent and
simpler); partial ships (cherry-pick machinery, rejected with ADR-0026); retry loops
against prod (never a second autonomous swing).
