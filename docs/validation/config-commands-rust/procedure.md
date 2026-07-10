# config-commands-rust — validation procedure

Fixture-repo binding (this repo's own): validation exercises the compiled Rust
binary from the outside, as a user would — never in-process imports.

## Bring-up

- `cli && cargo build --release` — compiled binary at `cli/target/release/the-loop`.
- `node bin/create-sample-repo.js` — temp git repo seeded as a plausible v2
  target (feature-graph + architecture.md + design docs, committed); printed
  path used as cwd for the exercises below.
- Ad hoc `.claude/settings.json` / `.claude/settings.local.json` /
  `.claude/settings.local.json` trees under scratch `/tmp` directories, built by
  hand to exercise the four-layer `modelBindings` / hook-family merge and the
  byte-survival guarantee independent of the sample-repo fixture.

## Exercise

1. **models-list** — ran the release binary's `models-list` against layered
   settings fixtures (compiled-in plugin defaults, then user/project/local
   overrides added incrementally) and confirmed per-role provenance flips
   `default -> user -> project -> local` as each layer's `"the-loop".modelBindings`
   entry was added. Ran it again with a binding naming an executor absent from
   the compiled-in registry, and separately with a model absent from its
   playbook's `models` list: both exited 1 with empty stdout and a guard
   message on stderr, matching the hard-gate contract (warnings never fail;
   errors block the table entirely).
2. **hooks-list** — ran the release binary's `hooks-list` against the sample
   repo (with and without `docs/architecture.md`) and against settings trees
   with recorded model bindings present, absent, and explicitly opted out.
   Confirmed the full `HOOK_INVENTORY` family set is present in the printed
   `hooks` object (interview, modelBindings, testHarness, lint, precommit,
   notification, artifactStores) each carrying `value`/`layer`/`provenance`,
   and that `recordedBindings` reflects `present` / `absent` / `opted-out`
   correctly per role.
3. **hooks-set** — wrote to each of `user` / `project` / `local` layers in a
   scratch `/tmp` tree seeded with an unrelated top-level key and a sibling
   `"the-loop"` family already present. Diffed the file before/after: every
   key outside `"the-loop".<family>` was byte-identical; the targeted family
   value was replaced/inserted correctly. Also confirmed a missing target file
   is created with just the namespaced key.
4. **executors-list** — ran the release binary's `executors-list` with no
   `dir` argument (compiled-in default registry: the json-fenced `grok`
   playbook) and against a scratch directory containing a malformed playbook
   (missing a required machine-block field) and a directory with two playbooks
   claiming the same `id`: both refusals named the offending file(s) on stderr
   with empty stdout.
5. **Parity oracle** — `npm run oracle:rust` (release binary): 37 pass / 0 fail
   / 11 pending; all `executors-list`, `models-list`, `hooks-list`, `hooks-set`
   cases (happy path + refusals) are live (removed from `test/oracle/pending.json`
   by this feature) and green — JSON-equal to the JS CLI on the paired fixtures
   these cases carry.

## Expected observations

- All five exercises above matched the acceptance criteria and the JS
  reference behavior with no divergence.
- `cli/config/executors/grok.md` carries the json-fenced Machine block
  (the json-cutover this feature performs for this repo's own playbook),
  confirmed by `executors-list`'s successful parse of the compiled-in default.

## Teardown

- `rm -rf` the sample-repo path printed by `bin/create-sample-repo.js`.
- `rm -rf` every scratch `/tmp` directory created for the settings-tree and
  executors-dir exercises above.
