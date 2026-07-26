# fix-windows-fixture-psmodulepath — the upgrade fixture cannot resolve any Windows PowerShell cmdlet when the test process was launched under pwsh 7

**Date:** 2026-07-26 · **Affects:** cli-upgrade · **Class:** environment-inheritance
· **Cause established by:** reproduced (CI, `windows-latest`)
**Environment:** GitHub `windows-latest`, Windows PowerShell 5.1.26100.32995 as the
spawned child, pwsh 7.6.3 as the `run:` step shell, `dtolnay/rust-toolchain@stable`,
the-loop 0.6.0 · **Determinism:** always, 3/3 tests, every run ·
**Regressed since:** never worked — the `upgrade-windows` workflow was authored during
`cli-upgrade` and had never executed until 2026-07-26

## Steps to reproduce

1. On a `windows-latest` GitHub runner, in a workflow step with no `shell:` key (so the
   step runs under pwsh 7, the documented default).
2. Run `cargo test --package the-loop --features upgrade --test upgrade_fixture`.
3. All three tests panic during fixture bring-up.

Reproduced live as run 30187625535 (the first-ever execution of the job, on the
`v0.6.0` bump commit `83bbb17`), then isolated with a purpose-built probe workflow
across runs 30187756876 and 30187834348.

## Expected result

`FixtureRelease::publish` writes a `<hash> *<archive>` sidecar for the published
archive, and `FixtureRelease::install` runs the generated `.ps1` installer, so the
three `upgrade_fixture` tests reach their own assertions. The fixture's contract, at
`cli/tests/support/fixture_release.rs:609-610`, is that the sidecar is "produced by the
same tool the installer verifies with."

## Actual result

All three tests panic in setup at `cli/tests/support/fixture_release.rs:623`:

```
Get-FileHash : The term 'Get-FileHash' is not recognized as the name of a cmdlet,
function, script file, or operable program. Check the spelling of the name, or if a
path was included, verify that the path is correct and try again.
At line:1 char:2
+ (Get-FileHash -Algorithm SHA256 -LiteralPath 'the-loop-x86_64-pc-wind ...
+  ~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (Get-FileHash:String) [], CommandNotFoundException
    + FullyQualifiedErrorId : CommandNotFoundException
```

## Root cause

Windows PowerShell 5.1 resolves `Get-FileHash` by autoloading
`Microsoft.PowerShell.Utility` along `PSModulePath`. GitHub runs a `run:` step under
**pwsh 7**, whose `PSModulePath` lists `c:\program files\powershell\7\Modules` *ahead
of* `C:\Windows\system32\WindowsPowerShell\v1.0\Modules`. The `cargo test` process
inherits that value verbatim, and `sha256_sidecar_line`
(`cli/tests/support/fixture_release.rs:616`) spawns `powershell` with it still in
place. 5.1 therefore autoloads **PowerShell 7's** Core-only `Microsoft.PowerShell.Utility`
manifest, which exports nothing usable to 5.1, and the cmdlet resolves to nothing.

pwsh sanitizes `PSModulePath` when it launches `powershell` *itself* — which is why the
byte-identical command succeeds in a bare `run:` step — but nothing sanitizes it across
an intermediate process. `FixtureRelease::install`
(`cli/tests/support/fixture_release.rs:390`) spawns the `.ps1` installer the same way
and is hit by the same shadowing.

Why nothing caught it: the fixture's Windows branch had never run anywhere. The
`upgrade-windows` workflow was authored in the same feature that authored the fixture,
triggers only on `workflow_dispatch` and push to `main`, and had never fired; the-loop's
dev machines are macOS, where the `sha256sum` branch is taken instead.

## Evidence

Probe workflow dispatched against a scratch branch, three rounds:

- The exact failing command, run **directly** from a pwsh `run:` step: **succeeds**,
  exit 0. The child's `PSModulePath` in that case contains no PowerShell 7 entries —
  pwsh rewrote it.
- The same command spawned from a Rust test process: **fails**. The child's
  `PSModulePath` is pwsh 7's list verbatim, PS7 paths first.
- `Get-Module -ListAvailable Microsoft.PowerShell.Utility` from that child returns
  `Manifest 7.0.0.0` from `C:\program files\powershell\7\Modules` — 5.1 is loading
  PowerShell 7's module.
- Explicit `Import-Module Microsoft.PowerShell.Utility` first: still fails, confirming
  the wrong manifest is being imported rather than none.
- `cmd /c powershell -NoProfile -Command …`: **fails** too — so this is not
  Rust-specific, it is "spawned by any non-PowerShell parent".
- Setting the child's `PSModulePath` to Windows PowerShell's own module directory:
  **succeeds**. So does `pwsh`, and so does `certutil -hashfile`.

## Fix design

Pin the child's `PSModulePath` to Windows PowerShell's own system module directory at
both spawn sites, so the lookup cannot be shadowed by whatever shell the CI harness
happens to use:

- `sha256_sidecar_line` — add `.env("PSModulePath", <SystemRoot>\system32\WindowsPowerShell\v1.0\Modules)`
  to the `powershell` command.
- `isolation_env` — insert the same key under the existing `cfg!(windows)` branch, so
  every installer invocation inherits it.

Derive the path from `%SystemRoot%`, falling back to `C:\Windows`. Keep `powershell`
rather than switching to `pwsh`: `powershell` is present on every Windows install,
`pwsh` is not. Carry a comment at the primary site explaining the shadowing, because
the failure is invisible on any dev machine.

This shape was applied on a scratch branch and verified on `windows-latest`: the suite
went from 0/3 to **2/3**, with the remaining failure being a genuine product defect
tracked separately as `fix-windows-upgrade-unverified-archive`.

## Regression

- With a pwsh-7-inherited `PSModulePath`, the fixture resolves `Get-FileHash` and the
  installer's cmdlets: no `upgrade_fixture` test panics inside fixture bring-up.
- The `upgrade-windows` job reaches the tests' own assertions rather than dying in
  setup.

## Validation procedure

`docs/validation/cli-upgrade/procedure.md` gains this as an exercise step under its
existing Windows-job release-gate clause: record that the job's greenness is what
proves the fixture's Windows branch works at all, and that a green local
`cargo test --features upgrade` on macOS proves nothing about it.
