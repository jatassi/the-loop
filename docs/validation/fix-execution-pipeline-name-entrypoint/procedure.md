# fix-execution-pipeline-name-entrypoint — validation procedure

**Validated:** 2026-07-25 · **Target:** `main` · **Branch validated:** `loop/fix-execution-pipeline-name-entrypoint`
**Binding:** the fixture-repo binding (`bin/create-sample-repo.js`) — the CLI is exercised
from the outside, as a user would, never in-process.

The feature closes a door rather than opening one, so the procedure is half
tree-inspection and half CLI exercise. Every mutation described below was reverted
immediately (`git checkout <path>`, followed by `cargo build --release` where the
asset is compiled in); the tree was confirmed clean after each.

## Bring-up

```sh
# integration worktree, target main
the-loop worktree-create integrate--fix-execution-pipeline-name-entrypoint --base-branch main
git merge --no-ff loop/fix-execution-pipeline-name-entrypoint
cargo build --release            # the engine is compiled in via include_str!, so the
                                 # binary under test must be built from the landed tree
node bin/create-sample-repo.js   # → /var/folders/.../loop-probe-XXXXXX  (the fixture repo)
```

The fixture seeds three features (`greet-core` validated, `greet-cli` designed,
`greet-farewell` proposed) plus `docs/architecture.md`, design docs, and a recorded
validation-procedure binding — enough for `prepare-execution-context` to assemble a
real context.

## Exercise and observations

### Criterion 1 — the engine no longer sits under an auto-registered plugin workflows directory

```sh
ls plugin/                      # → .claude-plugin  agents  skills   (no workflows/)
find plugin -name '*.js'        # → (empty)
ls -l cli/assets/execution-pipeline.js   # → present, 28502 bytes
```

Observed: `plugin/workflows/` does not exist and **not one `.js` file remains anywhere
under `plugin/`**, so the plugin loader has no workflows directory to auto-register and
`plugin/.claude-plugin/plugin.json` (no `workflows` key) is moot. The engine lives at
`cli/assets/execution-pipeline.js`, and `cli/src/lib.rs:77` reaches it as
`include_str!("../assets/execution-pipeline.js")`. The live skill-listing check —
that a consuming session no longer offers `the-loop:execution-pipeline` — rides the
release gate's health check by the criterion's own terms and was not attempted here.

### Criterion 2 — `--script-out` still writes a launch-ready spliced script; both shape gates still refuse

Happy path, from the fixture repo as cwd:

```sh
cd "$FIXTURE"
"$W/target/release/the-loop" prepare-execution-context \
  --features greet-cli --target-branch main --script-out "$FIXTURE/scratch-script.js"
```

Observed: exit `0`, file written (30308 bytes). `diff` against the canonical
`cli/assets/execution-pipeline.js` reports exactly two changed lines — **11** (the meta
line) and **13** (`EMBEDDED_CONTEXT`) — and nothing else:

- line 11 → `description: "greet-cli → main"` (scope-derived, JSON-stringified), with
  `name`, `whenToUse`, and `phases` byte-identical to the canonical line;
- line 13 → `const EMBEDDED_CONTEXT = {"target":"main","scope":["greet-cli"],"probe":…};`
  — no `= null` remains anywhere in the file.

The spliced text was then compiled as an `AsyncFunction` body (the shape the harness
runs it as, `meta` neutralized the same way `eslint.config.js`'s processor does) and
compiled clean — the written copy is launch-ready, not merely well-formed text.

Shape gate A (meta line), exercised end to end by perturbing the compiled-in asset:

```sh
perl -0pi -e "s/description: 'One autonomous pass/desc: 'One autonomous pass/" cli/assets/execution-pipeline.js
cargo build --release
cd "$FIXTURE" && "$W/target/release/the-loop" prepare-execution-context \
  --features greet-cli --target-branch main --script-out "$FIXTURE/gateA.js"
```

Observed: exit `1`, stderr
`canonical workflow script's meta line does not carry the expected description: '…' shape — refusing to splice`,
and `test -e gateA.js` → **no file written**.

Shape gate B (`EMBEDDED_CONTEXT` line), same recipe with
`const EMBEDDED_CONTEXT = null;` → `= undefined;`: exit `1`, stderr
`canonical workflow script does not carry the expected EMBEDDED_CONTEXT = null shape — refusing to splice`,
**no file written**.

Both perturbations were reverted and the binary rebuilt from the landed asset.

### Criterion 3 — `meta.whenToUse` and the pinned constant in `splice.rs`

The landed `meta.whenToUse` reads, in full:

> `Launched by the execute skill via `the-loop prepare-execution-context --script-out`, which embeds the execution context as a literal; never resolvable by name`

Observed: it names `prepare-execution-context --script-out`, and greps clean of both
retired phrases — `as args` (0 hits) and `never invoked bare` (0 hits). The same string
appears verbatim in the spliced output above, so the value a launched run carries is the
corrected one.

Byte-for-byte agreement with `cli/src/splice.rs`'s pinned constant was proven, not
assumed: `cargo test real_canonical_script` passes, and appending a single character to
the pinned constant (`never resolvable by name` → `…nameX`) turns it red —
`splice::tests::real_canonical_script_both_splices_match_direct_substitution … FAILED`,
panicking at `cli/src/splice.rs:361`. Reverted.

### Criterion 4 — `plugin/workflows` greps to zero across living surfaces

```sh
for d in cli plugin test eslint.config.js docs/architecture.md; do
  grep -rn 'plugin/workflows' "$d" | wc -l
done                      # → 0 0 0 0 0
```

Every remaining hit in the tree sits in a permitted historical record — `docs/bugs/`,
`docs/releases/`, `docs/calibration/`, `docs/validation/`, `docs/briefs/`, and shipped
features' `docs/designs/` — plus three that are self-referential rather than stale:
`docs/feature-graph.json` (this feature's own acceptance-criteria text and the
`execute-skill` / `interactive-feature-type` notes that name the collision being
avoided), `docs/designs/execute-skill/design.md:138` (the instruction *not* to name the
directory), and `docs/designs/interactive-feature-type/design.md:122` (a
workflow-coherence ruling table entry).

### Criterion 5 — suites and lint green on the landed tree, reading the new path

```sh
npm test        # → tests 218, pass 218, fail 0
cargo test      # → 235 passed (lib) + 3 passed (cli_process) + 0 doc, 0 failed
PATH="$PWD/target/release:$PATH" npm run check   # → `the-loop check` OK 52 features, eslint clean, exit 0
```

That the tests **bite on the new path** was proven three ways rather than inferred from
green:

1. Moving `cli/assets/execution-pipeline.js` aside turns `merge-posture`,
   `execution-pipeline-meta`, and `execution-pipeline-happy` from 12 passing to
   **10 failing** with `ENOENT: … open 'cli/assets/execution-pipeline.js'` — the suites
   really read the relocated file, not a stale copy.
2. Removing the phrase `disjointness is the plan's bias, not law` from the moved asset
   reddens `merge-posture`'s "the scheduler stops promising the sibling merge is clean
   by construction".
3. The lint block moved with the file: `eslint --print-config cli/assets/execution-pipeline.js`
   fails with `Could not serialize processor object` — proof the harness-globals /
   top-level-return processor block matches the new glob — and `eslint cli/assets/execution-pipeline.js`
   alone exits `0` (without that block the file would not even parse).
4. The one assertion that was *replaced* rather than repointed
   (`test/skills-and-command-sweep.test.js`: the `workflows/execution-pipeline.js` path
   match became `canonical execution-pipeline engine script`) was mutation-checked —
   rewording that phrase in `plugin/skills/begin/SKILL.md` reddens the test.

Integrity sweep: the diff adds no `eslint-disable` in any form, and its single
`eslint.config.js` edit repoints one `files:` glob (`plugin/workflows/**/*.js` →
`cli/assets/**/*.js`) without relaxing a rule — the block's `max-lines: 430` ratchet,
`max-lines-per-function: off`, and `unicorn/prefer-top-level-await: off` are unchanged
and still apply to the engine. No test was deleted; no assertion was dropped.

## Teardown

```sh
rm -rf "$FIXTURE"                       # the printed create-sample-repo.js path
the-loop worktree-remove integrate--fix-execution-pipeline-name-entrypoint
```

## Note for the next reader

`README.md:61` still lists `workflows/execution-pipeline.js` inside its `plugin/` repo-layout
tree ("the entire shipped bundle"). It does not contain the literal string
`plugin/workflows` and README is not among the living surfaces criterion 4 enumerates,
so it is outside this feature's contract — but it is now inaccurate and worth folding
into the next surface-touching change.
