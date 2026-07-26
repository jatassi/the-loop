# Validation procedure — fix-windows-upgrade-unverified-archive

Judged against target `main` (tip `c6daf6c`) on worktree
`integrate--fix-windows-upgrade-unverified-archive` (merged
`loop/fix-windows-upgrade-unverified-archive`, no textual conflict; integration tip
`d2b97c1`). No `docs/plans/fix-windows-upgrade-unverified-archive/` existed in the
tree. Everything below was run from the integration worktree root unless stated
otherwise.

**The load-bearing observation is not local.** The destroyed-install failure this
feature fixes only exists on Windows, because only there does `upgrade` rename the
running binary aside, and only there does the generated installer verify nothing. A
green macOS `cargo test --features upgrade` does not establish criteria 1 or 2's
Windows half. The evidence that counts is the `upgrade-windows` job run on a
`windows-latest` runner **at the integration tip itself**.

## Bring-up

```bash
cargo build --release            # target/release/the-loop — the node parity oracle spawns it
cargo build --features upgrade   # the feature-on binary the upgrade fixture installs
gh auth status                   # the Windows exercise is a dispatched CI job
```

The upgrade fixture is its own bring-up: `support::fixture_release::FixtureRelease`
lays down a temp root serving a real patched installer, a current-platform archive
and its `.sha256` sidecar over loopback, installs an older build through it, and
every case then shells out to `<installed path> upgrade` — the CLI driven from the
outside, never an in-process import.

Integrity scan before judging:

- Full diff read: `git diff c6daf6c..HEAD` — six files, +484/-27.
- `Cargo.toml`, `cli/Cargo.toml`, `Cargo.lock`, `dist-workspace.toml`,
  `eslint.config.js`, `package.json` all untouched: no new dependency, no lint-config
  edit.
- No `#[allow(...)]`, no `expect(clippy::...)`, no `eslint-disable` in any form added
  by the diff.
- No test deleted. The one changed existing assertion
  (`failing_installer_names_the_step_and_leaves_the_binary_runnable`) only renames the
  fixture installer's own message from `checksum mismatch …` to
  `the archive would not unpack`, so the installer's output tail is no longer
  confusable with `upgrade`'s own refusal; the assertion's strength is unchanged.
  The `corrupt_archive_…` case in `upgrade_fixture.rs` was **strengthened**: the
  Windows arm's weak `Expand-Archive || error trying to perform the installation`
  alternative was replaced by the same `checksum mismatch` bar the unix arm carries,
  and a new no-`.old`-orphan assertion was added.

## Exercise

### Criterion 1 — corrupt archive on `windows-latest`

The integration tip was pushed to a scratch ref and the `upgrade-windows` workflow
dispatched against it:

```bash
git push origin HEAD:refs/heads/scratch/validate-win-upgrade-verify
gh workflow run upgrade-windows.yml --ref scratch/validate-win-upgrade-verify
gh run view 30206498104 --json headSha   # d2b97c13260ddf28e0ac94724e6c90b979b68019
gh run view 30206498104 --log
```

Observed — run **30206498104**, conclusion `success`, `headSha` exactly the
integration tip:

```
running 4 tests
test missing_receipt_refuses_before_fetching_or_swapping_anything ... ok
test corrupt_archive_leaves_the_older_binary_in_place_and_names_the_failure_on_stderr ... ok
test happy_swap_replaces_the_installed_binary_and_reports_from_to_updated ... ok
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

That test is what carries the criterion's four clauses: nonzero exit,
`checksum mismatch` on stderr, the installed binary still present with `--version`
exiting 0 (`version_of` asserts exit 0 and equality with the pre-upgrade string), and
no `.exe.old` orphan. On Windows nothing but `upgrade`'s own `verify_archive` can
produce `checksum mismatch` — the generated `.ps1` verifies nothing — so the
assertion cannot pass vacuously.

The pre-fix red is on record at the same job: run **30187944593** (harness fixed,
product unchanged) failed exactly this case.

### Criterion 2 — verification precedes the rename-aside

Read at `cli/src/commands/upgrade.rs:141-161`: name-archive → download-archive →
download-checksum → **verify-archive** → `rename_aside`.

Code order alone is not evidence that anything pins it, so the ordering was
**mutation-tested**. The `verify_archive` block was moved to sit *after*
`let aside = rename_aside(&exe, &work);` — the only change — and the same Windows job
dispatched again:

- Locally, `cargo test --features upgrade --test cli_process corrupt_archive` still
  passed: on unix `rename_aside` is a `const fn … -> None` no-op, so the unix case
  cannot see the ordering. (That case still bites on the other half of the criterion:
  it writes a sentinel-creating fixture installer and asserts the sentinel never
  appears, so removing verification entirely fails it.)
- On Windows, run **30206607846** failed, and failed on precisely the displacement:

  ```
  test corrupt_archive_leaves_the_older_binary_in_place_and_names_the_failure_on_stderr ... FAILED
  panicked at cli\tests\upgrade_fixture.rs:152:5:
  the previously installed binary should still be at
  C:\Users\RUNNER~1\AppData\Local\Temp\the-loop-fixture-release-upgrade-corrupt-…\opt\bin\the-loop.exe
  ```

The mutation was then reverted (`git reset --hard d2b97c1`, tree clean) and the
scratch ref deleted. So the ordering is not merely written down — a real test fails
the moment it is reordered.

Additionally on unix, `corrupt_archive_is_refused_before_the_installer_is_ever_run`
(new, `cli/tests/cli_process.rs`) proves the installer process never runs at all
against an archive that failed verification.

### Criterion 3 — no regression on either platform

- Windows, run 30206498104 above: `happy_swap` and `missing_receipt` both `ok`.
- macOS (this machine), from the integration worktree:
  - `cargo test` → 244 + 4 = **248 passed, 0 failed**.
  - `cargo test --features upgrade` → 249 + 8 + 12 + 4 = **273 passed, 0 failed**,
    including `fixture_release.rs`'s
    `installing_a_corrupt_archive_fails_and_names_the_checksum_mismatch_on_unix`,
    which is the shell installer's *own* verification still in the path, checked
    independently of `upgrade`'s.
  - `npm test` → **218 pass, 0 fail** (needs `cargo build --release` first; the
    parity oracle spawns `target/release/the-loop`).
  - `npm run check` → `OK   54 features — 0 error(s), 0 warning(s)` and clean eslint.
  - `cargo clippy --all-targets -- -D warnings` and
    `cargo clippy --all-targets --features upgrade -- -D warnings` → both clean.

### Criterion 4 — module note and dependency bar

`cli/src/commands/upgrade.rs:1-25` now reads *"Thin, with one exception: `upgrade`
owns **archive verification**, and the install *layout* remains the installer's"*,
and explains why (only the shell installer verifies; the Windows rename-aside
displaces before anything could). The old *"it owns no download-verification"*
sentence is gone. `module_note_states_that_upgrade_owns_archive_verification`
asserts all three of those properties against the file's own bytes.

The dependency bar is machine-asserted by
`cargo_and_dist_config_declare_a_default_off_upgrade_feature`, which pins
`[dependencies]` to exactly `clap`, `serde`, `serde_json`. `git diff` confirms
`cli/Cargo.toml` and `Cargo.lock` are untouched. The sha-256 is written out in-crate
(`sha256_hex`/`sha256_compress`) and checked against published FIPS 180-4 vectors
plus one `shasum -a 256`-derived vector, so the digest is not merely self-consistent.

## Expected observations on replay

- Windows: `upgrade-windows` on the tip under test — 4 passed, including
  `corrupt_archive_leaves_the_older_binary_in_place_and_names_the_failure_on_stderr`.
  A green macOS run does not stand in for it.
- macOS: 248 feature-off / 273 feature-on cargo tests, 218 node tests,
  `OK 54 features` + clean eslint, both clippy invocations clean.
- Optional ordering re-proof: move the `verify_archive` block below
  `rename_aside` and dispatch `upgrade-windows` — the Windows corrupt-archive case
  must fail at `upgrade_fixture.rs`'s "the previously installed binary should still be
  at …" assertion.

## Teardown

```bash
git push origin --delete scratch/validate-win-upgrade-verify   # done
```

Fixture roots are temp dirs removed by `FixtureRelease`'s `Drop`; no other state is
created. The integration worktree is removed by the landing step.
