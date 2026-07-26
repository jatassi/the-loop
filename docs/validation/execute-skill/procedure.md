# Validation runbook — execute-skill

Judge pass against `main...HEAD` on the assembled `integrate--execute-skill`
worktree. The footprint is prose plus its executable acceptance: one new skill
(`plugin/skills/execute/SKILL.md`), the launch leg deleted from
`plugin/skills/begin/SKILL.md`, one hand-off sentence rewritten in
`plugin/skills/diagnose/SKILL.md`, and two test files
(`test/execute-skill.test.js` new, `test/skills-and-command-sweep.test.js`
re-pointed). Because the load-bearing behaviours here are *discoverability* (a
tier-0 description firing) and *gating* (the human-confirm branch), both are
exercised with blind headless probes, not only read; and every CLI claim the
skill body makes is exercised against the real binary on a throwaway fixture.

## Bring-up

```bash
# From the integration worktree root
cargo build --release                   # target/release/the-loop — the node suite spawns it
node bin/create-sample-repo.js          # → configured fixture, prints its path
```

Fixture used: `/var/folders/.../loop-probe-gimmUC` (3 features —
`greet-core` validated, `greet-cli` designed, `greet-farewell` proposed).

## Exercise

### 1 · Integrity gates and suites

```bash
git diff main --stat                              # 5 files, +375/-66; no source deletions
git diff main -- eslint.config.js package.json package-lock.json Cargo.toml   # empty
git diff main | grep -n "eslint-disable|@ts-ignore|skip("                     # no hits
npm test                                          # node suite
cargo test --release                              # Rust suite
npm run lint                                      # eslint
cargo fmt --check && cargo clippy --all-targets
./target/release/the-loop check                   # graph
```

No lint suppression, no lint-config edit, no deleted test. The two pinned tests
named in the design were re-pointed, not hollowed: `skills-and-command-sweep`
criterion 2 kept every negative assertion and *broadened* it to run over both
`begin` and `execute`, and the run-presentation criterion-4 `scriptPath` guard
was re-aimed at the real canonical engine path (`cli/assets/execution-pipeline.js`,
where `fix-execution-pipeline-name-entrypoint` already moved it) rather than
deleted; `test/execute-skill.test.js` adds a strictly stronger guard
(`!/workflows\/execution-pipeline\.js/` anywhere in the skill, not just on a
`scriptPath` line). `test/consumption-lifecycle.test.js` was left untouched and
still passes honestly: `/begin` retains the `--graph-path` /
`status` / `prepare-execution-context` / `set-status` / `check` subcommand list
in its bound-store section, which is what that criterion asserts.

### 2 · The tests bite (mutation probe)

Seven mutations applied one at a time, each reverted afterwards, running
`node --test test/execute-skill.test.js test/skills-and-command-sweep.test.js
test/consumption-lifecycle.test.js` between (baseline 17 pass / 0 fail):

| mutation | casualties |
|---|---|
| strip the `no `args`` rule + rationale from `execute` | 2 |
| delete the "A model reached for it" gate branch | 1 |
| delete the whole bound-artifact-stores section | 1 |
| append `See plugin/workflows/execution-pipeline.js.` to `execute` | 1 |
| re-add the `--script-out` recipe to `/begin` | 1 |
| revert diagnose's hand-off to the bare CLI fragment | 1 |
| delete `plugin/skills/execute/SKILL.md` | 7 |

Every criterion has at least one assertion that dies when its subject is removed.

### 3 · The CLI claims the body makes (fixture, criteria 1 / 4 / 5)

Run with `cwd` = the fixture, `CLAUDE_PLUGIN_ROOT` = the worktree's `plugin/`,
driving the built binary from outside:

```bash
the-loop status --json                                    # → eligibleSet: ["greet-cli"]
the-loop prepare-execution-context --features greet-cli \
  --target-branch main --script-out $S/run.js             # exit 0
the-loop prepare-execution-context --features greet-farewell --target-branch main --script-out …
the-loop prepare-execution-context --features nope        --target-branch main --script-out …
the-loop prepare-execution-context --features greet-cli   --script-out …          # no --target-branch
the-loop prepare-execution-context --features greet-cli --target-branch main \
  --script-out $S/r5.js --graph-path $S/snapshot.json     # exit 0
```

### 4 · Live gate probe (criterion 4)

Three blind headless probes, `claude -p --model sonnet --strict-mcp-config`, each
handed only the shipped skill text plus a situation, asked for (1) next action,
(2) does it ask the human before launching, (3) does it propose an alternative
route.

- **p1 — human typed `/the-loop:execute fix-login-crash`**
- **p2 — human typed `/the-loop:execute` bare, with `eligibleSet: []`**
- **p3 — the diagnose session (a *model*) reached for it with `fix-login-crash`**

### 5 · Live discovery probe (criterion 1's tier-0 description)

A blind index-only probe: build a skill index from the frontmatter
`name`/`description` of every `plugin/skills/*/SKILL.md` (no bodies), hand a
fresh headless agent a request, and ask which single skill it would load.
Requests used: "I just wrote up the bug as fix-login-crash. Run the fix now.",
"Launch the pipeline on the eligible set.", "Build greet-cli and greet-core now."

### 6 · Self-containment sweep (criterion 6)

```bash
grep -rn "script-out|scriptPath|prepare-execution-context leg" plugin/
grep -rn "ADR-|docs/adr/|CLAUDE.md|plugin/workflows/" plugin/skills/execute/
```

## Expected observations

- **Criterion 1** — `plugin/skills/execute/SKILL.md` exists; frontmatter
  `name: execute`, `argument-hint: "[feature-id,feature-id,…]"`, `allowed-tools:
  Bash(the-loop *), Bash(git *), Read, Workflow`. Body quotes
  `the-loop prepare-execution-context --features <id,id,…> --target-branch <ref>
  --script-out <session-scratch path>`, binds `scriptPath` to the `--script-out`
  path, states "no `args`" *with* the round-trips-through-the-token-stream
  reason, and relays all four outcomes.
- **Criterion 2** — `/begin` contains no `--script-out`, no `scriptPath`, no
  `stalled` relay, no "prepare-execution-context leg"; its Routes line reads
  ``advance-eligible-set` / `build` jump → the `execute` skill`. A sweep of
  every shipped `SKILL.md` finds `--script-out` on exactly one file:
  `plugin/skills/execute/SKILL.md`. No `plugin/agents/*` carries it either.
- **Criterion 3** — diagnose §6 reads "offer to launch the fix now: the `execute`
  skill, scoped to `fix-<slug>`…" and no longer names a bare
  `the-loop prepare-execution-context` fragment.
- **Criterion 4** — p1 answered "(1) run `prepare-execution-context --features
  fix-login-crash --target-branch main --script-out …` (2) NO — the human typed
  this invocation, the confirm is already given (3) NO". p2 answered "(1) run
  nothing further — report that `eligibleSet` is empty … (3) NO — deciding what
  else the project could do next belongs to whoever asked". p3 answered "(2) YES
  — I ask the human to confirm the resolved scope (`fix-login-crash`) and target
  branch (`main`) before launching, since this invocation came from the model".
  Against the binary, `status --json` really does expose `eligibleSet`, the field
  the body names.
- **Criterion 5** — the skill's bound-store section carries the whole launch
  half: nondefault `artifactStores.features`, `docs/adapters/features.md` Access
  path, "materialize"/"ephemeral snapshot"/"gitignored"/"never committed",
  `--graph-path`, teardown, and the unreachable-surface can't-run with "Never
  fall back to local". Against the binary: `prepare-execution-context
  --graph-path <snapshot>` succeeds and derives the context from the snapshot;
  with the default binding (no `--graph-path`) the emitted execution context is
  byte-identical to the snapshot-derived one modulo `preparedAt`, and every
  sentence of `/begin`'s deleted leg is present verbatim in the extracted body
  (12 sentences pinned in `LEG_SENTENCES`).
- **Criterion 6** — no `ADR-` citation, no unbraced `$CLAUDE_PLUGIN_ROOT`, no
  `plugin/workflows/` path, no `docs/adr/` `docs/plans/` `docs/designs/`
  `CLAUDE.md` `README.md` reference, no author/org mention outside the installer
  URL, and no `<other> skill` deferral anywhere in the body. Write-skills
  conformance: folder name matches frontmatter `name`, triggers live in the
  description (which fires on "run the fix", "launch", "pipeline", "build",
  "execute") rather than a "When to use" section. The discovery probe confirms
  the description actually fires: all three requests routed to `the-loop:execute`
  from frontmatter alone.

### Refusal behaviour observed (backing criterion 1's "refuses with reasons")

| call | exit | stdout | stderr |
|---|---|---|---|
| `--features greet-farewell` (proposed) | 1 | 0 bytes | `error not-designed: feature is proposed, not designed … / spine: scope gate failed — nothing prepared` |
| `--features nope` | 1 | 0 bytes | `error unknown-feature: scope names unknown feature "nope"` |
| no `--target-branch` | 1 | 0 bytes | `spine: usage: … --features <id,id,…> --target-branch <ref> …` |

The happy path wrote `$S/run.js` with `meta.description` spliced to
`"greet-cli → main"` and `EMBEDDED_CONTEXT` as a JS literal — exactly what the
body says `--script-out` produces.

### Carried-forward inaccuracy (pre-existing, not introduced here)

`the-loop status`, `set-status`, and `check` take the alternate graph as a
**positional** `[PATH]`, not `--graph-path`; only `prepare-execution-context`
has the flag (and under `--json`, `status`'s positional is a *repo root*, so a
snapshot graph file cannot be pointed at it at all). The "pass `--graph-path` to
every graph-consuming subcommand" phrasing predates this feature — it ships today
in `/begin`'s bound-store section, was accepted at `ports-adapters-full`'s own
validation (whose runbook used the positional form), and is pinned by
`test/consumption-lifecycle.test.js`. The extraction inherits it verbatim, as
criterion 5's "byte-identical to today's leg" requires. Worth a follow-up fix
across `/begin`, `execute`, and `validate.md` together; out of scope for this
feature, which changes no CLI.

## Teardown

```bash
rm -rf /var/folders/.../loop-probe-gimmUC     # the fixture
rm -rf $SCRATCH/probe $SCRATCH/*.js $SCRATCH/*.out $SCRATCH/snapshot.json
git status --porcelain                        # clean before the squash
```
