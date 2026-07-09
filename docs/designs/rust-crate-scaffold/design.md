# rust-crate-scaffold — Rust workspace, clap CLI skeleton, and the clippy quality gate

**Status:** designed 2026-07-09 from `docs/briefs/rust-cli-replatform.md` (ADR-0051).

The first slice of the Rust replatform: a buildable `the-loop` binary crate with the
aggressive quality gate live from commit one, and the repo's hooks widened to run both
toolchains. No artifact parsing, no command parity yet — those are the later features.
This slice exists so every subsequent Rust feature lands into a repo where `cargo test`,
`cargo clippy`, and `cargo fmt --check` already gate.

## Shape

- **Workspace root `Cargo.toml`** at the repo root (`[workspace] members = ["cli"]`),
  so `cargo-dist` (binary-distribution feature) later manages the workspace root, and
  future crates (if any) join without restructuring. The crate lives at `cli/` —
  **outside `plugin/`**, which ships wholesale to installed plugins (ADR-0048); Rust
  source must never ride the plugin bundle.
- **Package/binary name `the-loop`**, version synchronized with the plugin's version
  by hand at release time (the release skill's bump touches both; no build-time
  coupling). Rust edition 2024. `the-loop --version` prints the crate version.
- **Dependencies** (each earns its place; additions beyond these need a reason in the
  PR): `clap` (derive) for argv dispatch, `serde`/`serde_json` for the JSON spine.
  Later features add at most: nothing currently foreseen — git is shelled via
  `std::process::Command`, matching the JS CLI's `execFileSync` posture (argv handed
  straight to the binary, never a shell).

## The quality gate (the lint-policy binding for the Rust stack)

Carries the project's aggressive-linting regime — strictest-preset floor, gated
suppression — expressed in the workspace `Cargo.toml` so every crate inherits it:

```toml
[workspace.lints.rust]
warnings = "deny"

[workspace.lints.clippy]
all = { level = "deny", priority = -1 }
pedantic = { level = "deny", priority = -1 }
nursery = { level = "deny", priority = -1 }
cargo = { level = "deny", priority = -1 }
allow_attributes_without_reason = "deny"
```

Per-lint relaxations are legal only as narrow `#[allow(lint, reason = "…")]` at the
site (the `reason` is mandatory — `allow_attributes_without_reason` enforces the gated
suppression rule mechanically). `rustfmt` runs on defaults; `cargo fmt --check` is part
of the gate, not advisory. The full local gate is one command:
`cargo fmt --check && cargo clippy --all-targets && cargo test`.

## Hook updates (settings side)

At landing — not before, or every current build agent fails on a missing `Cargo.toml` —
the repo's project-layer hooks widen to cover both toolchains via `hooks-set`
(`testHarness` family: `npm test && cargo test`; `lint` family:
`npm run check && cargo fmt --check && cargo clippy --all-targets`; exact family value
shapes per `HOOK_INVENTORY` in `plugin/src/resolve-model-bindings.js`). The design
skill's stack-time capture was deliberately deferred to this feature's landing for that
reason. `precommit` posture is unchanged.

## Touched surfaces

| Surface | Change |
|---|---|
| `Cargo.toml` (new, repo root) | workspace + lints table above |
| `cli/` (new) | `Cargo.toml`, `src/main.rs` clap skeleton, first unit test |
| `.claude/settings.json` | testHarness + lint hooks widened (via `hooks-set`) |
| `.gitignore` | `target/` |

## What a builder would otherwise guess

- The binary must print `--version` and exit 0; unknown subcommands exit nonzero with
  a usage line on stderr and **nothing on stdout** (the stdout-is-JSON contract starts
  now).
- Do not port any command in this slice. The skeleton dispatches `--version` only.
- CI is out of scope here; the release-side matrix is the binary-distribution feature.
  The gate is local (`cargo …` commands green on the landed tree).
- `npm test` must stay green — the JS CLI remains the running toolchain until
  json-cutover.

## Acceptance (from the feature graph)

1. `cargo build --release` at the repo root produces a `the-loop` binary from the
   `cli/` crate; `--version` prints the crate version, exit 0.
2. Workspace lints deny warnings with clippy all/pedantic/nursery/cargo enabled and
   reason-less allows forbidden; fmt-check, clippy, and test pass on the landed tree.
3. testHarness and lint hooks resolve to dual-toolchain commands, both green;
   `npm test` stays green.
