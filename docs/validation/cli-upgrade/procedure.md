# Validation procedure — cli-upgrade

Judged against target `main` on worktree `integrate--cli-upgrade` (merged
`loop/cli-upgrade`, `--t1`…`--t6` in order; every merge clean, no textual
conflict — the only Cargo.toml overlap was a relocation of the `[features]`
table, resolved by the merge itself). `docs/plans/cli-upgrade/` removed before
the squash. Everything below was run from the integration worktree root.

## Bring-up

```bash
cargo build --release            # target/release/the-loop — the node fixture tests spawn it
cargo build --features upgrade   # the feature-on binary the exercise installs as the "older" build
which dist sha256sum rustc python3
```

Preconditions the exercise needs on PATH: `cargo`, `rustc`, `sha256sum` (the
tool the generated shell installer verifies downloads with — without it the
installer *skips* verification and criterion 2 becomes vacuous), `tar` with xz
support, `curl`, `python3` (only for the hand-driven replay's static server),
and `dist` 0.32.0 for the release-build check.

Integrity scan before judging:

- Full diff read: `git diff main` — 16 files, +5179/-2 (no production file
  outside `cli/src/{lib,receipt,commands/mod,commands/upgrade}.rs`,
  `cli/Cargo.toml`, `dist-workspace.toml`).
- Zero new `[dependencies]` entries (clap + serde + serde_json unchanged);
  asserted in-tree by `cargo_and_dist_config_declare_a_default_off_upgrade_feature`.
- No `eslint-disable`, no lint-config edit, no deleted or weakened test. One
  suppression added: `#![allow(dead_code, reason = …)]` in
  `cli/tests/support/mod.rs`, scoped to the shared test-support module because
  two test binaries each use a subset of its helpers; carries a reason as the
  workspace's `allow_attributes_without_reason = "deny"` requires.
- `cli/tests/fixture_release.rs:stops_serving_when_handle_is_dropped` was
  narrowed by `loop/cli-upgrade--t5`'s follow-up commit — it dropped an unsound
  "the port rebinds" claim and kept (in fact strengthened) the observable one:
  the live server accepts a connection while its handle is held and refuses
  once dropped. Not a weakening.

## Exercise

### Mechanical gates

```bash
npm test                                     # 218 pass, 0 fail
npm run check                                # the-loop check → OK 52 features; eslint clean
cargo test                                   # 247 pass (feature off)
cargo test --features upgrade                # 266 pass (feature on: +7 cli_process, +11 fixture_release, +3 upgrade_fixture)
cargo clippy --all-targets                   # clean under deny(warnings, clippy::all/pedantic/nursery/cargo)
cargo clippy --all-targets --features upgrade # clean
```

### Do the tests bite? (mutation check)

`run_installer` in `cli/src/commands/upgrade.rs` was temporarily stubbed to
return success without executing the installer, then the file restored from git:

- `upgrade_fixture::happy_swap_…` FAILED — `to` came back `0.5.1` instead of the
  fixture's newer version.
- `upgrade_fixture::corrupt_archive_…` FAILED — a corrupt archive wrongly
  reported success.
- `cli_process::upgrade_with_feature::happy_path_…` and
  `…failing_installer_names_the_step_…` FAILED.

So the swap and the failure posture are genuinely observed by the suite, not
assumed.

### Hand-driven exercise (independent of the committed harness)

The committed harness (`cli/tests/support/fixture_release.rs` +
`upgrade_fixture.rs`) is the replayable form of this exercise; it was also
reproduced by hand to confirm the harness is not the thing being tested. Steps:

1. Serve a fixture release directory: `python3 -m http.server 8731 --bind
   127.0.0.1 --directory <root>/srv`.
2. Publish an "older" release into it: `tar -cJf the-loop-aarch64-apple-darwin.tar.xz`
   over a single top-level dir holding the `--features upgrade` binary;
   `sha256sum -b` into the `.sha256` sidecar; copy the committed installer
   template `cli/tests/fixtures/installers/the-loop-installer.sh`, rewrite its
   `APP_VERSION` to `1.0.0-older`, and insert `_checksum_style="sha256"` /
   `_checksum_value=<hash>` into the `the-loop-aarch64-apple-darwin.tar.xz`
   case arm (cargo-dist only embeds checksums for arms built in the same run,
   so an unpatched template verifies nothing).
3. Install it with the isolation env: `THE_LOOP_DOWNLOAD_URL=http://127.0.0.1:8731`,
   `THE_LOOP_INSTALL_DIR=<root>/opt`, `THE_LOOP_NO_MODIFY_PATH=1`,
   `XDG_CONFIG_HOME=<root>/config`, `HOME=<root>/home`, `CARGO_HOME=<root>/cargo`.
4. Run `<root>/opt/bin/the-loop upgrade` under that same env for each case.

Observed:

- **Install leg** — installer exited 0, wrote
  `<root>/config/the-loop/the-loop-receipt.json` with
  `"version":"1.0.0-older"`, `"install_layout":"cargo-home"`,
  `"provider":{"source":"cargo-dist","version":"0.32.0"}`, and left a runnable
  binary at `<root>/opt/bin/the-loop`.

- **Criterion 3 (no receipt)** — with `XDG_CONFIG_HOME` pointed at an empty
  directory: exit 1, stdout empty, stderr
  `spine: no install receipt at …/the-loop-receipt.json — this binary was not
  installed by a release installer, so upgrade has no installer to re-run;
  install the latest release manually: curl -LsSf
  https://github.com/jatassi/the-loop/releases/latest/download/the-loop-installer.sh | sh`.
  The static server's access log showed **the same GET count before and after**
  — nothing was fetched, nothing swapped.

- **Criterion 2 (corrupt archive)** — republished at `50.0.0`, then flipped 32
  bytes in the middle of the archive leaving the sidecar and the installer's
  embedded hash at the good hash: exit 1, stdout empty, stderr
  `spine: upgrade failed at run-installer: exit code 1` followed by the
  installer's own `ERROR: checksum mismatch / want: fae67d… / got: b76442…`.
  The binary was still at `<root>/opt/bin/the-loop` and still ran
  (`the-loop 0.5.1`). No `.old` orphan.

  **Both platforms, since `fix-windows-upgrade-unverified-archive`.** This
  observation on macOS alone never established the criterion: it records the
  *shell* installer refusing, and the generated PowerShell installer verifies
  nothing, so the Windows leg spent that whole time unpacking corrupt archives
  over the install path and reporting success (run 30187991910 caught a
  145,985-byte unloadable `the-loop.exe` beside a 3,664,384-byte
  `the-loop.exe.old` orphan). `upgrade` now verifies the downloaded archive
  against its published `.sha256` sidecar itself, ahead of the Windows
  rename-aside, so a corrupt archive is refused rather than half-installed.
  Replaying this criterion therefore takes two runs:

  1. **macOS / any unix** — `cargo test --package the-loop --features upgrade
     --test upgrade_fixture` (`corrupt_archive_…`) plus
     `--test cli_process` (`corrupt_archive_is_refused_before_the_installer_is_ever_run`,
     which asserts the installer binary never even executes). The shell
     installer keeps its own verification, checked independently by
     `fixture_release.rs:installing_a_corrupt_archive_fails_and_names_the_checksum_mismatch_on_unix`,
     so a corrupt archive is now refused twice on unix.
  2. **Windows** — the `upgrade-windows` job on the tip being released, where
     `corrupt_archive_…` asserts the same refusal, `--version` still exiting 0
     on the previously installed binary, and no `.exe.old` orphan. A green
     macOS run alone does not establish this criterion, and never did.

- **Criterion 1 (happy swap)** — published a distinguishable newer build (a
  `rustc`-compiled stub printing `the-loop 42.0.0`) as version `42.0.0`:
  exit 0, stdout exactly
  `{"from":"1.0.0-older","to":"42.0.0","updated":true}` (pretty-printed),
  installer chatter on stderr only, and
  `<root>/opt/bin/the-loop --version` → `the-loop 42.0.0`.

### Criterion 4 — feature gate both ways

```bash
cargo build && ./target/debug/the-loop upgrade          # exit 1
./target/debug/the-loop upgrade --force                 # clap: unexpected argument (unit variant)
./target/debug/the-loop help upgrade                    # parses; "Usage: the-loop upgrade"
```

Feature-off refusal observed verbatim: `spine: upgrade is not compiled into
this build — install the latest release manually: curl -LsSf …/the-loop-installer.sh | sh`.

Release builds do get the feature — checked by building the real dist artifact
rather than by reading the config (cargo-dist silently ignores unknown config
keys, so config-reading alone proves nothing):

```bash
dist generate --check                                    # exit 0: config valid, release.yml not stale
dist build --artifacts=local --target aarch64-apple-darwin
tar -xJf target/distrib/the-loop-aarch64-apple-darwin.tar.xz -C <tmp>
XDG_CONFIG_HOME=<empty> <tmp>/the-loop-aarch64-apple-darwin/the-loop upgrade
```

The dist-built binary skipped the "not compiled into this build" refusal and
reached the receipt precondition (`spine: no install receipt at …`) — proof
that `features = ["upgrade"]` under `[dist]` reaches the release build.

### Criterion 5 — Windows job committed and named by the runbook

- `.github/workflows/upgrade-windows.yml` parsed as YAML: `name:
  upgrade-windows`, triggers `workflow_dispatch` + push to `main`, one job
  `upgrade-fixture-windows` with `runs-on: windows-latest` running
  `cargo test --package the-loop --features upgrade --test upgrade_fixture`
  after `actions/checkout@v6` + `dtolnay/rust-toolchain@stable` (same checkout
  pin the generated `release.yml` uses).
- `docs/architecture.md` § Release runbook names the workflow file, the job
  `upgrade-fixture-windows`, the `gh run list` / `gh run watch` reads, and
  states it is a release-gate check read at cut time, not a validate-time
  assertion.

**Release gate (not asserted here):** `gh run list --workflow=upgrade-windows.yml
--branch main`, then `gh run watch <id> --exit-status` on the run at the tip
being released. Windows is the only place the rename-aside swap actually runs,
and — per criterion 2 above — the only place the corrupt-archive refusal is
proven against an installer that verifies nothing of its own. A green macOS
`cargo test --features upgrade` does not stand in for it.

That job's greenness is also the only thing that proves the *fixture's* Windows
branch works at all: `sha256_sidecar_line` and `install` spawn Windows
PowerShell, and a green local `cargo test --features upgrade` on macOS takes the
`sha256sum` branch instead and proves nothing about them. The job's first-ever
execution (run 30187625535, the `v0.6.0` bump) died 0/3 in fixture bring-up on a
`PSModulePath` inherited from the runner's pwsh 7 shell; `PSModulePath` is now
pinned at both spawn sites (`fix-windows-fixture-psmodulepath`, whose procedure
carries the full read). So when reading this gate, distinguish the two failure
shapes: a panic at `cli\tests\support\fixture_release.rs` is fixture bring-up
and blocks nothing about the product, while a panic inside
`cli\tests\upgrade_fixture.rs` is a test reaching its own assertion — read it as
a real product signal.

## Expected observations on replay

- `npm test`, `npm run check`, `cargo test`, `cargo test --features upgrade`,
  and both `cargo clippy` invocations green. (Counts move as the repo grows;
  at `fix-windows-upgrade-unverified-archive` they read 218 node tests,
  `OK 54 features` + clean eslint, 248 feature-off and 273 feature-on cargo
  tests.)
- `cargo test --package the-loop --features upgrade --test upgrade_fixture`:
  3 passed — happy swap, corrupt archive, missing receipt.
- A feature-off `the-loop upgrade` exits 1 naming the platform install
  one-liner; a `dist`-built binary gets past that refusal.
- `upgrade-fixture-windows` green on the tip being released.

## Teardown

```bash
rm -rf <root>            # the hand-driven fixture root under $TMPDIR
rm -rf target/distrib    # dist build output (gitignored)
```

The committed harness needs no teardown: every `FixtureRelease` removes its own
temp root on drop and asserts it succeeded.
