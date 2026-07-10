# parity-oracle — validation procedure

Recorded 2026-07-09 by the validate agent (judgment delegated to the `grok`
executor, `grok-4.5`), per the fixture-repo binding in
`docs/briefs/rust-cli-replatform.md`.

## Bring-up

- Integration worktree assembled from `rust-replatform` by merging, in order:
  `loop/parity-oracle`, `loop/parity-oracle--compare-rules`,
  `loop/parity-oracle--fixture-pairs`, `loop/parity-oracle--oracle-driver`,
  `loop/parity-oracle--corpus-read`, `loop/parity-oracle--corpus-write`,
  `loop/parity-oracle--corpus-context`. All seven merges applied with no
  conflicts.
- `node bin/create-sample-repo.js` — creates a temp git repo seeded as a
  plausible v2 target repository (feature-graph.md + architecture.md + design
  docs, committed) and prints its path.
- `node bin/create-sample-repo.js empty` — seeds the bare unconfigured variant.
- Rust binary built once: `cargo build --release --manifest-path cli/Cargo.toml`
  (`target/release/the-loop`, gitignored artifact).

## Exercise

1. **Fixture binding (outside-in CLI)**
   - Configured fixture cwd: `node plugin/bin/the-loop.js status --json` exits 0,
     reports mode `configured`, 3 features, an eligible id — driven purely as a
     subprocess against the fixture repo's cwd.
   - Human `status` and `list` also exit 0 with expected content against the same
     fixture.
   - Empty fixture: `status --json` exits 0, reports mode `unconfigured` with an
     onboarding proposal.
   - No in-process imports of CLI modules were used for any of these checks.

2. **Oracle corpus, JS target (criterion 3 bar)**
   - `npm test` — 341 pass, 0 fail, including `test/oracle/*.test.js`.
   - Oracle summary line: `oracle [js]: 46 pass, 0 fail, 0 pending`. All 46
     corpus cases (status incl. `--json`, list, check, set-status, plan
     parse|check|task, prepare-execution-context incl. `--script-out` and gate
     refusals, worktree-create/remove, executors-list, models-list, hooks-list,
     hooks-set, calibration-summarize, `--version`) green, each with at least one
     happy-path and one refusal case.
   - Isolated re-run (`node --test test/oracle/oracle.test.js`) reproduces the
     same summary.

3. **Oracle corpus, Rust target (criterion 4)**
   - `npm run oracle:rust` (`ORACLE_TARGET=rust node --test
     test/oracle/oracle.test.js`) runs to completion.
   - Summary line: `oracle [rust]: 1 pass, 0 fail, 45 pending`. The single pass
     is `--version` (the one command already implemented in the Rust scaffold,
     and correctly not on the pending allowlist); every other command is on
     `test/oracle/pending.json` and reports `pending`, not `fail`. Zero false
     fails on unported commands; a fail on a ported command would be a real
     defect, never re-classified pending — the mechanics were confirmed by
     reading `verdictOf` in `test/oracle/driver.js`.

4. **Lint**
   - `npm run lint` — clean; no new suppressions in the diff (`git diff
     rust-replatform...HEAD` greps to zero `eslint-disable` and touches no lint
     config).

5. **Code inspection (criteria 1–2, integrity)**
   - Confirmed by reading `test/oracle/driver.js` and every file under
     `test/oracle/cases/`: the CLI under test is invoked only via
     `spawnSync`/`execFileSync`/`execSync` with argv and a fixture-repo cwd,
     binary selected via `ORACLE_TARGET`/`ORACLE_BIN` configuration. No case or
     driver code path imports either CLI implementation's command modules
     in-process.
   - Confirmed by reading `test/oracle/fixtures.js`: `buildFixturePair` and the
     record renderers take one shared JS definition (`EXAMPLE_DEFINITION`) and
     emit two semantically equivalent variants — YAML-in-markdown for the JS
     CLI, pure JSON for the Rust binary — not two independently hand-maintained
     fixture trees.
   - No deleted or weakened tests in the diff; the new oracle-side unit tests
     (`compare.test.js`, `fixtures.test.js`, `driver.test.js`) exercise real
     behavior (stub binaries, dual-format emission, pending-mechanics
     downgrade), not no-ops.

## Expected observations vs. actual

All expected: JS-target oracle 100% green (criterion 3), Rust-target oracle
reports a per-case pass/fail/pending summary with legal pending on unported
commands and zero false fails (criterion 4), subprocess-only driving confirmed
by code inspection (criterion 1), paired-fixture generation from one shared
definition confirmed by code inspection (criterion 2). No integrity-gate
findings.

## Teardown

- Both `create-sample-repo.js` fixture paths removed via `rm -rf`.
- Oracle corpus cases self-clean their own temp fixture repos via per-case
  `cleanup()` hooks (verified: `git status --short` in the worktree showed no
  stray fixture artifacts after any run).
- No tracked files in the integration worktree were altered by the exercise
  itself (`git status --short` clean before the graph write in the pass path
  below).
