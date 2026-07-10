# Validation procedure — rust-crate-scaffold

Judge-only validation against target `rust-replatform` on worktree
`integrate--rust-crate-scaffold` (merged `loop/rust-crate-scaffold`). No source
edits, commits, or hook status flips.

## Bring-up

From repo root (this worktree):

```bash
cargo build --release
```

Produces workspace binary `target/release/the-loop` from the `cli/` member crate
(`the-loop` 0.1.0). Workspace root has no `cli/target/` layout; Cargo places
artifacts under the workspace `target/`.

Also inspected:

- `git diff rust-replatform...HEAD` (8 files: `Cargo.toml`, `cli/*`,
  `.claude/settings.json`, `.gitignore`, `Cargo.lock`)
- Integrity scan for `eslint-disable` / reason-less `#[allow]` / lint downgrades
  in the landed diff (none; sole `#[allow(dead_code, reason = "...")]` carries a
  reason for the serde JSON-spine placeholder)

## Exercise

### Criterion 1 — release binary `--version`

```bash
./target/release/the-loop --version
# observed: "the-loop 0.1.0", exit 0

./target/release/the-loop not-a-real-command
# observed: exit 2, empty stdout, stderr includes "Usage: the-loop"
```

Corroborating suite (process-level, not in-process only):

```bash
cargo test
# lib unit tests: crate_version_*, version_flag_*, unknown_subcommand_* (3 ok)
# cli/tests/cli_process.rs: version_prints_crate_version_and_exits_zero,
#   unknown_subcommand_exits_nonzero_usage_on_stderr_empty_stdout (2 ok)
```

### Criterion 2 — workspace lint profile + fmt/clippy/test

`Cargo.toml` `[workspace.lints]`:

- rust `warnings = "deny"`
- clippy `all` / `pedantic` / `nursery` / `cargo` at `deny`
- `allow_attributes_without_reason = "deny"`
- `cli/Cargo.toml` has `[lints] workspace = true`

```bash
cargo fmt --check          # exit 0
cargo clippy --all-targets # exit 0, Finished clean
cargo test                 # 5 tests passed (3 unit + 2 process)
```

### Criterion 3 — dual-toolchain hooks + npm green

```bash
node "$(git rev-parse --show-toplevel)/plugin/bin/the-loop.js" hooks-list
```

Observed:

- `testHarness`: `value` = `npm test && cargo test`, `provenance` = `project`
- `lint`: `value` = `npm run check && cargo fmt --check && cargo clippy --all-targets`,
  `provenance` = `project`

End-to-end resolved commands:

```bash
npm test && cargo test
# npm: 269 pass / 0 fail; cargo: 5 pass / 0 fail; overall exit 0

npm run check && cargo fmt --check && cargo clippy --all-targets
# check: OK 40 features + eslint clean; fmt/clippy exit 0; overall exit 0
```

Standalone `npm test` also green (269/269).

## Expected observations (all met)

| Check | Expected | Observed |
| --- | --- | --- |
| Release binary exists | `the-loop` from `cli/` | `target/release/the-loop` |
| `--version` | crate version, exit 0 | `the-loop 0.1.0`, exit 0 |
| Unknown argv | nonzero, empty stdout, usage on stderr | exit 2, empty stdout, Usage line |
| Workspace lints | deny warnings + clippy groups + reason-ful allow | present; clippy clean under deny |
| fmt / clippy / test | all pass | all pass |
| hooks-list dual toolchain | project provenance, npm+cargo in both | confirmed |
| Hook command strings | both exit 0 | confirmed |
| npm test | green | 269 pass |

## Teardown

No fixture-repo temp directory was created (Rust surface exercised via release
binary + cargo process tests; JS suite run in-worktree). No process teardown
required beyond exiting the shells used above. Validation procedure file is new
untracked content only — not staged or committed.

## Integrity

- Diff adds tests only (`cli/tests/cli_process.rs` + lib unit tests); no deleted
  or weakened tests.
- No eslint-disable / lint-config downgrade in the feature diff.
- Clippy `#[allow]` includes `reason = "..."`.
- Process tests spawn `CARGO_BIN_EXE_the-loop` and assert real version string and
  stderr usage — surface is exercised, not tautological.
