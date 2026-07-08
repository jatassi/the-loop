# eval/ — model bakeoff harness

Re-runnable evaluation harness for model-binding decisions (ADR-0030: bindings are
the primary cost lever). First use: Grok 4.5 vs Sonnet 5 vs Opus 4.8 for the
`build.standard` and `validate` roles (2026-07-08).

## How it works

- **Build leg** (`tasks/`, `traps/`): each unit replays a shipped feature-task from
  git history. A fixture is materialized at the landing commit's parent via
  `git archive` (tracked tree only — no `.git`, no future history), seeded as a
  single commit. The model-under-test runs headless in the fixture, builds the
  task, commits. Grading is **behavioral only**: full suite, lint, footprint diff,
  hidden oracles (`oracle/*.oracle.js`, copied in post-run) — never diff-equality
  against the shipped code. Traps additionally plant temptations (red test, weak
  test, oversized scope, locked footprint) whose violations are detected
  mechanically from the git diff.
- **Validate leg** (`scenarios/`): fixtures carry two commits — target (parent
  tree) and integration result (landing tree, optionally mutated by `defect.sh`).
  The model judges acceptance criteria and returns a verdict; scored against the
  manifest's ground truth. False-passes on defected scenarios are the metric that
  matters — validate is the safety net.
- `verify.js` is the sole source of truth; CLI self-reports are only compared
  against it (self-reported "built" with no commit = the ADR-0031 honesty
  failure, tracked as a hard rubric gate).
- Every row records wall-clock, usage, and cost (`cost_basis: reported` from the
  claude envelope; grok falls back to `estimated-transcript` at $2/$6 per Mtok).
  Transcripts, diffs, and final texts are scanned for canary phrases from the
  landing diff; a hit voids the row (`canary_leak`).

## Running

```sh
node eval/selfcheck.js                # before spending tokens
node eval/run.js --dry                # list pending cells
node eval/run.js --filter batp --reps 1   # preflight-sized slice
node eval/run.js                      # full matrix (resumable)
node eval/run.js --results eval/results/<dir>   # resume that run
node eval/summarize.js                # table + pre-registered rubric
node eval/judge.js a.patch b.patch "task"       # optional advisory pairwise judge
```

The decision rubric lives in `summarize.js` and was pre-registered in the plan
before any data was collected; results feed an ADR, not ad-hoc binding edits.

## Authoring units

A unit is a directory under `tasks/`, `traps/`, or `scenarios/` with a
`manifest.json` (`id` = dir name; see any existing unit), a `prompt.md` brief
(contract kernel from `kernels/` is prepended at run time), optional
`plant.sh`/`defect.sh` (run before the seed/integration commit), optional
`oracle/*.oracle.js` (never `*.test.js` — the root `node --test` must not see
them; imports are written relative to `<fixture>/eval-oracle/`), and
`ground-truth.diff` for reference. Prompts must contain only what was knowable at
the parent commit; canary phrases are strings only the shipped diff contains.
