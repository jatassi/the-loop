# Validation procedure — run-commands-rust

Judge-only validation (grok/grok-4.5) against target `rust-replatform` on
worktree `integrate--run-commands-rust`, merging in order: `loop/run-commands-rust`,
`loop/run-commands-rust--hooks-drift-parity`, `loop/run-commands-rust--calibration-summarize`,
`loop/run-commands-rust--context-core`, `loop/run-commands-rust--workflow-splice`,
`loop/run-commands-rust--worktree-verbs`, `loop/run-commands-rust--prepare-execution-context`.
Two purely-additive textual merge conflicts (`cli/src/lib.rs`,
`cli/src/commands/mod.rs`, `test/oracle/pending.json`) were resolved by the
calling agent during assembly and reviewed by the judge as part of the diff;
one stale test assertion in `test/oracle/driver.test.js` (written by the
`prepare-execution-context` branch before it knew the other branches would
also land) was reconciled to the merged reality (`pending.json` is now `[]`).

## Bring-up

From the worktree root:

```bash
cargo build --release
npm ci   # only if node_modules missing/stale
node bin/create-sample-repo.js
```

Produces `target/release/the-loop` (Rust binary) and, for the JS-side probe,
a temp fixture git repo seeded with `feature-graph.md` + `architecture.md` +
design docs. A second, hand-seeded JSON-era `feature-graph.json` fixture was
built alongside it to exercise Rust-vs-JS parity on the same scope (the
canonical sample-repo helper emits the YAML-era graph only).

## Exercise

### Criterion 1 — prepare-execution-context gates + parity

```bash
node plugin/bin/the-loop.js prepare-execution-context --features greet-cli --target-branch main
# observed: exit 0, cli = node "…/the-loop.js", preparedAt ISO-8601

node plugin/bin/the-loop.js prepare-execution-context --features ghost --target-branch main
node plugin/bin/the-loop.js prepare-execution-context --features greet-farewell --target-branch main
# observed: both exit 1, empty stdout (unknown id; not-designed scope gate)

./target/release/the-loop prepare-execution-context --features greet-cli --target-branch main
# observed: exit 0; JSON-equal to the JS output after masking preparedAt/cli/covers;
# cli = "the-loop"
```

Corroborated by the oracle's `prepare-execution-context` cases (happy path +
four gate refusals: invalid graph, scope gate, plan validation, model-binding
validation) — 5 cases, all pass, byte/JSON-comparing Rust output to the JS
reference with only the sanctioned mask applied.

### Criterion 2 — `--script-out` splice parity and shape gates

```bash
node plugin/bin/the-loop.js prepare-execution-context --features greet-cli \
  --target-branch main --script-out /tmp/js-script.js
./target/release/the-loop prepare-execution-context --features greet-cli \
  --target-branch main --script-out /tmp/rust-script.js
# observed: masked_equal true after masking preparedAt/cli/covers inside the
# embedded context; meta description line and EMBEDDED_CONTEXT line both spliced
```

Oracle case `--script-out writes spliced workflow script byte-identical to the
JS reference modulo the sanctioned set` and `upstream scope-gate refusal with
--script-out writes nothing` both pass (2 cases).

### Criterion 3 — worktree-create / worktree-remove

```bash
./target/release/the-loop worktree-create loop/probe-1 --base-branch main
./target/release/the-loop worktree-create loop/probe-1 --base-branch main
# observed: created:true then created:false (idempotent), path/branch present

# bound worktreeSetup case: marker-writing binding
# observed: setup command ran in the new worktree, marker file present

# bound-failure case: non-zero exit binding
# observed: exit 1, "worktree provisioning failed" message naming command/path/
# layer/reason/stderr tail; worktree torn down (dir gone), branch survives

./target/release/the-loop worktree-remove <path>
# observed: dir removed, pruned

# cwd-inside-target case:
cd <target-dir> && ./target/release/the-loop worktree-remove <target-dir>
# observed: exit 1, "refusing: cwd is inside <dir> — cd out of the worktree first"
```

Corroborated by oracle cases: `worktree-create` create-new / idempotent /
missing-branch refusal, `worktree-remove` by-path / by-branch / unknown
refusal, plus the bound-provisioning pair
(`worktree-create — bound-success-runs-setup-in-worktree`,
`worktree-create — bound-failure-tears-down-worktree`) — 8 cases, all pass.

### Criterion 4 — calibration-summarize

```bash
# paired runs/*.json corpus (two well-formed records)
node plugin/bin/the-loop.js calibration-summarize
./target/release/the-loop calibration-summarize
# observed: docs/calibration/index.md byte-identical between the two runs

# malformed-record corpus (one bad.json)
./target/release/the-loop calibration-summarize
# observed: exit 1, message names bad.json, no index.md written
```

Corroborated by oracle cases `calibration-summarize — happy path` and
`calibration-summarize — refusal: malformed record` (2 cases, pass).

### Criterion 5 — config-surface drift catch-up

```bash
node plugin/bin/the-loop.js hooks-list --compact
./target/release/the-loop hooks-list --compact
# observed: byte-identical line-for-line output, including a worktreeSetup
# line: fallback {"provisioning":"none"}, provenance "fallback"

./target/release/the-loop hooks-set worktreeSetup project '{"command":"true"}'
# observed: settings.json written, family accepted (not rejected as unknown)
```

Corroborated by the full oracle corpus:

```bash
ORACLE_TARGET=rust node --test test/oracle/oracle.test.js
# 54 pass, 0 fail, 0 pending (test/oracle/pending.json is [])
```

## Expected observations (all met)

| Check | Expected | Observed |
| --- | --- | --- |
| prepare-execution-context gate refusals | exit 1, empty stdout | confirmed (invalid graph / scope / plan / model-binding) |
| prepare-execution-context success | JSON-equal modulo sanctioned mask | confirmed, `cli` = `the-loop` |
| `--script-out` splice | byte-identical modulo mask, quote-safe | confirmed |
| `--script-out` shape gate | exit 1, nothing written | confirmed (oracle case) |
| worktree-create idempotency | `created:false` on re-run | confirmed |
| worktree-create provisioning | bound command runs, cwd = new worktree | confirmed |
| worktree-create failure/timeout | teardown + exit 1 + named message | confirmed |
| worktree-remove | path/branch resolution + prune | confirmed |
| worktree-remove cwd guard | refuses inside target | confirmed |
| calibration-summarize | byte-identical index.md | confirmed |
| calibration-summarize malformed | exit 1 naming file, no write | confirmed |
| hooks-list --compact | line-for-line JS parity | confirmed |
| hooks-set worktreeSetup | accepted family | confirmed |
| full oracle corpus (rust target) | green, pending empty | 54 pass / 0 fail / 0 pending |

## Teardown

```bash
rm -rf <sample-repo path from node bin/create-sample-repo.js>
rm -rf <hand-seeded JSON fixture dir>
rm -rf <calibration paired-corpus temp dirs>
```

All fixture/worktree-probe directories created during exercise were removed;
none are tracked or committed.

## Integrity

- `cargo clippy --all-targets -- -D warnings` clean under the workspace's
  `deny`d `clippy::all`/`pedantic`/`nursery`/`cargo` and
  `allow_attributes_without_reason` lints; the four `#[allow(clippy::cast_*)]`
  attributes in the calibration renderer are narrowly scoped to small-integer
  percent/median float casts and each carries a `reason = "..."`.
- `npm run lint` (eslint) clean; no `eslint-disable` and no lint-config edit
  in the diff.
- No deleted or weakened test in the diff. The one test-assertion change
  (`test/oracle/driver.test.js`) strengthens the pending-allowlist contract
  (`assert.deepEqual(pending, [])`) rather than loosening coverage — oracle
  cases still exercise every command via `test/oracle/cases/*.js`.
- Oracle cases bite: `--script-out` masks only `preparedAt`/`cli`/`covers`
  then byte-compares to the JS reference; `calibration-summarize` compares
  `index.md` to the JS `renderIndex` output; `worktree-create` bound cases
  check a marker file written by the bound command and confirm teardown on
  failure — none of these pass without exercising the ported surface.
