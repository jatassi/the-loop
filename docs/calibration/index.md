# Calibration memory

## Digest

_7 run(s), 11 feature(s) recorded._

### Workflow paths
| path | runs | median agents | median duration |
| --- | --- | --- | --- |
| small | 6 | 3 | 131.5 |
| standard | 5 | 6 | 494 |

### Re-slices
0 of 11 feature(s) re-sliced (0%).

### Footprint accuracy by size class
| size | features | median planned files | median actual files |
| --- | --- | --- | --- |
| s | 2 | 10.5 | 14 |
| m | 2 | 19.5 | 31 |

### Top block reasons
- 1× AC2 unmet (format-sensitive fixtures not dual-variant): test/oracle/fixtures.js does build YAML+JSON pairs from one shared definition, but most cases do not feed the correct half to each target. test/oracle/cases/read-commands.js builds a pair via buildFixturePair yet always sets cwd to yamlRepo — jsonRepo is only ever cleaned up, never selected by ORACLE_TARGET (confirmed: file's own header comment reads 'Cases target the JS yamlRepo fixture half; Rust pending allowlist handles the rest', and pairSetup() unconditionally returns cwd: yamlRepo). test/oracle/cases/write-commands.js never calls buildFixturePair at all — set-status seeds only docs/feature-graph.md (verified via grep: 8 .md references, 0 .json) and calibration-summarize only docs/calibration/runs/*.md (verified: 4 .md references, 0 .json). Only prepare-execution-context in context-commands.js actually selects yamlRepo vs jsonRepo by target. hooks-set/worktree fixtures are format-neutral (already JSON) so those are fine.; AC3 unmet (missing refusal case for worktree-create): of 45 total corpus cases, every named command has at least one happy-path and one refusal case except worktree-create, which has only two cases ('create-new' and 'idempotent re-create'), both happy-path, zero refusal (confirmed via grep against test/oracle/cases/context-commands.js). The JS target is otherwise fully green: npm test prints 'oracle [js]: 45 pass, 0 fail, 0 pending' with the full 340-test suite passing and lint clean.; AC4 unmet (default Rust binary path is wrong, producing a misleading parity number): the cargo workspace (root Cargo.toml, cli/ as member) places the compiled binary at <repo-root>/target/release/the-loop, but test/oracle/driver.js's defaultBin('rust') resolves to cli/target/release/the-loop, which never exists under that workspace layout. Verified directly: `cargo build --release` from repo root produces target/release/the-loop (the-loop 0.1.0 via --version, exit 0); `npm run oracle:rust` (default path) reports 'oracle [rust]: 0 pass, 1 fail, 44 pending' with a hard failure on --version (spawnSync ENOENT on the wrong path) even though --version is not on the pending allowlist and the Rust binary genuinely implements it; with ORACLE_BIN=target/release/the-loop it correctly reports 'oracle [rust]: 1 pass, 0 fail, 44 pending'. The canonical npm script therefore misreports an already-correct ported command as a plumbing failure, undermining criterion 4's promise that parity progress is one trustworthy number.; AC1 largely met with a minor hygiene note: driver.js always invokes the CLI under test via spawnSync(bin.command, [...prefixArgs, ...argv]) keyed off ORACLE_BIN/ORACLE_TARGET, with no in-process import of either CLI implementation used to drive it. However test/oracle/cases/context-commands.js imports plugin/src/splice-workflow-description.js and test/oracle/fixtures.test.js imports plugin/src/parse-feature-graph.js and plugin/src/plan.js — used only to compute expected assertion values / verify fixture semantic equivalence, not to drive the subprocess under test, so this does not violate criterion 1's letter but is worth tightening.; Integrity gates: clean. No eslint-disable (or equivalent) added anywhere under test/oracle/, no lint-config edits, npm test (340/340) and npm run lint both green before and after the executor's judging pass, and no deleted or weakened tests observed — the oracle test surface is purely additive.
- 1× See detail field above.
- 1× placeholder — waiting for background executor; this call is a no-op, see follow-up

### Token split (overhead vs build)
Lifetime: 68% overhead / 32% build.
Last-10 median: 91% overhead / 9% build.
Attribution: 6 of 7 run(s) overlapped — the overhead/build split is approximate.

## Runs

- 2026-07-09T13:59:04.495Z · target main · [onboard, ports-adapters-full] · 1 validated, 1 stalled · 1441233 tokens · overlapped
- 2026-07-09T14:24:50.492Z · target main · [onboard] · 1 validated · 1565599 tokens · overlapped
- 2026-07-09T14:45:13.064Z · target main · [operate-tooling] · 1 validated · 1810951 tokens · overlapped
- 2026-07-10T00:07:21.326Z · target rust-replatform · [rust-crate-scaffold] · 1 validated · 34008 tokens · serial
- 2026-07-10T00:34:16.869Z · target rust-replatform · [parity-oracle, binary-distribution] · 1 blocked, 1 stalled · 305018 tokens · overlapped
- 2026-07-10T01:26:11.203Z · target main · [fix-execution-context-args-transport, fix-record-prompt-cli] · 2 validated · 116674 tokens · overlapped
- 2026-07-10T01:32:27.501Z · target rust-replatform · [parity-oracle, binary-distribution] · 2 validated · 437861 tokens · overlapped
