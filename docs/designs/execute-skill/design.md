# execute-skill — the loop's launch surface, extracted from /begin

## What it is

A bundled skill, `execute` (invoked `the-loop:execute`), that owns one job: take a
scope, assemble and gate its execution context, launch the pipeline, and relay the
run summary. It is the loop's **launch surface** — the named way to say "run these
features now."

This is an **extraction, not an addition**. The recipe already exists, as a section
inside another skill's body (`plugin/skills/begin/SKILL.md`, "The
prepare-execution-context leg"). This feature moves it to its own surface and makes
`/begin` delegate to it, the same way `/begin` already delegates to `define`,
`design`, `configure`, `onboard`, `release`, and `diagnose`. Net surface: one new
skill, ~35 lines removed from `/begin`, and one recipe instead of one recipe plus
one dangling reference to it.

No new mechanism is built. `the-loop prepare-execution-context`, the splice, the
engine, and the Workflow call are all unchanged.

## Why it exists

From the diagnosis in `docs/bugs/fix-execution-pipeline-name-entrypoint.md` (cause
0). Every phase of the loop is reachable by name except launching. The `diagnose`
skill's hand-off says *"offer the prepare-execution-context leg"* — naming a leg
whose recipe lives in a skill it never names. A session that has just written a bug
up and wants to fix it now has to reconstruct the recipe from memory, invoke the
general front door and hope it proposes the same thing, or reach for whatever in the
skill listing looks like "run the pipeline."

In the reported incident it reached for the auto-registered
`the-loop:execution-pipeline` workflow — an entry point that cannot work by
construction. The companion feature `fix-execution-pipeline-name-entrypoint` closes
that door. This one opens the correct one, so the pressure has somewhere to go.

The concrete motivating flow, in the human's words: *`/diagnose` a bug → agent
writes it up → I want to immediately launch the workflow to fix it.* `/begin` is the
general front door and doesn't fit that moment — it re-orients from scratch and
proposes a next action, when the next action is already known.

## How it fits the architecture

The loop's phase surfaces are skills; the machine truth lives in the CLI; the
engine is a Workflow script the CLI splices per run. `execute` sits exactly where
`/begin`'s launch route already pointed:

```
/begin ──(advance-eligible-set | build jump)──┐
                                              ├──> the-loop:execute <scope>
/diagnose (step 6 hand-off) ──────────────────┤        │
                                              │        ├─ the-loop prepare-execution-context
human, directly ──────────────────────────────┘        │      --features … --target-branch … --script-out …
                                                       └─ Workflow({ scriptPath }) with no args
```

`/begin` keeps orientation, route selection, and the missing-binary posture.
`execute` keeps scope confirmation, context assembly, launch, and summary relay.
Neither duplicates the other's job.

## Interfaces it touches

**`the-loop prepare-execution-context`** — unchanged, quoted here because the skill
body must state it exactly:

```
the-loop prepare-execution-context --features <id,id,…> --target-branch <ref> --script-out <session-scratch path> [--graph-path <snapshot path>]
```

`--target-branch` is required. `--script-out` writes a launch-ready copy of the
canonical engine with `meta.description` spliced to name this run's scope and target
and the execution context spliced in as a JS literal. The command refuses with
reasons on any gate failure (invalid graph, bad scope, a `proposed` feature in
scope, broken model bindings, malformed canonical script) and prints nothing to
stdout on refusal.

**The Workflow call** — `scriptPath` = the `--script-out` path, and **no `args`**.
The `args` channel is lossy for large escaped JSON: it round-trips through the
model's token stream and can silently corrupt nested escaped quotes. This is the
constraint the companion fix's incident came from, and the skill body must carry the
reason, not just the rule.

**The run summary** — the engine returns `completed` | `blocked` | `stalled` |
`halted`, plus any `model-selection —` lines in the run log. The relay behavior moves
across verbatim from `/begin`.

**`plugin/skills/begin/SKILL.md`** — the route table entry for
`advance-eligible-set` / the `build` jump becomes a delegation to this skill, and the
leg section is deleted. `/begin`'s bound-artifact-store section keeps its
orientation half.

**`plugin/skills/diagnose/SKILL.md`** step 6 — the hand-off names the skill and the
fix id instead of naming a bare CLI fragment.

## Decisions

**The human gate travels with the launch, not with the invoker.** Nothing scoped
starts without a human confirm. A human who typed `/the-loop:execute fix-foo` has
already given it — launch. A *model*-initiated invocation (the diagnose hand-off, a
`/begin` route) must present the resolved scope and target branch and wait. The
skill body states this as a branch on who invoked it, because the same skill serves
both and the distinction is the only thing standing between "extracted a surface"
and "made autonomous launch one token easier."

**Bare invocation resolves the eligible set; it does not propose a route.** With no
scope argument, `execute` shells `the-loop status --json`, takes the
dependency-ready eligible set, and confirms it. That is the minimum orientation a
launcher needs to fill in its own argument — it is not `/begin`'s job of reading
project state and proposing what to do next. If the eligible set is empty, `execute`
says so and stops rather than proposing an alternative route.

**Target branch defaults to the checked-out branch, stated explicitly.** Carried
across from `/begin`'s existing rule: name the target branch explicitly — the branch
the session is working on, unless the design narrative names another; never pass a
target branch the checkout's artifacts didn't come from.

**`execute` carries the launch-path half of bound-artifact-store handling.** When
`artifactStores.features` resolves to a nondefault binding, the launch path must
materialize an ephemeral snapshot, pass `--graph-path`, and tear it down; a
bound-but-unreachable surface is a can't-run naming the surface, never a fallback to
the local file. `/begin` keeps the same handling for its orientation path. This
duplicates a paragraph across two skills, which is accepted: loop surfaces are
self-contained by rule, and a skill that points at another skill's body for a
correctness-critical step is the exact failure this whole feature exists to remove.

**No glossary entry, no ADR.** "Execute" already names this in the loop's
vocabulary — `execution-pipeline`, `execution context`, `prepare-execution-context`
— so the skill inherits an established term rather than pinning a new one. The
change is reversible and unsurprising, so it clears no ADR bar.

## Constraints

- Body must be self-contained: no ADR numbers, no internal-doc references, no
  pointer to another skill for a step the reader needs. A `write-skills` pass runs
  before landing.
- The description is tier 0 — injected into every consuming session — so it must
  fire on "run the fix", "launch the pipeline", "build these features", "execute the
  scope", and must be instantly dismissible otherwise.
- Nothing under `plugin/workflows/` may be named: the companion fix moves the engine
  to `cli/assets/`, and this skill's prose must not need editing when it lands.
- No autonomous or scheduled launch. No change to the CLI, the splice, or the
  engine.

## Known pins — two shipped tests assert the recipe lives in /begin

Both were written when `/begin` was the only launch surface. They pin real
acceptance from shipped features, so they move with the recipe; they do not get
hollowed out, and the recipe does not get left duplicated in `/begin` to keep them
green.

- `test/skills-and-command-sweep.test.js:86-95` (run-presentation criterion 4) reads
  `plugin/skills/begin/SKILL.md` and asserts the `prepare-execution-context --features
  <id,id,…> --target-branch <ref> … --script-out` line, that `scriptPath` binds to
  that path, and that `scriptPath` never binds the canonical workflows file. All
  three assertions re-point at the execute skill. The third one's regex names
  `CLAUDE_PLUGIN_ROOT/workflows/execution-pipeline.js`, a path the companion fix
  retires — update it to the moved location rather than deleting the guard.
- `test/consumption-lifecycle.test.js:16-40` (ports-adapters-full criterion 1) asserts
  one surface carries the whole bound-store lifecycle: `artifactStores.features`,
  the adapter-doc access path, snapshot materialization, `--graph-path` reaching
  `status`, `prepare-execution-context`, `set-status`, and `check`, and teardown.
  After the split that lifecycle spans two surfaces — `/begin` keeps the orientation
  subcommands, `execute` keeps `prepare-execution-context` — so the test reads both
  files. The criterion is about behavior, not about which file holds the prose; the
  assertion set stays complete across the pair.

## Depends on

`fix-execution-pipeline-name-entrypoint` — build-order edge. The fix moves the
engine and rewrites the paths this skill's prose would otherwise name, and both
features edit `plugin/skills/begin/SKILL.md`'s launch region. Sequencing them puts
the path churn ahead of the extraction instead of colliding with it at the merge.
