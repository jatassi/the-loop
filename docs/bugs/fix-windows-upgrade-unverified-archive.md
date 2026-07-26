# fix-windows-upgrade-unverified-archive — on Windows, `the-loop upgrade` replaces a working binary with an unverified archive and destroys the install when that archive is corrupt

**Date:** 2026-07-26 · **Affects:** cli-upgrade · **Class:** contract-drift
(delegated invariant that only one platform actually provides) ·
**Cause established by:** reproduced (CI, `windows-latest`)
**Environment:** GitHub `windows-latest`, the-loop 0.6.0, cargo-dist 0.32.0 generated
`the-loop-installer.ps1` · **Determinism:** always, whenever the downloaded archive
does not match its published hash · **Regressed since:** never worked — the Windows
path has never been exercised until 2026-07-26

## Steps to reproduce

1. Publish a fixture release, then corrupt the archive's bytes while leaving the
   sidecar and the installer's embedded checksum at the good hash — exactly what
   `FixtureRelease::corrupt_archive` does.
2. On `windows-latest`, run `the-loop upgrade` against it from an installed older
   build.
3. Inspect the install directory and run the installed binary.

This is the committed test `corrupt_archive_leaves_the_older_binary_in_place_and_names_the_failure_on_stderr`.
It has never been able to run: fixture bring-up died first, tracked as
`fix-windows-fixture-psmodulepath`. With that fixed on a scratch branch, this test
fails for real (CI run 30187944593, isolated in run 30187991910).

## Expected result

The contract the test's own name states, and the behavior the Unix path already
delivers: a corrupt download is refused, the previously installed binary stays in
place and runnable, no `.old` orphan is left. The macOS replay of the `cli-upgrade`
validation procedure observed exactly that — exit 1, the installer's own
`ERROR: checksum mismatch`, the binary still at `<root>/opt/bin/the-loop` and still
running, no orphan.

## Actual result

The installed binary is destroyed and the good copy is orphaned:

```
the-loop.exe --version exited Some(-1073741701)   # 0xC000007B STATUS_INVALID_IMAGE_FORMAT
  stdout=""
  stderr=""
  install dir contents:
    "the-loop.exe"     len=145985     ← the corrupt archive's remnants
    "the-loop.exe.old" len=3664384    ← the real binary, orphaned
```

The installer exits 0, so `upgrade`'s own abort/restore path never fires.

## Root cause

`cli/src/commands/upgrade.rs:3-6` states the design: *"Deliberately thin: it owns no
download-verification and no install-layout logic… Archive integrity and layout belong
to the installer."*

That delegation holds on Unix, where the generated `the-loop-installer.sh` verifies the
archive's sha256 and refuses on mismatch. It does **not** hold on Windows: the
cargo-dist 0.32.0 generated `the-loop-installer.ps1` performs no checksum verification
at all. The repo already knew this — it is written down in
`.github/workflows/upgrade-windows.yml`'s header — but the consequence was never traced
through the *ordering* of `upgrade`'s own steps.

Those steps (`upgrade.rs:90-128`) are: read receipt → download installer → **rename the
running binary aside** (Windows only) → run installer. So on Windows the working binary
is displaced *before* anything has established that the replacement is sound, and the
only component that could have established it verifies nothing. A corrupt or truncated
download therefore extracts over the target path, the installer reports success, and
`upgrade`'s post-check and abort/restore path — which keys off installer failure — never
runs.

The underlying cause is the delegated invariant itself: "the installer verifies the
archive" is true of one of the two installers the feature ships against, and nothing in
the design or the tests pinned that asymmetry.

Why nothing caught it: the only test that asserts this contract is the Windows-only
`corrupt_archive_…` case, and it could not run — see
`fix-windows-fixture-psmodulepath`. Local `cargo test --features upgrade` on macOS
passes 3/3 while exercising an entirely different code path.

## Evidence

- CI run 30187944593 (harness fixed, product unchanged): `missing_receipt` and
  `happy_swap` pass, `corrupt_archive` fails.
- CI run 30187991910, with the install directory dumped at the point of failure: the
  listing above — a 145,985-byte `the-loop.exe` that will not load, beside a
  3,664,384-byte `the-loop.exe.old`.
- Exit code `-1073741701` is `0xC000007B`, `STATUS_INVALID_IMAGE_FORMAT`: the file at
  the install path is not a loadable executable.
- `cli/src/commands/upgrade.rs:3-6` (the delegation note) and `:90-128` (the
  rename-aside-then-run ordering).

## Fix design

Move archive verification into `upgrade` itself, on every platform, ahead of the
rename-aside — the human's decision at the 2026-07-26 gate.

- Fetch the archive's published `.sha256` sidecar alongside the installer from the same
  download base (the sidecar is already part of every cargo-dist release, and the
  fixture already publishes one).
- Verify the archive before any step that displaces the installed binary. Ordering is
  the load-bearing part: verification must precede the Windows rename-aside, not merely
  precede the installer.
- On mismatch, exit non-zero naming the checksum failure on stderr, leave the installed
  binary untouched, leave no `.old` orphan — the shape the Unix path already produces,
  so the two platforms converge on one observable contract.
- Update the module's design note at `upgrade.rs:3-6`: `upgrade` now owns archive
  verification. Layout stays the installer's.
- Constraint: no new `[dependencies]`. `cli-upgrade` shipped with zero added crates and
  that bar holds — compute the digest with what is already available to the crate, or
  shell to the platform tool the way the fixture does (`sha256sum` / `certutil`), which
  keeps the dependency set flat.
- Unix behavior must not regress: the shell installer keeps its own verification, so a
  corrupt archive is now refused twice. The existing macOS observations in the
  `cli-upgrade` validation procedure must still hold.

## Regression

- Given a published release whose archive is corrupt but whose sidecar carries the good
  hash, when `the-loop upgrade` runs **on Windows**, then it exits non-zero, names the
  checksum failure on stderr, the previously installed binary is still present and
  `--version` exits 0, and no `.exe.old` orphan remains —
  `corrupt_archive_leaves_the_older_binary_in_place_and_names_the_failure_on_stderr`
  passes on `windows-latest`.
- Verification precedes the rename-aside: a corrupt archive never displaces the working
  binary, so the failure mode is a refusal rather than a repair.
- `happy_swap` and `missing_receipt` still pass on `windows-latest`, and the full
  `cargo test --features upgrade` suite still passes on macOS.

## Validation procedure

`docs/validation/cli-upgrade/procedure.md` gains this as an exercise step in its
criterion-2 (corrupt archive) section: the recorded observation must cover **both**
platforms — the Unix installer-level checksum refusal already recorded, and the new
Windows refusal proven by the `upgrade-windows` job — with the release-gate clause
stating that a green macOS run alone does not establish the Windows contract.
