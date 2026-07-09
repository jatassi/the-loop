# json-cutover — the atomic swap: migrate artifacts to JSON, flip every invocation site, delete the JS CLI

**Status:** designed 2026-07-09 from `docs/briefs/rust-cli-replatform.md` (ADR-0051).

The flip the whole replatform builds toward — Sumner's "everything all at once"
shape: the Rust CLI is already at proven parity (parity-oracle at zero pending is a
precondition, not a goal, of this feature), so the cutover is a mechanical, scripted,
heavily-gated landing, not an engineering effort.

## Execution mode — the one load-bearing deviation

**This feature lands as a human-gated session commit, never via the execution
pipeline.** The pipeline's own post-merge machinery — the validator's `set-status`,
the record agent's `calibration-summarize` — shells to the CLI named in the execution
context, which for any run prepared before the flip is the JS CLI; on the flipped
tree the YAML artifacts and the JS CLI those calls need are gone mid-run. A
self-modifying tool cannot atomically swap itself while running on itself. So: every
other replatform feature runs through the pipeline normally; this one is performed in
a session with the human at the gate, on a worktree branch, merged on approval
(ADR-0034's posture — self-edits take effect next run — applied at its limit). The
run that follows the merge is the first to run on the Rust binary. No calibration
record is captured for the cutover itself (session landings never record; accepted).

## Preconditions (verify before starting, refuse loudly otherwise)

- Oracle at 100% pass / zero pending against the Rust binary.
- `the-loop` installed on PATH from a real release (binary-distribution shipped) and
  `the-loop --version` matching the release the flip targets.
- No unmerged `loop/*` branches carrying YAML plans (stale in-flight work is
  re-planned after cutover, not migrated).

## The landing, in order

1. **Migrate this repo's artifacts** by one-shot script (dev-side node — it may use
   the JS parser precisely because this is that code's last act):
   `docs/feature-graph.md` → `docs/feature-graph.json`;
   `docs/calibration/runs/*.md` → `*.json`; `plugin/config/executors/*.md` machine
   blocks re-fenced yaml → json. Each migration is verified semantically: the JS
   CLI's parse of the old file and the Rust binary's parse of the new are JSON-equal.
   YAML originals deleted. (The prose that headed `feature-graph.md` — the state
   machine's four statuses, where narrative lives — moves into
   `docs/architecture.md`'s artifact-set section; JSON carries no prose.)
2. **Flip every invocation site** to bare `the-loop`: the five skills + the workflow
   script + agent texts, the recorded bindings (Validation procedure's exercise
   lines, Release runbook ready-checks, Operations toolkit), and the `cli` field
   emitted by the *JS* CLI is moot — it is deleted; the Rust binary already emits
   `the-loop`. `bin/create-sample-repo.js` seeds JSON-artifact fixtures from here on.
3. **Delete the JS path**: `plugin/bin/`, `plugin/src/`, vendored
   `plugin/node_modules/` (the `yaml` package leaves the tree entirely),
   `plugin/package.json` engines/bin remnants; retire the JS-implementation unit
   tests; the oracle's JS driver retires with them (the corpus stays — it is now the
   Rust binary's black-box regression suite). `plugin/config/*.json` +
   `config/executors/` move to `cli/config/` as the compiled-in defaults' source
   (config-commands-rust posture). What remains under `plugin/` is agent-pack
   content: skills, agents, commands-free front door, and the harness-executed
   workflow script — no runtime JavaScript invoked via node.
4. **Gates on the flipped tree**: `cargo fmt --check && cargo clippy --all-targets
   && cargo test`; `npm test` (remaining dev suites: workflow harness, skill packs,
   oracle-on-Rust) and `npm run check` (its `node plugin/bin/the-loop.js check` leg
   updated to `the-loop check`); grep gates — `the-loop.js` and the vendored yaml
   path zero outside historical records (`docs/adr/`, `docs/research/`,
   `docs/briefs/`, `docs/releases/`, `docs/bugs/`, `eval/`); loop-alive checks —
   `the-loop status --json` proposes correctly on the migrated graph,
   `prepare-execution-context` assembles a valid context naming `cli: "the-loop"`.
5. **Human gate → merge → release**: the post-merge release (release skill, normal
   gate) ships the first plugin version whose surfaces call the binary.

## Touched surfaces

| Surface | Change |
|---|---|
| `docs/feature-graph.json` (new) / `.md` (deleted) | the migration |
| `docs/calibration/runs/*` | md → json |
| `plugin/config/executors/grok.md` | machine-block fence yaml → json |
| `plugin/skills/*`, `plugin/agents/*`, `plugin/workflows/execution-pipeline.js` | invocation flip to `the-loop` |
| `docs/architecture.md` | recorded bindings' command lines; artifact table rows; replatform section marked landed |
| `plugin/bin/`, `plugin/src/`, `plugin/node_modules/` | deleted |
| `test/` | JS-implementation unit tests retired; oracle pinned to Rust target |
| `bin/create-sample-repo.js` | seeds JSON fixtures |

## What the session driver would otherwise guess

- The workflow script itself stays JavaScript — it is executed by the harness's
  workflow runtime, not node; only the *strings* it shells (via the context's `cli`
  field) change, which they already have.
- The graph migration carries statuses as they stand at flip time — including this
  feature's own `designed` status; its `validated`/`shipped` flips happen *after*
  the merge, via the Rust binary, at the human's word. Nothing pre-stamps success.
- Historical records are never rewritten: old release records, ADRs, briefs, and bug
  docs keep their `the-loop.js` and YAML references verbatim.
- If any gate in step 4 fails, the branch stays unmerged for inspection — fail
  closed, repair by re-run; the main checkout never sees a half-flipped state.

## Acceptance (from the feature graph)

1. Artifacts migrated (graph, calibration runs, executor fences), each verified
   JS-parse ≡ Rust-parse, YAML originals deleted.
2. Every living invocation site calls bare `the-loop`; context `cli` field says
   `the-loop`; `the-loop.js` greps to zero outside historical records.
3. `plugin/bin`, `plugin/src`, vendored node_modules gone; no runtime JS in the
   bundle beyond the harness-executed workflow script; `yaml` package gone.
4. Full oracle corpus green on Rust with zero pending before the flip; JS driver
   retires with the JS CLI.
5. `bin/create-sample-repo.js` seeds JSON fixtures; recorded validation procedure
   exercises bare `the-loop`.
6. Loop alive end to end on the flipped tree; cargo + npm gates green.
