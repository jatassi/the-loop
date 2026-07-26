# Validation procedure — fix-windows-fixture-psmodulepath

Judged against target `main` on worktree `integrate--fix-windows-fixture-psmodulepath`
(merged `loop/fix-windows-fixture-psmodulepath`, fast-forward, no textual conflict).
No `docs/plans/fix-windows-fixture-psmodulepath/` existed in the tree. Everything
below was run from the integration worktree root unless stated otherwise.

**The load-bearing observation is not local.** This fix is Windows-only by
construction: both changed spawn sites sit under `cfg!(windows)`. A green
`cargo test --features upgrade` on macOS proves *nothing* about it. The only
evidence that counts is the `upgrade-windows` GitHub job actually running on a
`windows-latest` runner whose test process inherited pwsh 7's `PSModulePath` —
which is exactly the environment the bug needs.

## Bring-up

```bash
cargo build --release            # target/release/the-loop — the node oracle + fixture tests spawn it
cargo build --features upgrade   # the feature-on binary the upgrade fixture installs
gh auth status                   # the Windows exercise is a dispatched CI job
```

Integrity scan before judging:

- Full diff read: `git diff main...HEAD` — one file,
  `cli/tests/support/fixture_release.rs`, +63/-0. Purely additive.
- `Cargo.toml`, `cli/Cargo.toml` and `Cargo.lock` untouched: no new dependency.
- The `sha256sum` (non-Windows) branch of `sha256_sidecar_line` is untouched.
- No `eslint-disable` in any form, no lint-config edit, no deleted or weakened
  test.

## Exercise

### Criterion 1 — the child resolves `Get-FileHash` and the installer's cmdlets

The `upgrade-windows` workflow (`workflow_dispatch`) dispatched against the
feature branch, whose tip is byte-identical to the integration tip:

```bash
gh workflow run upgrade-windows.yml --ref loop/fix-windows-fixture-psmodulepath
gh run view <id> --log-failed
```

Run **30188402121** (dispatched by this validation pass; run 30188331494 on the
same tip agrees):

```
running 4 tests
test support::fixture_release::tests::pins_to_windows_powershells_own_module_directory_under_system_root ... ok
test missing_receipt_refuses_before_fetching_or_swapping_anything ... ok
test happy_swap_replaces_the_installed_binary_and_reports_from_to_updated ... ok
test corrupt_archive_leaves_the_older_binary_in_place_and_names_the_failure_on_stderr ... FAILED
```

No `Get-FileHash … is not recognized` anywhere in the log, and no panic at
`cli\tests\support\fixture_release.rs`. `install_older_build`'s two setup
assertions (installer exit 0, binary on disk) passed in **all three** fixture
tests, so the generated `.ps1` installer resolved its own cmdlets too — both
spawn sites, not just the sidecar hash.

Baseline for contrast, run **30187625535** on `main`'s `v0.6.0` tip, the same
runner image, the same command:

```
running 3 tests
... all three FAILED
thread '…' panicked at cli\tests\support\fixture_release.rs:623:9:
Get-FileHash failed for the-loop-x86_64-pc-windows-msvc.zip: Get-FileHash : The
term 'Get-FileHash' is not recognized as the name of a cmdlet …
test result: FAILED. 0 passed; 3 failed
```

0/3 dying in bring-up before, 0/3 dying in bring-up after.

### Criterion 2 — every test reaches its own assertions

Same run. Three of four pass outright. The single failure panics at
`cli\tests\upgrade_fixture.rs:70:5` — inside `version_of`, called from
`corrupt_archive_leaves_the_older_binary_in_place_and_names_the_failure_on_stderr`'s
*post-swap* assertion block, after the test's own
`assert!(!output.status.success())` and `assert!(installed_path.is_file())` both
passed. That is the separately tracked product defect
`fix-windows-upgrade-unverified-archive` ("on Windows, `the-loop upgrade`
replaces a working binary with an unverified archive and destroys the install
when that archive is corrupt"), not a setup death. The `install_older_build`
path is proven live by the two tests that pass through it to green.

"Cannot be shadowed by whatever shell the CI harness uses": the pinned value is
computed by `windows_powershell_module_path`, never read from the inherited
`PSModulePath`. Its unit test asserts the value for `Some("C:\\Windows")`,
`None` and `Some("")`. Mutation-checked — changing the fallback from
`"C:\\Windows"` to `""` turns the test red:

```
left: "\\system32\\WindowsPowerShell\\v1.0\\Modules"
right: "C:\\Windows\\system32\\WindowsPowerShell\\v1.0\\Modules"
```

(the mutation was reverted; the tree was left clean).

### Criterion 3 — macOS/Linux behaviour unchanged

```bash
cargo test --package the-loop --features upgrade --test upgrade_fixture  # 4 passed
cargo test --all-features                                                # 245 + 7 + 12 + 4 passed, 0 failed
cargo clippy --all-targets --all-features -- -D warnings                 # clean
npm run lint                                                             # clean
npm test                                                                 # 218 passed, 0 failed
```

The three pre-existing fixture tests still pass on macOS unchanged; the fourth
is the new pure-function unit test. `npm test` needs `cargo build --release`
first — the oracle driver resolves `target/release/the-loop`, and without it the
corpus reports failures that have nothing to do with this change.

CLI-surface smoke over the fixture-repo binding, confirming the user-facing CLI
is untouched by a test-support change:

```bash
FIX=$(node bin/create-sample-repo.js | tail -1)
(cd "$FIX" && <worktree>/target/release/the-loop status --json)   # exit 0, mode "configured"
rm -rf "$FIX"
```

## Expected observations on replay

- `upgrade-windows` on a `windows-latest` runner: 4 tests run, zero panics at
  `cli\tests\support\fixture_release.rs`, zero `CommandNotFoundException`. Until
  `fix-windows-upgrade-unverified-archive` lands, the job is still red at
  `corrupt_archive_…` failing on its own post-swap assertion — that is the
  expected shape, not a regression of this fix.
- macOS: `cargo test --features upgrade` 4/4, full `cargo test --all-features`
  green, clippy clean, `npm test` 218/218 after a release build.

## Teardown

```bash
rm -rf "$FIX"                    # the printed sample-repo path
git worktree remove .claude/worktrees/integrate--fix-windows-fixture-psmodulepath
```

## Follow-up noted, not fixed here

`cli/src/commands/upgrade.rs` spawns `powershell` at two sites of its own
(`download`, `installer_command`) with no `PSModulePath` pin, so a real
`the-loop upgrade` launched from a pwsh 7 session on Windows is exposed to the
same shadowing this fix removes from the fixture. Out of scope for this
feature's contract — worth a diagnose entry.
