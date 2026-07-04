# Probe pack — ship

Pinned from the four-leg perfect validation of patch_id
`45a64e2969fa33f276c52eb912c64ba5c809f4f3`. Ship lands the mechanical spine
underneath the human-gated ship skill: the ship-record core (`src/ship.js`),
the retry-free corridor decision core (`src/corridor.js`), the CLI edge
(`spine ship status|corridor|book`, `bin/ship.js`), the Ledger's ship-history
bullet (`appendShip`, `src/ledger.js`), the static marketplace-on-main seed
(`.claude-plugin/marketplace.json`), and `skills/ship/SKILL.md` — the
evidence-assembly, approval-gate, freshness, and failure-posture prose that
ties the mechanical parts into one human-gated release corridor. Exercised
black-box against the fixture-repo probe binding — never in-process imports —
with the scripted deploy-target fixture (`test/fixtures/deploy-target.js`)
standing in for `{deploy, rollback, smoke}`; the skill's own session-prose
legs (full evidence-package assembly, the approval gate, freshness
reassembly) are this binding's recorded soft spot for agent-pack surfaces —
named as unrunnable rather than faked, per the binding's own documented
limitation in `docs/ports/ports.md`.

Volatile fields (temp-dir paths, exact dates, commit SHAs) are masked below;
replay re-derives them fresh.

```yaml
steps:
  - action: bring up the fixture-repo probe's populated variant — a non-empty validated frontier (`greet-core`) exists by default
    expected_observation: a temp git repo seeded with committed docs/design/design.md + docs/ledger/ledger.md; `node bin/spine.js ship status` reports {ships:0, next:1, previous_ship_sha:null, latest:null}
  - action: "deployed path — author docs/ships/ship-1.md (evidence + approval, no outcome) pinned to the tip's ship_sha, commit it; `ship status` re-check"
    expected_observation: latest.interrupted is true immediately after commit 1 (approval present, no outcome) — the mid-corridor state a crash would freeze
  - action: "corridor — `spine ship corridor -` with {deploy, rollback, smoke} all pointing at the scripted deploy-target fixture, all green"
    expected_observation: 'concludes {outcome: "deployed", health_signal: true}; journal records exactly [deploy, smoke], no step repeated, no prompts'
  - action: "`spine ship book 1 -` fed the corridor's JSON verbatim; commit 2 + `git tag loop/ship/1`"
    expected_observation: the listed feature flips validated -> shipped in design.md; the Ledger gains exactly one newest-first Run-history bullet (`ship-1 | deployed | features: <id>`); the tag exists; `ship status` now reports outcome deployed, interrupted false
  - action: "rolled-back path — fresh fixture, corridor with smoke forced false throughout"
    expected_observation: 'journal records [deploy, smoke, rollback, smoke] (rollback invoked, one smoke-verify re-run); concludes {outcome: "rolled-back", rollback_verified: false}; `spine ship book` then leaves design.md byte-unchanged, adds one Ledger bullet carrying `rollback_verified: false`, and no tag is created'
  - action: "deploy-failed path — fresh fixture, corridor with deploy forced false, rollback and the verify smoke both succeeding"
    expected_observation: 'journal records [deploy, rollback, smoke] (rollback still invoked on a deploy failure); concludes {outcome: "deploy-failed", rollback_verified: true}; `spine ship book` leaves design.md byte-unchanged, adds one Ledger bullet carrying `rollback_verified: true`, no tag'
  - action: "interrupted re-entry — a fresh ship-<N>.md carrying approval and no outcome"
    expected_observation: "`ship status` reports latest.interrupted true, outcome null; no `spine ship` subcommand exists that resumes a corridor on its own — resumption requires a fresh, explicit `ship corridor` invocation the SKILL.md's Gate 1 explicitly withholds until a human has verified production by hand"
  - action: delta proof — `node bin/spine.js ship status` at the merge-base (pre-ship main) vs the merged tree
    expected_observation: 'the merge-base has no `ship` subcommand at all (usage-string fallback, exit 1); the merged tree recognizes it and prints the status JSON (exit 0)'
  - action: pack replay — inner-loop-workflow.md, ledger-title-preservation.md, model-selection.md, surfacing.md
    expected_observation: every deterministic step reproduces (npm test full suite green, npm run check 0 error/0 warning — feature/contract counts drift with the graph and are unpinned; the Ledger-render preamble/seed cases byte-identical; the model-bindings resolution/precedence/spawn-plumbing/tier-routing all hold; the surfacing fold-in choreography — orient's resolve-parked signal, the kind-stamped menu render, all four escalation-resolve kinds, append-run's newest-first/byte-identical-repeat insertion — all reproduce live against a freshly seeded fixture)
  - action: teardown
    expected_observation: all temp fixture dirs and the merge-base worktree removed; no loop-probe-* dirs left behind; the-loop repo's own tree returns to clean
```

**Unobserved**, named rather than silently skipped — the runtime-probe binding's
recorded soft spot for agent-pack surfaces (`docs/ports/ports.md`): the ship
skill's session-prose legs run only inside a live agent session reading
`skills/ship/SKILL.md`, which the fixture-repo probe cannot host. Specifically
unobserved: the full four-leg evidence-package assembly presented together at
one synchronous gate (integration replay + verbatim security findings +
changelog + live waivers, §3 of the skill); the red-blocks-hard rule's actual
enforcement in a live run (a consistently red integration check stopping the
ship before any approval prompt — the written rule was read against the
acceptance criterion and matches, but no live run exercised it, since the
fixture-repo probe carries no docs/probes/ or docs/ports/ports.md of its own
to replay against); and the freshness reassembly at §5 (a target tip moving
past `ship_sha` between assembly and booking triggers a re-pin and
reassembly) — there is no code path implementing this judgment, only the
skill's own prose, which was read against its acceptance criterion and
matches, but never exercised live. These are the same class of limitation
`docs/probes/surfacing.md` and `docs/probes/inner-loop-workflow.md` already
recorded for the live `claude -p` channel: unrunnable in that installation,
recorded rather than faked (since ship-1's deploy the channel runs via the
namespaced `/the-loop:the-loop` — ship-2 replay, 2026-07-04; the ship skill's
session-prose legs remain unobservable from a fixture either way).

One advisory (not contract-breaking — no acceptance criterion or
task-selected standard cites it) surfaced during the new exercise: `spine
ship book` on a **non-deployed** outcome (`rolled-back` or `deploy-failed`)
writes the ship record's `outcome` to disk *before* attempting the Ledger's
`appendShip` insertion; if the target Ledger has no `## Run history` heading
at all, `appendShip` throws and the command exits 1 with the ship record
already mutated (not byte-unchanged) while the Ledger is left untouched. This
scenario sits outside the five guard conditions t5's acceptance criteria
enumerate and test (all five hold byte-unchanged correctly), and cannot arise
against this repo's own self-hosted target — `docs/ledger/ledger.md` always
carries a `## Run history` section via the render pipeline's own seeding
behavior. Reproduce: seed a fixture-repo populated variant, overwrite
`docs/ledger/ledger.md` with content that has no `## Run history` heading,
author an approved ship record, and run `spine ship book <N> -` with a
`rolled-back` or `deploy-failed` outcome.
