# plan-commands-rust — validation procedure

Validated 2026-07-10 against the assembled integration worktree
(`integrate--plan-commands-rust` on top of `rust-replatform`, `loop/plan-commands-rust`
merged in).

## Bring-up

- `cargo build --manifest-path cli/Cargo.toml --release` — built `target/release/the-loop`.
- The fixture-repo binding's `node bin/create-sample-repo.js` seeds a committed
  feature-graph.md/architecture.md fixture repo; for these two criteria the paired
  oracle fixtures (`test/oracle/fixtures.js`'s `EXAMPLE_DEFINITION`/alpha plan, via
  `test/oracle/case-setup.js`'s `pairSetup`/`onAlpha`) are the actual per-scenario
  fixture repos exercised below — same "spawn the real binary against a disposable
  git checkout" shape as `create-sample-repo.js`, built per-case rather than once.

## Exercise

Ran the parity-oracle corpus against the compiled Rust binary from the outside (subprocess
spawn, never in-process import — `test/oracle/driver.js`'s `spawnSync`):

```
ORACLE_TARGET=rust node --test test/oracle/oracle.test.js
```

Observed: 52/52 pass, including every `plan parse` / `plan check` / `plan task` case in
`test/oracle/cases/plan-commands.js`:

- `plan parse — happy path` — exit 0, stdout JSON-equal to the JS CLI's on the
  0-based-covers `docs/plans/alpha/plan.json` fixture (`feature`, `designVersion`,
  `tasks[].{id,title,covers,acceptance,footprint,size,judgment_level,depends_on,wiring}`).
- `plan parse — refusal: missing plan file` — exit non-zero on both binaries.
- `plan check — happy path OK` — exit 0, `OK plan alpha: 1 task(s)…` on both.
- `plan check — refusal: feature-id mismatch FAIL` — checking `docs/plans/alpha/plan.json`
  as feature `beta` — exit 1, `FAIL plan beta: 1 task(s)…` on both.
- `plan check — refusal: covers index out of range FAIL` — a defective plan with
  `covers: [0, 2]` against a 2-criterion feature — exit 1 on both.
- `plan check — refusal: bad judgment level FAIL` — `judgment_level: "urgent"` — exit 1
  on both.
- `plan check — refusal: task dependency cycle FAIL` — two tasks depending on each
  other — exit 1, `FAIL plan alpha: 2 task(s)…` on both.
- `plan task — happy path` — exit 0, one task's brief (`feature`, `design_version`,
  `task`, `covers_criteria`) JSON-equal to the JS CLI's.
- `plan task — refusal: unknown task id` — exit non-zero on both.

Also independently re-ran, as part of gating the executor's verdict (not trusting its
word alone):

```
cargo build --manifest-path cli/Cargo.toml --release   # clean
cargo test --manifest-path cli/Cargo.toml               # 170 + 3 pass
cargo clippy --manifest-path cli/Cargo.toml --all-targets -- -D warnings   # clean
cargo fmt --manifest-path cli/Cargo.toml --check         # clean
npm test                                                 # 358 pass
ORACLE_TARGET=rust node --test test/oracle/oracle.test.js   # 52 pass
npx eslint .                                             # clean (exit 0)
```

## Expected observations

Every `plan parse`/`plan check`/`plan task` scenario above — happy paths and the four
named `plan check` refusals (feature mismatch, covers out of range, bad judgment level,
task dependency cycle) — exits with the same code on `target/release/the-loop` as on
`node plugin/bin/the-loop.js`, with stdout JSON-equal (or matching the `FAIL …`/`OK …`
summary shape). `test/oracle/pending.json` no longer lists `plan parse`/`plan check`/
`plan task`, so these ran live, not skipped.

## Teardown

The oracle driver's `setup()` fixtures are disposable per-case temp git checkouts torn
down by the test runner itself; nothing persists outside `test/oracle/`. No
`docs/plans/**/plan.{md,json}` from these fixtures is a tracked file in this feature's
diff against `rust-replatform`.
