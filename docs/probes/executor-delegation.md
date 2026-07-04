# Probe pack — executor-delegation

Pinned from the four-leg perfect validation of patch_id
`88b13138b8da074e465d3aac7894f2841d88ebb1`. Delegated executors: rote tasks driven
through registered CLI executors (v1 ships grok only) by a verifying Claude driver
agent (`agents/drive.md`), a pure playbook registry (`src/executors.js`,
`executors/<id>.md`), `spine models`'s registry-backed validation, and the workflow's
via-bound routing to `drive`. Exercised black-box against the fixture-repo probe
binding: `spine executors`/`spine models` against fresh out-of-repo fixtures, and a
real, unscripted `claude -p --agent drive` session driving the real `grok` CLI
against a fresh throwaway git fixture — never in-process imports, never the shipped
test suite's own fixtures.

Volatile fields (temp-dir paths, exact durations/costs, commit SHAs, PIDs) are
masked below; replay re-derives them fresh each time.

```yaml
steps:
  - action: bring up the fixture-repo probe's populated variant — `node bin/probe-fixture.js populated`
    expected_observation: prints a temp git repo path, seeded and committed
  - action: "spine executors against the real plugin executors/ dir — `node bin/spine.js executors`"
    expected_observation: prints the registry keyed by id; grok appears with worktree driver-made and models [grok-build, grok-composer-2.5-fast]
  - action: "spine models hard-fail A — a fresh defaults fixture binding a role's via to an unregistered executor id, against a fresh executors-dir fixture"
    expected_observation: exits 1; stderr names `error unregistered-executor` and the offending role/via; no table on stdout
  - action: "spine models hard-fail B — a fresh defaults fixture binding a role's model outside the named (registered) playbook's models list"
    expected_observation: exits 1; stderr names `error model-outside-playbook` and the offending role/model/via; no table on stdout
  - action: "spine models warn A/B/C in one fixture — via on a role outside {build.rote, build.standard, build.complex}; via on build.standard; effort on a via-binding whose executor has no effort_flag"
    expected_observation: exits 0; three stderr lines, one per code (`no-routing-surface`, `off-rubric-tier`, `ignored-effort`), each `warn <code>: <message> (<where>)`; the resolved table still prints to stdout
  - action: "spine executors against a fixture executors-dir with a malformed playbook (e.g. empty models array)"
    expected_observation: exits 1; stderr names the file and the offending field
  - action: "spine executors against a nonexistent dir"
    expected_observation: prints `{}`, exit 0
  - action: "real executor availability + auth smoke — `grok --version`; `grok -p \"say PONG\" --max-turns 1`"
    expected_observation: a version string; the auth smoke's stdout contains exactly `PONG`
  - action: >-
      live, unscripted end-to-end drive — copy agents/drive.md verbatim into a fresh
      throwaway git fixture's `.claude/agents/drive.md`; seed the fixture with a
      one-rote-task plan (a single pure function, no standards selected) and a design.md
      node at status `planned`; run `claude -p --agent drive --model sonnet
      --permission-mode bypassPermissions --max-budget-usd 3` from the fixture root with
      `CLAUDE_PLUGIN_ROOT` pointed at this checkout and stdin/prompt carrying exactly the
      four pinned lines (`feature:`, `task:`, `executor: grok`, `executor-model:
      grok-build`)
    expected_observation: >-
      `loop/<feature-id>` gains exactly one new commit, `<feature-id>/<task-id>:
      <title>`, touching exactly the task's contracted footprint with the tests
      passing on that commit's own tree; the assembled prompt file (read before
      disposal) carries the task-contract slice, the full build constitution, the
      standards note, the imperative footer (one test per criterion, red-then-green,
      footprint-only, no suppression, no test deletion, the exact commit message),
      and the executor's own lore advice; the live invocation observed via `ps` matches
      the playbook's pinned template verbatim, running inside a `git worktree add
      --detach` worktree; after the run, the worktree is gone from `git worktree list`
      and `.claude/worktrees/` no longer exists; HEAD is left on the fixture's target
      branch; a booking commit lands there flipping the feature's status planned→building,
      re-rendering the Ledger, and folding a completion report whose `summary` opens
      verbatim `Driven via grok/grok-build — `; `deviations: []` on a clean run
  - action: delta proof — at the integration target's own pre-diff tip, check for agents/drive.md, executors/grok.md, protocols/branch-and-booking.md, and spawnDrive/isViaBound in workflows/inner-loop.js
    expected_observation: all three files "exist on disk, but not in" the pre-diff tip; zero matches for spawnDrive/isViaBound — the driven-execution capability is entirely absent pre-diff, fully functional post-diff
  - action: teardown — remove every fixture repo, worktree, and temp probe dir created above
    expected_observation: no loop-probe-* or scratch fixture dirs left behind
```

**Unobserved**, named rather than silently skipped: live reproduction of
`agents/drive.md`'s four typed failure branches (truncation-then-retry,
mechanical-defect-then-retry, judgment-defect-immediate-park, second-failure-parks-
with-both-runs'-evidence) — reliably eliciting a chosen defect shape from a live,
non-deterministic executor CLI is not controllable from this environment absent an
executor-stub mechanism the fixture-repo probe binding doesn't provide (the
feature's own design narrative names this exact soft spot). The launch-leg
pre-flight's live "stops the launch with nothing run" enforcement, exercised end to
end through an actual `/the-loop` invocation, rather than by direct reading against
the criterion text. grok's `--worktree`/`--worktree-ref` native mode — already the
subject of this feature's own t9 probe record (`docs/research/2026-07-03-grok-
native-worktree.md`), out of this pack's scope to re-observe.
