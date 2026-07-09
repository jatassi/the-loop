# parity-oracle — Dual-driver black-box oracle over paired YAML/JSON fixtures

**Status:** designed 2026-07-09 from `docs/briefs/rust-cli-replatform.md` (ADR-0051).

The replatform's behavioral spec, made executable. A language-independent suite that
drives a CLI **purely by shelling out** — argv + a fixture-repo cwd in; stdout JSON,
exit code (and stderr presence where the contract says "refuses loudly") asserted —
run against *both* the JS CLI and the Rust binary through the parity window. Bun's
rewrite shipped 19 regressions despite compiling clean; compiling is not evidence of
parity, this corpus is. No case retires until Rust matches; json-cutover requires
zero pending.

## Division of labor

The oracle lives **dev-side at the repo root** (`test/oracle/`, run by `node --test`
like the rest of the suite — the dev machine keeps node; the zero-runtime constraint
is about the *user's* machine). It never imports either implementation in-process:
the binary under test is named by configuration (env var `ORACLE_BIN`, e.g.
`node plugin/bin/the-loop.js` or `cli/target/release/the-loop`), and every assertion
runs over a child process's observable outputs.

## Paired fixtures — one definition, two formats

The JS CLI reads YAML-in-markdown; the Rust binary reads pure JSON (ADR-0051). A
parity case must feed each binary *its own* format of the *same* content. So every
fixture repo is **generated from one shared definition** (a JS object describing
features, plans, settings layers, calibration records, executor playbooks) into two
variants: YAML artifacts for the JS run, JSON artifacts for the Rust run. The
generator extends the existing fixture approach (`bin/create-sample-repo.js` seeds
today's YAML fixture repos); semantic equivalence of the pair is by construction,
never by hand-maintaining two trees.

## Comparison rules (the contract of "equivalent results")

- **stdout**: parsed and compared as JSON values — key-order-insensitive, whitespace
  irrelevant. Byte-equality is NOT the bar across implementations (serde and
  `JSON.stringify` may order/format differently); JSON-equality is.
- **exit codes**: exactly equal.
- **stderr**: asserted for presence/absence on refusal paths only; wording is
  informational, not part of the parity contract (usage strings may normalize from
  the legacy `spine:` prefix to `the-loop:`).
- **Normalized fields**: `preparedAt` (wall clock) is checked for ISO-8601 shape,
  not value; the execution context's `cli` field is checked per-binary (`node …` vs
  `the-loop`) — the one sanctioned content difference (see run-commands-rust).
- **Filesystem effects** (set-status, hooks-set, --script-out, worktree-create):
  asserted on the fixture tree after the run — written artifacts compared by the same
  JSON-equality rule; `--script-out` output byte-identical (same input script, pure
  string splice).

## Corpus coverage

At least one happy-path and one refusal case per command of the **full current
surface**: `status` (human + `--json`), `list`, `check`, `set-status`,
`plan parse|check|task`, `prepare-execution-context` (incl. `--script-out` and each
gate refusal class), `worktree-create`/`worktree-remove`, `executors-list`,
`models-list`, `hooks-list`, `hooks-set`, `calibration-summarize`, plus `--version`.
Refusal cases mine the existing node:test suite (`test/*.test.js`) — it is the
behavioral spec the brief designates; each oracle case names the command + scenario
so coverage is auditable by reading the case list.

## Pending mechanics

Run against the JS CLI, the corpus must pass 100% from this feature's landing. Run
against the Rust binary, cases for not-yet-ported commands report **pending** (keyed
on a per-command allowlist that each `*-rust` feature shrinks as it lands), so parity
progress is one number: `pass/fail/pending`. A fail against Rust on a ported command
is a real defect, never re-classified pending.

## Touched surfaces

| Surface | Change |
|---|---|
| `test/oracle/` (new) | driver, comparison rules, case corpus |
| `bin/create-sample-repo.js` or sibling | fixture generation grows the JSON variant |
| `package.json` | oracle rides `npm test` (JS-target run); a script/env selects the Rust target |

## What a builder would otherwise guess

- Worktree/git-touching cases run inside disposable temp git repos (the fixture
  generator commits its seed), never this repo.
- The corpus is data-driven (a case table), not one bespoke test per command — the
  dual-target run must be a loop over cases, or the pending mechanics rot.
- Don't chase stderr text or JS `undefined`-vs-absent-key differences; the
  comparison rules above are the whole contract.

## Acceptance (from the feature graph)

1. Subprocess-only driving; binary under test selected by configuration.
2. Fixture repos generated from one shared definition into semantically equivalent
   YAML and JSON variants.
3. Corpus covers every command with happy-path + refusal cases; 100% green against
   the JS CLI.
4. Rust runs report per-case pass/fail/pending; pending legal until json-cutover.
