# fix-record-prompt-cli — the Record spawn's prompt never names the CLI invocation, so the record agent blocks on bare `the-loop` and calibration capture is lost

**Date:** 2026-07-09 · **Affects:** calibration-capture (execution-pipeline and the record agent contribute) · **Class:** contract-drift (prompt omits the invocation the agent doc assumes) · **Cause established by:** reproduced
**Environment:** the-loop v0.4.9 (checkout `b69fc0f`), consuming project `~/Git/j45`, run `wf_94068f60-f16`; execution context `cli` = `node "…/the-loop/plugin/bin/the-loop.js"`, no `the-loop` on PATH · **Determinism:** always, whenever the CLI is not on PATH as bare `the-loop` — i.e. every installed-plugin or source-checkout run today · **Regressed since:** never worked — the record agent has assumed a PATH-resolvable `the-loop` since calibration-capture landed (v0.4.9)

## Steps to reproduce

One command, red on the symptom (green once fixed) — run from the checkout root:

```bash
node <scratch>/repro-record-cli.mjs
```

where the script drives the real `plugin/workflows/execution-pipeline.js` through
`test/execution-pipeline-harness.js` with a context whose `cli` is
`node "<abs>/plugin/bin/the-loop.js"`, replies plan→built→validated for one
small-path feature, and asserts the Record-phase spawn's prompt contains that
invocation. Output today:

```
build prompt carries CLI: true
RED: record prompt has no CLI invocation — agent falls back to bare `the-loop` on PATH
```

Live confirmation: in run `wf_94068f60-f16` the record agent (prompt: 1801 chars,
no CLI anywhere) ran `the-loop worktree-create main` and returned
`{"result": "blocked", "detail": "the-loop command not found in PATH; …"}`.

## Expected result

Every pipeline agent that must invoke the CLI is told how, in its prompt — the
build/validate/drive prompts carry explicit `${CLI} worktree-create …` lines
(`execution-pipeline.js:189/207/223`). The record agent's doc
(`plugin/agents/record.md:22,55,70`) requires `the-loop worktree-create`,
`the-loop calibration-summarize`, and `the-loop worktree-remove` — so its spawn
must name the working invocation too. Calibration-capture's acceptance: a run
ending blocked or halted still lands its record.

## Actual result

The record spawn's prompt is exactly the byte-pinned YAML payload
(`recordPayload`, `execution-pipeline.js:469`), assembled from `preparedAt`,
`scope`, and `target` only — `executionContext.cli` is never threaded in
(`execution-pipeline.js:546-551`). The agent falls back to the bare `the-loop`
its doc names, finds nothing on PATH, and blocks. The run summary is unchanged by
design, so the failure costs exactly the calibration record — silently, every run.

## Root cause(s)

- **Underlying cause:** two contributors drifted — `record.md` hardcodes bare
  `the-loop` (a post-`json-cutover` assumption, valid only once the binary is on
  PATH), and the record spawn is the only CLI-needing spawn whose prompt assembly
  omits the `cli` binding.
- **Trigger:** any run where `executionContext.cli` ≠ PATH-resolvable `the-loop`
  — currently all of them.
- **Why nothing caught it:** `test/execution-pipeline-record.test.js` pins the
  payload byte-for-byte with contexts that never set `cli`, and no test asserts
  the record prompt names an invocation; the agent doc's shell commands are prose
  no suite executes.

## Evidence

The red repro above (asymmetry shown in one run: build prompt carries the CLI,
record prompt doesn't), the `wf_94068f60-f16` transcript
(`agent-a98a266f79b2aeda3.jsonl`: `"command":"the-loop worktree-create main"`,
blocked return), and inspection of `recordPayload`'s inputs at
`execution-pipeline.js:546`.

## Fix design

Keep the transcribed calibration artifact byte-identical; deliver the invocation
outside the payload.

1. `plugin/workflows/execution-pipeline.js` — spawn the record agent with the
   payload plus a trailer the agent does not transcribe:
   `payload + '\n\ncli: ' + CLI` (exact trailer shape the builder's call, but it
   must be deterministic and excluded from the artifact).
2. `plugin/agents/record.md` — invoke the CLI as named by the prompt's `cli:`
   trailer; fall back to bare `the-loop` when absent. State explicitly that the
   trailer is not part of the transcribed payload.
3. Tests — extend the pinned record tests to cover `cli`-present and `cli`-absent
   contexts: prompt carries the invocation when bound; the transcribed payload
   (everything above the trailer) stays byte-identical to today's pinned YAML.
4. Note: `json-cutover` later flips every invocation site to bare `the-loop`;
   the trailer mechanism stays correct either way (the trailer will simply say
   `the-loop`).

## Regression

- Given a context with `cli` bound to a non-PATH invocation, the Record spawn's
  prompt names that invocation (the repro command goes green).
- The transcribed calibration payload is byte-identical to the pre-fix pinned
  YAML for the same observations.
- A `cli`-absent context still spawns record with a working default.

## Validation procedure

`docs/validation/calibration-capture/procedure.md` gains one exercise step: run a
scoped pass from a consuming project where `the-loop` is not on PATH and confirm
the run lands its calibration record (no `blocked … not found in PATH`).
