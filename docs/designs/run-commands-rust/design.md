# run-commands-rust — prepare-execution-context, worktrees, calibration-summarize in Rust

**Status:** designed 2026-07-09 from `docs/briefs/rust-cli-replatform.md` (ADR-0051).
**Amended 2026-07-10** after main's worktree-setup landing (ADR-0052) merged in: the
worktree verbs' JS reference changed under this design — `worktree-create` now
provisions via the `worktreeSetup` hook (the `node_modules` symlink is retired) and
`worktree-remove` refuses from inside the target — and the config surfaces already
ported by config-commands-rust drifted (new `worktreeSetup` inventory family,
`hooks-list --compact`). The drift catch-up rides here: these verbs consume the
family, and the Rust-target oracle stays red on `hooks-list` until it lands.

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
  with the path overridable for fixtures) with two splices
  (`describeRun`/`spliceRunDescription`/`spliceEmbeddedContext` in
  `plugin/src/splice-workflow-description.js`): the meta description spliced to name
  scope + target (JSON-stringified value, meta stays one physical line), and the
  assembled execution context spliced as a JSON literal over the canonical script's
  one-line `const EMBEDDED_CONTEXT = null;` target — the context rides the script
  itself; the Workflow launch passes no `args`
  (fix-execution-context-args-transport). Either shape gate failing — meta line or
  EMBEDDED_CONTEXT line — is a refusal: exit 1 **nothing written, stdout included**.
  Output byte-identical to the JS CLI's on the same input script and fixture, modulo
  the `preparedAt` stamped inside the embedded context (the one legal wall-clock
  read, so it can never match across invocations — the oracle masks it).

## worktree-create / worktree-remove

Ports of `worktreeCreateCommand`/`worktreeRemoveCommand` (post-ADR-0052 shape): dir
`.claude/worktrees/<branch-with-slashes-dashed>`; existing dir → `{path, branch,
created: false}` idempotently, returned before the binding is even resolved —
`created: false` means already fully provisioned and never re-runs setup; existing
branch → attach, else `-b` off `--base-branch` (default `main`). Git is always
argv-exec (`std::process::Command`), never a shell — a hostile ref name must reach
git as one literal argument.

**Provisioning (replaces the retired `node_modules` symlink).** After the `git
worktree add`, run the resolved `worktreeSetup` binding, mirroring
`resolveWorktreeSetup`/`worktreeSetupCommand`/`provisionWorktree` in
`plugin/bin/cli-commands.js`:

- Resolve the `worktreeSetup` family alone — never the full hooks table, so a
  malformed unrelated family cannot break create. Resolution happens *before* the
  `worktree add`, so a malformed binding refuses without creating anything.
  `hook-defaults.json` deliberately omits the key → the inventory fallback
  `{ provisioning: 'none' }` (provenance `fallback`) → provision nothing.
- A string `command` runs via the system shell, cwd the new worktree root, inherited
  env, default timeout 600000 ms (per-binding `timeout` override, ms). Anything else
  bound is a malformed-binding refusal naming the layer and the offending value.
- On non-zero exit, spawn error, or timeout: tear the just-created worktree down
  (`git worktree remove --force` + `prune` — the branch survives) and exit 1 with
  the self-contained message — the phrase `worktree provisioning failed`, the
  command (JSON-quoted), the worktree path, the binding layer, the reason, and a
  2000-char stderr tail. A timeout is worded as `timed out after <budget>ms` —
  never as an exit code.

**Remove** resolves a path or a branch via `git worktree list --porcelain`,
`--force` removes, then prunes — but first refuses (exit 1) when the caller's cwd is
inside the target's realpath (`refusing: cwd is inside <dir> — cd out of the
worktree first`): removal would strand the caller's shell and the prune dies on an
unreadable cwd.

## Config-surface drift catch-up (from config-commands-rust)

Main's worktree-setup landing changed two surfaces config-commands-rust had already
ported at parity; this feature restores it (the JS side is the spec, as ever):

- The Rust `HOOK_INVENTORY` port gains the `worktreeSetup` family, fallback
  `{ provisioning: 'none' }` — it now appears in `hooks-list` output (resolved
  value/layer/provenance) and is accepted by `hooks-set`'s family allowlist.
- `hooks-list --compact`: one single-line JSON entry per family
  (`<family>: {…}\n`), then `recordedBindings: {…}\n`, instead of the pretty tree —
  line-for-line identical to the JS CLI.

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
| `cli/src/` | context assembler + gates, script splicer, worktree verbs (incl. provisioning), calibration renderer; `worktreeSetup` in the inventory port, `hooks-list --compact`, `hooks-set` allowlist |
| `test/oracle/` | the remaining cases flip live (branch-state fixtures: plans committed to `loop/<id>` branches in temp repos), including main's `worktree-setup.js` bound-success/bound-failure cases; the `hooks-list` cases pass again on the Rust target |

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
2. `--script-out` byte-identical splice (meta description + embedded context, modulo
   the stamped `preparedAt`); either shape gate's exit 1 writes nothing.
3. Oracle worktree cases pass (idempotent create, path-or-branch remove + prune,
   cwd-inside-target refusal, bound-command provisioning success and
   teardown-on-failure refusal).
4. calibration-summarize over `runs/*.json` regenerates `index.md` byte-identical on
   a paired corpus; malformed record exits 1 naming the file.
5. The drifted config surfaces are back at parity: `worktreeSetup` resolves in the
   Rust `hooks-list`/`hooks-set`, `--compact` matches the JS CLI line-for-line, and
   the full oracle corpus (hooks-list cases included) is green on the Rust target
   with only genuinely-unported commands pending.
