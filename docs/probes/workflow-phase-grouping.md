# Probe pack — workflow-phase-grouping

Pinned from the four-leg perfect validation of patch_id
`d585a58c4297b12f32787f3d516c5d478977a390`. The `/workflows` progress tree flips from
per-feature grouping to coarse SDLC-phase grouping: every `workflows/inner-loop.js`
spawn's `phase` opt now names its coarse phase (`Plan`/`Build`/`Validate` — build and
drive under `Build`, derive and validate under `Validate`), `meta` declares the three
phases as title-only entries on its pinned single line, and the `BoundaryResult`
stalled entry's `phase` field renames to `agent`. Every acceptance criterion here is
pinned by source-shape and shim unit tests (`test/inner-loop-*.test.js`,
`test/inner-loop-meta.test.js`) rather than by `bin/spine.js` CLI output — a probe-
binding divergence the feature's own design notes and this validation's expectation
sheet both name (the script never calls `phase()`, so declared-vs-first-use box order
and meta-title matching for `opts.phase` strings are implied, not runtime-observable
through this binding). This pack's replay leans on that deterministic unit-test
channel; the live `claude -p "/the-loop"` channel and a live desktop-eyeball of the
`/workflows` tree grouping remain this binding's recorded soft spot, named rather than
faked.

Volatile fields (temp-dir paths, exact durations, commit SHAs) are masked below;
replay re-derives them fresh.

```yaml
steps:
  - action: bring up the fixture-repo probe's populated variant — `node bin/probe-fixture.js populated`
    expected_observation: prints a temp git repo path seeded with a committed docs/design/design.md + docs/ledger/ledger.md
  - action: shim phase-sequence assertions — `node --test test/inner-loop-happy.test.js test/inner-loop-halt.test.js test/inner-loop-park.test.js test/inner-loop-drive.test.js test/inner-loop-remediation.test.js`
    expected_observation: >-
      all pass; every fixture's `spawns.map((s) => s.opts.phase)` deepEquals the coarse
      mapping (plan→'Plan', build→'Build', drive→'Build', derive→'Validate',
      validate→'Validate') applied to that fixture's own spawn order, paired with an
      added `spawns.map((s) => s.opts.label)` deepEqual pinning the full expected label
      list (feature id, task id where one rides, `[<resolved-model>]` prefix) — proving
      the feature id and resolved model still ride the label as the sole disambiguator
  - action: stalled-entry rename assertions — same test run, `result.stalled` entries
    expected_observation: each stalled record carries `agent` (the spawned agentType — `plan`/`validate` observed) in place of `phase`; no stalled record anywhere carries a `phase` key
  - action: source-shape meta pin — `node --test test/inner-loop-meta.test.js`
    expected_observation: >-
      passes; extracts `export const meta = { ... };` from its single physical line via
      a regex with no `s` flag (so a multi-line meta breaks the match) and asserts
      `phases` deep-equals `[{ title: 'Plan' }, { title: 'Build' }, { title: 'Validate' }]`
      in exactly that order, title-only
  - action: generic shim mechanics, unaffected — `node --test test/workflow-shim.test.js`
    expected_observation: all 4 pass; its own fixture scripts keep their arbitrary phase strings, untouched by this diff
  - action: surfaces — `grep -n "phase\|agent" commands/the-loop.md skills/adjust/SKILL.md`
    expected_observation: >-
      the relay/docket stalled-entry bullets read `feature`/`agent`/`note`; every other
      `phase` reference in both files (session-phase jumps, the escalation record's own
      `phase` field — plan|build|validate, where a park happened) is untouched
  - action: Dictionary cross-check — `grep -n -i stall docs/dictionary/DICTIONARY.md`
    expected_observation: the stall entry already reads `{feature, agent, note}` (landed at design time, out of this feature's build footprint)
  - action: delta proof — copy the diff's test files into a worktree at the merge-base (main's pre-merge tip) and run the same `node --test` invocation there
    expected_observation: >-
      fails — the old source still emits `opts.phase` as the feature id (e.g. `'gamma'`,
      `'alpha'`) instead of the coarse mapping, and stalled records still carry `phase`
      instead of `agent`; the identical invocation on the merged tree passes
  - action: deterministic corroboration — `npm test` and `npm run lint`
    expected_observation: >-
      npm test 232/233 (the one failure, test/design-md.test.js's design_version pin,
      is pre-existing and unrelated — it reproduces byte-for-byte on the target's own
      pre-diff tip, per the same stale-drift class docs/probes/surfacing.md and
      docs/probes/ship.md already recorded for the feature/contract-count pin);
      npm run lint reports no issues
  - action: pack replay — inner-loop-workflow.md, ledger-title-preservation.md, model-selection.md, surfacing.md, executor-delegation.md, ship.md
    expected_observation: >-
      every deterministic step reproduces: `npm run check` prints 0 error(s)/0
      warning(s) (feature/contract counts drift with the graph, unpinned by design);
      the ledger-render preamble-preservation and title-seed cases hold byte-identical;
      `spine models` resolves the shipped table with every role at provenance `default`;
      the surfacing fold-in choreography (orient's `resolve-parked` signal, the
      kind-stamped Ledger menu render, all four `escalation resolve` kinds including the
      retry dedup flip, `ledger append-run`'s newest-first/byte-identical-repeat
      insertion) all reproduce live against freshly seeded fixtures; `spine executors`
      still reports the grok playbook, `grok --version` and the auth smoke both succeed;
      `spine ship status` on a fresh fixture reports the zero-ships shape
  - action: teardown — remove every temp fixture dir and the merge-base worktree
    expected_observation: no loop-probe-* temp dirs or stray worktrees left behind
```

**Unobserved**, named rather than silently skipped: the live `claude -p "/the-loop"`
channel's actual `/workflows` desktop-tree rendering (spawns pooling into Plan/Build/
Validate boxes in declared-vs-first-use order, labels disambiguating features in a
multi-feature scope) — the fixture-repo probe binding drives `bin/spine.js` and the
deterministic shim channel, never the desktop tree itself, and build agents hold no
Workflow tool to observe it from inside a task; the feature's own design notes already
mark this "pending a desktop eyeball," non-blocking. Also unobserved: `spine plan
check`'s tier-validation warn/error paths and the shim's layer-precedence/tier-routing
steps from `docs/probes/model-selection.md` (seeding a tiered plan into the fixture-
repo probe was out of proportion to this diff's zero footprint overlap with
`config/model-bindings.json` or the tier machinery; corroborated instead by the
project's own passing test suite) — and `docs/probes/executor-delegation.md`'s live,
unscripted end-to-end `claude -p --agent drive` session and `docs/probes/ship.md`'s
full corridor/book live flow, both this binding's recorded costly/least-deterministic
soft spot for agent-pack surfaces, substituted with their fast deterministic legs
(`spine executors`, the grok auth smoke, `spine ship status`) plus the project's own
passing test suite given zero footprint overlap with this diff.
