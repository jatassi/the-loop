# run-commands-rust — prepare-execution-context, worktrees, calibration-summarize in Rust

**Status:** designed 2026-07-09 from `docs/briefs/rust-cli-replatform.md` (ADR-0051).

The load-bearing slice: the one-shot execution-context assembler (the command
everything else exists to feed — ADR-0036/0038), the two sanctioned worktree verbs,
and the calibration digest. When this lands, the Rust binary can run a loop pass end
to end; json-cutover is then a flip, not a build.

## prepare-execution-context

JS reference: `prepareExecutionContextCommand` in `plugin/bin/cli-commands.js` over
the pure core in `plugin/src/prepare-execution-context.js`. Frozen semantics:

- **Gates, in order, each exit 1 with nothing on stdout**: graph validation; scope
  gate (`checkScope`: ids known, status `designed`, every dep landed
  (`validated|shipped`) or in scope); model-bindings/registry validation; per-feature
  plan validation for plans that exist.
- **Per-feature gathering**: design doc from `docs/designs/<id>/design.md` falling
  back to `docs/bugs/<id>.md` (the fix channel), warn on neither; plan read from the
  feature branch first (`git show loop/<id>:docs/plans/<id>/plan.json`), working-tree
  fallback with a warning; branch heads via
  `git for-each-ref refs/heads/loop/<id> refs/heads/loop/<id>--*` — a task is built
  iff its branch head's subject starts with `<feature>/<task>: `.
- **Assembly**: `{ target, scope, probe, models, hooks, features, preparedAt,
  calibration?, cli? }` — `probe` is the verbatim `## Validation procedure` section
  of `docs/architecture.md`; `calibration` the verbatim `## Digest` section of
  `docs/calibration/index.md` when present, field omitted otherwise; `preparedAt` the
  one legal wall-clock read; **`cli` names the Rust invocation: the string
  `the-loop`** — this field is how every downstream worker knows what to shell to,
  and it is the one sanctioned content difference from the JS CLI (which emits
  `node "<plugin>/bin/the-loop.js"`). The oracle special-cases exactly this field.
- **`--script-out <path>`**: write a copy of the canonical workflow script
  (`plugin/workflows/execution-pipeline.js` — the binary needs its location: passed
  or resolved via the same compiled-in-defaults posture as config-commands-rust,
  with the path overridable for fixtures) with the meta description spliced to name
  scope + target (`describeRun`/`spliceRunDescription` in
  `plugin/src/splice-workflow-description.js`: JSON-stringified value, meta stays one
  physical line, shape-gate refusal = exit 1 **nothing written, stdout included**).
  Output byte-identical to the JS CLI's on the same input script — it is a pure
  string splice.

## worktree-create / worktree-remove

Ports of `worktreeCreateCommand`/`worktreeRemoveCommand`: dir
`.claude/worktrees/<branch-with-slashes-dashed>`; existing dir → `{path, branch,
created: false}` idempotently; existing branch → attach, else `-b` off
`--base-branch` (default `main`); best-effort `node_modules` symlink for node target
repos (keep — target repos are any language, this helps node ones); remove resolves
a path or a branch via `git worktree list --porcelain`, `--force` removes, then
prunes. Git is always argv-exec (`std::process::Command`), never a shell — a hostile
ref name must reach git as one literal argument.

## calibration-summarize

Port of `renderIndex` (`plugin/src/calibration-summarize.js`): records move to
`docs/calibration/runs/<stamp>.json` (pure JSON — same payload the workflow script
computes; the record agent's write changes at json-cutover, not here); regenerate
`docs/calibration/index.md` **wholesale and deterministically** — same corpus, byte
-identical file, digest section within 40 lines; parse every record before emitting a
byte so one malformed record exits 1 naming the file with no index touched. The
index stays markdown: it is a wholly derived, human-read digest; the `## Digest`
section is re-read verbatim by prepare-execution-context — keep the exact heading.
Cross-implementation the rendered index must be byte-identical on a paired corpus
(same renderer logic, fixed number formatting).

## Touched surfaces

| Surface | Change |
|---|---|
| `cli/src/` | context assembler + gates, script splicer, worktree verbs, calibration renderer |
| `test/oracle/` | the remaining cases flip live (branch-state fixtures: plans committed to `loop/<id>` branches in temp repos) |

## What a builder would otherwise guess

- Warnings (missing design doc, working-tree plan, no validation-procedure section)
  go to stderr, never stdout, and never change exit codes.
- `builtTasks` derivation is subject-prefix string matching, nothing smarter — a
  branch existing without the prefixed head subject is an unbuilt crashed attempt.
- Ordering inside the emitted context follows the canonical-emit rule (schema key
  order); JSON-equality is the parity bar, so JS key order need not be replicated.
- Number formatting in the index (medians, percentages) must match the JS renderer
  digit-for-digit — byte-identical is the bar there, unlike stdout JSON.

## Acceptance (from the feature graph)

1. Gate refusals exit 1 with empty stdout; success prints the context JSON-equal on
   paired fixtures, `preparedAt` normalized, `cli` naming the Rust invocation.
2. `--script-out` byte-identical splice; shape-gated exit 1 writes nothing.
3. Oracle worktree cases pass (idempotent create, path-or-branch remove + prune).
4. calibration-summarize over `runs/*.json` regenerates `index.md` byte-identical on
   a paired corpus; malformed record exits 1 naming the file.
