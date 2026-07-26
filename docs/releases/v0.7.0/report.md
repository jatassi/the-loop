# Release v0.7.0 — 2026-07-26

- **Tag:** `v0.7.0` (released tip `f223bf9`)
- **Features shipped:** `execute-skill` — the loop's launch surface extracted from
  `/begin` into its own `execute` skill. Flipped to `shipped`.
- **Fix nodes released and pruned:** none — no `fix-<slug>` node was validated at cut
  time.
- **Outcome:** deployed. Marketplace update 0.6.0 → 0.7.0 healthy; cargo-dist published
  all five targets plus both installers and sha256 sidecars (run 30213362518); the real
  release was installed through the installer's own checksum verification and
  `the-loop --version` printed `the-loop 0.7.0`.
- **Rollback:** previous tag `v0.6.0`; plugin rollback per the Release runbook.

## Why this was a minor bump

`execute-skill` adds a new user-facing surface (`/the-loop:execute`) and removes the
launch leg from `/begin` — a change in what a consuming session can invoke by name, not
a patch. `plugin.json` and `cli/Cargo.toml` moved together in `f223bf9`, as cargo-dist
requires.

## Operational notes

- Ready checks at the released tip: `npm test` 224/224, `the-loop check` OK 49 features,
  `cargo test --all-features` 273 passed, `cargo clippy --all-targets --all-features
  -D warnings` clean, `cargo fmt --check` clean, eslint clean.
- `cli/` was untouched between `v0.6.0` and this cut — the binary is functionally
  identical and only the version moved. The `upgrade-windows` gate was therefore already
  green on this code at `v0.6.0` (run 30207758234); it re-ran on the release push anyway
  and passed (run 30213362347).
- The `execute-skill` procedure replay reproduced every recorded observation, including
  the full mutation probe (7 mutations, casualties 2/1/1/1/1/1/7 against a 17-pass
  baseline), the three refusal cases against the real binary, the three blind gate
  probes (human-typed → no second ask; empty `eligibleSet` → report and stop; model
  hand-off → wait for confirm), and the index-only discovery probe (all three requests
  routed to `the-loop:execute` from frontmatter alone). The `--graph-path` snapshot
  context was byte-identical to the default-binding context modulo `preparedAt`.

## The PATH litter this release found and cleaned

The plugin health check passes on the plugin alone, so it never noticed that the
`the-loop` **binary** on PATH was **0.5.1** — two releases stale — while the plugin sat
at 0.7.0. Since the skills call the binary with no version handshake (the `execute`
skill says so in as many words), that is a live breakage the release gate had been
blind to.

Cause: every past release verified the binary by installing it into that session's
scratchpad, and each cargo-dist install appended a `. "<scratchpad>/env"` line to
`~/.profile` and `~/.zshrc` that *prepends* an ephemeral tmp dir to PATH. Three such
lines had accumulated across sessions (`3f945258`, `ba6286c6`, and this run's own).
Two pointed at directories already swept; the surviving one shadowed
`~/.cargo/bin/the-loop` with 0.5.1.

Cleaned as part of this release: all three lines removed from `~/.profile` (3) and
`~/.zshrc` (2) — backups at `~/.profile.bak-v0.7.0` and `~/.zshrc.bak-v0.7.0` — and
v0.7.0 installed from the real release into the durable `~/.cargo/bin`. A clean
interactive shell now resolves `the-loop` → `~/.cargo/bin/the-loop` → `the-loop 0.7.0`.

Worth fixing at the source: the runbook's verification recipe should install to a
durable location, or pass `--no-modify-path`, so it stops writing profile lines that
outlive their directory. Worth just as much is that the health check covers only half
the deployed surface — it asserts the plugin version and never the binary's.

## Known, not fixed here

- `README.md:61` still lists `workflows/execution-pipeline.js` inside its `plugin/`
  repo-layout tree. The path no longer exists; outstanding since v0.6.0.
- The `--graph-path` phrasing inaccuracy carried forward from `ports-adapters-full`:
  `status`, `set-status`, and `check` take the alternate graph as a **positional**
  path, not `--graph-path`; only `prepare-execution-context` has the flag. It ships
  today in `/begin`, `execute`, and `validate.md`, and is pinned by
  `test/consumption-lifecycle.test.js`. Fixing it means moving all three together.
