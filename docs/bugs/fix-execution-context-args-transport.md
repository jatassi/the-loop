# fix-execution-context-args-transport — the Workflow `args` channel corrupts the execution context, killing the run before any agent spawns

**Date:** 2026-07-09 · **Affects:** execution-pipeline (begin skill and prepare-execution-context contribute) · **Class:** contract-drift / lossy-transport (parse-edge) · **Cause established by:** reproduced
**Environment:** the-loop v0.4.9 (checkout `b69fc0f`), consuming project `~/Git/j45`, Claude Code Workflow harness (Bun/JavaScriptCore — the `JSON Parse error:` phrasing is JSC's, not V8's); failing run `wf_bab2456f-a1b` · **Determinism:** deterministic given the payload — triggers whenever the context JSON carries nested escaped quotes (`\"`) whose first lost escape lands in object context; smaller or plainer scopes can sail through, which is why earlier runs passed · **Regressed since:** unknown — content-dependent, so no clean known-good ref; the channel was never proven lossless

## Steps to reproduce

1. From `~/Git/j45` (or any consuming project whose design docs contain nested
   escaped quotes — here `data-audio=\"on\"` in live-session's acceptance):
   `node plugin/bin/the-loop.js prepare-execution-context --features live-session --target-branch main --script-out <scratch>/execution-pipeline.js`
   → a ~28KB context JSON, valid under both Node and Bun.
2. Launch the Claude Code Workflow tool with `scriptPath` = the spliced script and
   `args` = that JSON, per the begin skill's step 3 ("`args` = the execution
   context JSON, verbatim").
3. Standalone equivalent of what the harness delivers: strip one level of
   backslash-escaping from the payload string and `JSON.parse` it under Bun.
   Minimal case: `JSON.parse('{"a":"foo"bar","b":"y"}')`.

## Expected result

The script's `args` global is the parsed execution context (or a losslessly
JSON-encoded string of it); the run schedules Plan/Build/Validate. Contract:
`plugin/workflows/execution-pipeline.js` header ("consumes the
`the-loop prepare-execution-context` execution context via `args`") and the begin
skill's launch leg.

## Actual result

The run dies in ~5ms with zero agents spawned:

```
Dynamic workflow "live-session → main" failed: Error: JSON Parse error: Expected '}'
    at parse (native)
    at <anonymous> (workflow.js:3:63)
```

`args` reached the sandbox as a *string* that had lost one level of
backslash-escaping, so `JSON.parse(args)` at `plugin/workflows/execution-pipeline.js:13`
threw before any scheduling ran.

## Root cause(s)

- **Underlying cause:** the begin skill routes the entire execution-context JSON —
  a large, heavily escaped payload (design-doc markdown with nested `\"`, `\n`,
  code fences) — through the Workflow tool's `args` parameter, a channel that
  re-emits the payload through the model's token stream and is not lossless at
  this size and escape depth. One lost backslash on a nested quote
  (`…data-audio=\"on\"…` → `…data-audio="on"…`) terminates the JSON string early;
  the parser then hits a bare token where it expects `,` or `}` — JSC reports
  exactly `Expected '}'` when the break lands in object context.
- **Trigger:** a scope whose design doc contains nested escaped quotes in object
  context (live-session's `data-audio=\"on\"`).
- The lossless channel already exists and is unused for this: `--script-out`
  (`plugin/bin/cli-commands.js:288` `writeSplicedWorkflowScript`) writes a per-run
  script copy via the filesystem, splicing only the `meta` description
  (`cli-commands.js:282`). Filesystem writes round-trip the same payload
  byte-identically.
- **Why nothing caught it:** the script has no filesystem, and its test harness
  (`test/execution-pipeline-harness.js`) feeds `args` as an in-process object —
  no test ever crossed the real harness string channel. No ADR pins args-transport
  fidelity; the contract lived only in a header comment and skill prose.

## Evidence

1. The generated 28KB context parses clean under Node and Bun — the payload and
   script are valid; only the transport corrupts (control: the same run launched
   with the context embedded in the script and no `args`, `wf_94068f60-f16`, ran).
2. Error phrasing `JSON Parse error: …` reproduces only under Bun/JSC, pinning the
   harness runtime.
3. Candidate transformations against the real payload: HTML-entity encoding →
   parses fine (the entities in the failure dump are display-escaping);
   truncation → `Unterminated string` (wrong signature); single unescape pass →
   the `Expected '<bracket>'` family; minimal object-context case
   `{"a":"foo"bar","b":"y"}` → **`Expected '}'`**, the exact reported error.
4. Embedding `const executionContext = <JSON.stringify(ctx)>;` in a file and
   loading under Bun round-trips identically — the fix path is lossless.

## Fix design

Make the spliced script self-contained; `args` becomes a dev/test fallback only.

1. `plugin/workflows/execution-pipeline.js` — add a splice target and prefer it:
   ```js
   const EMBEDDED_CONTEXT = null; // spliced to a literal by prepare-execution-context --script-out
   const executionContext = EMBEDDED_CONTEXT ?? (typeof args === 'string' ? JSON.parse(args) : args);
   ```
2. `plugin/bin/cli-commands.js` — `writeSplicedWorkflowScript` (called at :282 with
   the assembled context now passed in) additionally splices
   `const EMBEDDED_CONTEXT = <JSON.stringify(executionContext)>;` over the target
   line; shape-gate like the meta splice — target line missing → exit 1, nothing
   written.
3. `plugin/skills/begin/SKILL.md` step 3 — launch the Workflow with **no `args`**
   (the script copy is self-contained), with one sentence naming why: the args
   channel is lossy for large escaped JSON.
4. Constraint: the canonical script must keep working under the test harness with
   in-process `args` (EMBEDDED_CONTEXT stays `null` there).
5. Note for rust-cli-replatform: `run-commands-rust`'s byte-parity acceptance for
   `--script-out` tracks the JS CLI's output — this fix moves that target; land it
   before parity is measured.

## Regression

- A context whose designDoc contains nested escaped quotes (`\"`) written via
  `--script-out` produces a script that runs under the harness with **no args**
  and whose `executionContext` deep-equals the assembled context.
- The splice shape-gate: canonical script missing the `EMBEDDED_CONTEXT = null`
  target → exit 1, nothing written.
- Harness/in-process `args` path still works (object and JSON-string forms).

## Validation procedure

No per-feature procedure exists for the pipeline launch leg; the regression is
pinned in the suite (`test/prepare-execution-context-script-out.test.js` and an
argless case in the execution-pipeline harness tests). The fix's validator adds an
argless-launch exercise step to the begin front door's recorded procedure
(`docs/validation/begin-front-door-rename/procedure.md`), never a standalone
procedure for the fix.
