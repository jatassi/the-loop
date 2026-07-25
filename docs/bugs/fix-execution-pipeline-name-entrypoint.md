# fix-execution-pipeline-name-entrypoint — execution-pipeline is model-reachable by name through an entry point that cannot work by construction

**Date:** 2026-07-25 · **Affects:** execution-pipeline (plugin manifest and splice contribute) · **Class:** footgun-by-construction / stale-contract-prose · **Cause established by:** reproduced
**Environment:** the-loop v0.5.1 (checkout `4e67313`), consuming project `~/Git/spool`, Claude Code 2.1.220 Workflow harness (Bun/JavaScriptCore — the `JSON Parse error:` phrasing is JSC's, not V8's); failing run `wf_b21ecb88-983` · **Determinism:** always, on this invocation path · **Regressed since:** never worked — the `name` entry point has never been able to succeed; `256571d` (2026-07-09) fixed the `--script-out` path but left this one reachable and advertised

> Diagnosed read-only from the consuming project. Severity is medium: `/begin`'s
> path is correct and unaffected. Amended into the graph 2026-07-25 as two
> features — `fix-execution-pipeline-name-entrypoint` (close the broken door) and
> `execute-skill` (open the right one); see **Fix design** for the split.

## Steps to reproduce

1. From any consuming project with the-loop installed as a plugin, invoke the
   pipeline the way its own skill listing advertises — via the Skill tool rather
   than through `/begin`:
   `Skill({ skill: "the-loop:execution-pipeline", args: "<any free text>" })`
2. The skill body returns a harness-generated instruction:
   `Invoke: Workflow({ name: "the-loop:execution-pipeline", args: "<that free text, verbatim>" })`
3. Follow it.

## Expected result

The pipeline runs Plan → Build → Validate → Record over the scoped feature — or,
failing that, refuses with an error that names the correct way to launch it.

## Actual result

The run dies in ~7ms with 0 agents spawned, and no indication of the remedy:

```
Error: JSON Parse error: Unexpected identifier "Execution"
    at parse (native)
    at <anonymous> (workflow.js:6:62)
```

## Root cause(s)

The trigger is a model reading the skill listing, invoking the pipeline with
free-text args, and following the returned instruction verbatim. Five causes sit
behind it. Cause 0 is the generator — it explains why a model went looking for a
door at all; causes 1–4 explain why the door it found could not work.

**0 · There is no named surface for "launch the pipeline on this scope."** Every
other phase of the loop is a skill a model can reach for by name — `define`,
`design`, `diagnose`, `configure`, `onboard`, `release`, `operate`. Launching is
not: the recipe exists only as a section inside another skill's body
(`plugin/skills/begin/SKILL.md:97-135`, "The prepare-execution-context leg"). The
`diagnose` skill's own hand-off (step 6) says *"offer the prepare-execution-context
leg"* — naming a leg whose recipe lives in a skill it never names. So a session
that has just written a bug up and wants to fix it now has three choices:
reconstruct the recipe from memory, invoke `/begin` (the general front door, which
re-orients from scratch and may propose something else), or reach for the one entry
in the skill listing that looks like "run the pipeline." It took the third. **The
missing surface is the pressure; the broken door is only where the pressure went.**

**1 · Every `.js` under `plugin/workflows/` is unconditionally registered as a
model-invocable skill named `<plugin>:<meta.name>`, and plugins have no opt-out.**
Resolving `Workflow({name})` yields the *canonical, unspliced* script —
`EMBEDDED_CONTEXT === null` by construction — so the `name` entry point is
guaranteed to fall through to `JSON.parse(args)`. The `--script-out` splice
(`cli/src/splice.rs:58-82`) is the only thing that ever populates
`EMBEDDED_CONTEXT`, and it writes to a scratch path reachable only via
`scriptPath`, never via `name`. **A `name`-addressable registration of this script
cannot succeed under any input.**

**2 · The `Invoke:` line is a hardcoded harness template that always emits
`{ name, args }`.** the-loop cannot make the skill body emit the `--script-out`
recipe; it controls only the `description`, `whenToUse`, and `phases` text.

**3 · `meta.whenToUse` is stale and actively steers into the broken path.** It
still reads *"Launched by /begin with the `the-loop prepare-execution-context`
execution context **as args** — never invoked bare"* — written before the
args-transport fix and never updated by it. It renders into the model's context
immediately above the harness's `Invoke: Workflow({name, args})` line, so the
model reads "pass the execution context as args" and does exactly that. It also
says "never invoked bare" while giving no working recipe for invoking it
non-bare — an instruction that forbids the only safe thing and describes the
unsafe one.

**4 · The script has no fail-fast.** `JSON.parse` at
`plugin/workflows/execution-pipeline.js:16` is unguarded, so a bad `args` produces
a raw JSC parse error with no hint of the correct recipe — 7ms of nothing, and a
consuming session left to reverse-engineer the remedy (which is what happened
here).

This is a recurrence-by-another-door of
[`fix-execution-context-args-transport.md`](./fix-execution-context-args-transport.md)
(2026-07-09, `256571d`). That fix made the `--script-out` path lossless but left
the `args` path reachable *and advertised*.

## Evidence

1. **Reproduced, exact string.**
   `bun -e 'JSON.parse("Execution context JSON is at /tmp/x.json — read it as the execution context")'`
   → `JSON Parse error: Unexpected identifier "Execution"`, byte-identical to the
   report. Node gives a different message (`Unexpected token 'E'`), confirming the
   harness runtime is Bun/JSC.

2. **The failed run's script is byte-identical to the canonical repo file.**
   `diff plugin/workflows/execution-pipeline.js <run-script>` → identical,
   `EMBEDDED_CONTEXT = null` at line 13. Also byte-identical to the installed
   plugin copy at
   `~/.claude/plugins/cache/the-loop/the-loop/0.5.1/workflows/execution-pipeline.js`
   — that installed copy is what the `name` lookup resolves.

3. **The skill body, verbatim from the consuming session's transcript** (record 139):
   > Run the "the-loop:execution-pipeline" workflow. / \<description\> /
   > \<whenToUse\> / Phases: … /
   > `Invoke: Workflow({ name: "the-loop:execution-pipeline", args: "<the model's free text, verbatim>" })`

4. **The `Invoke:` line is harness-generated, not ours.** In the Claude Code binary
   v2.1.220, function `Bep` / `createWorkflowCommand` (offset ≈ 237448824):
   ```js
   n = t.trim(), o = Ie(e.name),
   i = n ? `{ name: ${o}, args: ${Ie(n)} }` : `{ name: ${o} }`;
   return [{type:"text", text:`Run the "${e.name}" workflow.\n\n${e.description}…\n\nInvoke: Workflow(${i})`}]
   ```
   The `args` passthrough is hardcoded and stringified (`Ie` = `JSON.stringify`),
   so this entry point can only ever deliver a **string** — while the Workflow
   tool's own `args` schema says *"Pass arrays/objects as actual JSON values, NOT
   as a JSON-encoded string"* (offset ≈ 196223408).

5. **No opt-out exists for plugin workflows.** The loader `Mju` and meta validator
   `Sg_` (offset ≈ 231665404) accept only
   `{name, description, title, whenToUse, phases}` and build the record with **no
   `hidden` field**; `NLy` then registers everything (`.filter(r => !r.hidden)`).
   The `hidden: true` lever exists only for Claude Code's own bundled workflows
   (offset ≈ 235362706), registered through a JS API plugins can't reach. Auto-load
   is manifest-controlled:
   `let D = !a.workflows && <workflows/ dir exists>; if (D) u.workflowsPath = join(pluginPath,"workflows")`
   (offset ≈ 231772731). `plugin/.claude-plugin/plugin.json` has no `workflows` key
   → the directory is auto-loaded → the file is registered.

6. **`/begin` is correct and unaffected.** `plugin/skills/begin/SKILL.md:101` passes
   `--script-out`; `:116-119` binds `scriptPath` to that path and says **"Pass no
   `args`"** with the reason. Pinned by
   `test/skills-and-command-sweep.test.js:86-95`. The engine is compiled into the
   Rust CLI (`cli/src/lib.rs:73-75`,
   `include_str!("../../plugin/workflows/execution-pipeline.js")`) and spliced by
   `cli/src/commands/prepare_execution_context.rs:147` → `cli/src/splice.rs:58-82`.

7. **Cause 3 confirmed by history.**
   `git log -L11,11:plugin/workflows/execution-pipeline.js` shows the meta line last
   changed in `fc8fb0f` (adding the Record phase) and `4dcc08e` (`/the-loop` →
   `/begin`). `git show --stat 256571d` touched the script's header comment and
   splice target but **not** the meta line — the `whenToUse` prose was never brought
   in line with the fix it describes.

8. **Cause 0 confirmed by surface inventory.** `plugin/skills/` holds a skill per
   phase — `begin`, `define`, `design`, `diagnose`, `configure`, `onboard`,
   `release`, `operate`, `code-quality`, `using-the-loop`, `write-skills` — and none
   for launching a run. The only prose recipe is `plugin/skills/begin/SKILL.md:97-135`,
   and the only other reference to it is `plugin/skills/diagnose/SKILL.md` step 6,
   which names the leg without naming its home.

## Fix design

Two features, split along the two halves of the problem, with an edge between them.
This RCA doc is the fix feature's design doc (the `designs/`-then-`bugs/` lookup
fallback); `execute-skill` gets its own at `docs/designs/execute-skill/design.md`.

### A · `fix-execution-pipeline-name-entrypoint` — close the broken door

**A1 · Move the script out of `plugin/workflows/`** (to `cli/assets/execution-pipeline.js`).
The harness auto-registers that directory and offers no opt-out, so relocation is
the only way to stop the registration. `include_str!` at `cli/src/lib.rs:74-75` is
the script's **only** runtime consumer — nothing reads the file from disk at run
time, and no resume path uses `name` (the harness persists each invocation's script
by path). After the move, `Workflow({ name: "the-loop:execution-pipeline" })` fails
at resolution with an unknown-workflow error, and the entry disappears from every
consuming session's skill listing.

**Blast radius — ten files reference the path, not one:**

| file | reference |
|---|---|
| `cli/src/lib.rs:75` | `include_str!` path |
| `eslint.config.js:125` | `plugin/workflows/**/*.js` glob (harness-globals block) |
| `test/execution-pipeline-{meta,happy,agent,blocked,halt,drive,record}.test.js` | `const SCRIPT = 'plugin/workflows/execution-pipeline.js'` |
| `test/plan-prompt-commit-gate.test.js:8` | same constant |
| `test/merge-posture.test.js:25,50` | path in a literal array and a `read()` |
| `test/runbook-genre-rename.test.js:21,70,72` | `plugin/workflows` in the living-surface sweep list |
| `plugin/skills/begin/SKILL.md:106,117` | prose naming `workflows/execution-pipeline.js` by path |
| `docs/architecture.md:58` | engine location in the system narrative |

**A2 · Correct `meta.whenToUse`.** After A1 it renders nowhere, so this is an
accuracy fix for readers rather than a mechanism — but the file must not keep
asserting a recipe that has been wrong since `256571d`. New value names the real
launcher and the real channel:

> `whenToUse: 'Launched by the execute skill via `the-loop prepare-execution-context --script-out`, which embeds the execution context as a literal; never resolvable by name'`

> ⚠️ `cli/src/splice.rs:359` hardcodes the current meta line byte-for-byte and will
> fail until updated in the same commit. `test/execution-pipeline-meta.test.js`
> asserts phases only and will not catch the drift.

**Packaging — verified, not a risk.** No build or release script copies `plugin/`
into the published artifact; `.claude-plugin/marketplace.json` sets
`source: "./plugin"` and the installer takes that directory wholesale. Moving the
file out means it stops being shipped in the bundle, which is correct — the binary
carries the only copy anything executes. The recorded Release runbook names no path
under `plugin/workflows/`.

### B · `execute-skill` — open the right one

Cause 0's remedy, designed at `docs/designs/execute-skill/design.md`: extract the
prepare-execution-context leg from `/begin`'s body into a first-class
`the-loop:execute` skill that takes a scope, and have `/begin`'s
`advance-eligible-set` route and `diagnose` step 6 both delegate to it by name.
Depends on A — it inherits the moved path and the corrected prose rather than
writing prose that goes stale on landing.

### Alternatives rejected

- **Add a fail-fast guard to the script** (~6 lines returning a `blocked` summary
  naming the `--script-out` recipe when no execution context resolves) — *rejected
  2026-07-25, human's call*. Once A1 lands, the harness cannot reach the script
  without a `scriptPath`, and every `scriptPath` caller passes a spliced copy; the
  guard would defend an entry point that no longer exists. **Accepted cost:**
  consuming projects pinned to an installed plugin ≤ v0.5.1 keep the opaque parse
  error until they update the plugin. Recorded here so a future recurrence knows
  this was chosen, not overlooked.
- **`"workflows": []` in `plugin/.claude-plugin/plugin.json`** also suppresses
  auto-load, but the loader then emits a `folder-shadowed-by-manifest`
  plugin-loading warning — noisier than moving the file.
- **Accept a filesystem path in `args`** — *impossible*. The workflow sandbox has no
  filesystem: the harness's own Workflow docs say *"No filesystem or Node.js API
  access"* (offset ≈ 234460015), matching the script's header comment at
  `plugin/workflows/execution-pipeline.js:2-5`. The script could only read the file
  by spawning an agent and squeezing a 28KB context back through a return schema —
  strictly worse than `--script-out`.
- **Make the skill body emit the `--script-out` recipe** — *not available*. The body
  is generated wholly by `Bep` in the Claude Code binary; we can only influence the
  description/whenToUse/phases text.
- **Leave the entry point and rely on prose alone** — the prose is exactly what
  failed here: the model read "never invoked bare" as license to invoke it *with
  args*. Prose without a hard failure mode is not a guard.

## Regression

- `plugin/workflows/` does not exist; no `.js` file ships under any auto-registered
  plugin workflows directory, so no consuming session's skill listing contains
  `the-loop:execution-pipeline`.
- Given the moved script, `the-loop prepare-execution-context --features <id>
  --target-branch <ref> --script-out <path>` still writes a launch-ready spliced
  copy, and both shape gates (meta line, `EMBEDDED_CONTEXT` line) still hold.
- `meta.whenToUse` names `prepare-execution-context --script-out` and does not
  contain the phrase "as args".
- No living surface names a path under `plugin/workflows/` — the string greps to
  zero outside historical records (`docs/adr/`, `docs/briefs/`, `docs/releases/`,
  `docs/bugs/`, `docs/calibration/`, `docs/validation/`, `docs/designs/` of shipped
  features).
- `/begin`'s launch recipe still passes `--script-out` and binds `scriptPath` with
  no `args`, and `test/skills-and-command-sweep.test.js:86-95` still passes.

**Why no test caught it.** No test models the harness's auto-registration of plugin
workflows as model-invocable skills, so the second entry point does not exist in any
test's world. `test/execution-pipeline-meta.test.js` asserts `meta.phases` only —
`name`, `description`, and `whenToUse` are untested, so stale prose is invisible to
it. `test/execution-pipeline-harness.test.js:105-131` writes its **own fixture**
mirroring the resolution line rather than exercising the real script, and feeds only
*valid* inputs (embedded object, args object, args JSON-string) — the crash path has
never been executed by a test. `test/skills-and-command-sweep.test.js:86-95` proves
the *good* path exists but says nothing about a competing bad one. And
`cli/src/splice.rs:357-396` pins the meta line's exact bytes while treating
`whenToUse` as opaque text — it preserves the stale string rather than judging it,
and would actively resist the correction. The prior RCA already named this gap and it
remains open: *"the script has no filesystem, and its test harness feeds `args` as an
in-process object — no test ever crossed the real harness string channel"*
(`fix-execution-context-args-transport.md:58-61`).

Cause 0 has no test-shaped miss to explain: a missing surface is invisible to tests
by definition. What would have caught it is the question this RCA adds to the design
posture — *does every phase a session can be in have a named way out?*

## Validation procedure

Folds into **execution-pipeline**'s validation procedure as an added check: confirm
no plugin-registered workflow named `the-loop:execution-pipeline` appears in a
consuming session's skill listing, and that `/begin` still runs a real feature end
to end through the spliced `scriptPath`. No standalone validation procedure for the
fix.
