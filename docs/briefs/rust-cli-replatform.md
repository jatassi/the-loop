# Brief · rust-cli-replatform

## Intent

Replatform the-loop's deterministic toolchain — today a Node-executed ESM CLI at
`plugin/bin/the-loop.js` + `plugin/src/*.js`, with `node_modules` (one dep, `yaml`)
vendored into the plugin bundle — into a **self-contained compiled Rust binary** that
carries no runtime dependency, distributed the way `beads` distributes `bd`: fetched
and checksummed at install time, not committed as a blob. In the same move, migrate the
tool's durable artifact format from **YAML-in-markdown to tool-owned JSON**, which is
what makes Rust a clean fit. The motivation is the human's: the current shape doesn't
feel clean, and it rests on an undeclared, unenforced assumption — that a JS runtime is
present on the user's machine — that is provably false for a meaningful slice of users.

The seam by which skills and agents invoke the tool (a CLI called via the Bash tool,
JSON on stdout, exit codes as lint gates) is **kept** — the survey found it is the
sanctioned, universal pattern for a deterministic project-state spine, and that moving
to MCP would solve nothing here while adding a server-runtime problem.

## Users

Jackson — currently the only user. Two consumer classes of the toolchain:

- **The loop's own surfaces** (skills, subagents, the Workflow) call the CLI via Bash
  to read status, validate artifacts, manage worktrees, and assemble execution context.
- **The human**, who reads the durable artifacts (feature-graph, plans) in git diffs
  and may hand-edit them, and who runs `/begin` and other phases that shell to the CLI.

No external users; backward compatibility with the YAML format is explicitly not a
concern.

## Scope envelope

Whole-toolchain replatform — a large ask, taken on deliberately because the project is
still early and the cost of the format+language break only rises later.

**In scope:**

- Rewrite the deterministic CLI (`plugin/bin/the-loop.js` + all of `plugin/src/*.js`)
  in Rust, at behavior parity with the current documented command surface (`status`,
  `list`, `check`, `set-status`, `plan parse|check|task`, `prepare-execution-context`,
  `worktree-create|remove`, `executors-list`, `models-list`).
- Migrate the durable artifact format from YAML-in-markdown to tool-owned JSON:
  the feature-graph payload and plan payload become JSON; readers/writers move to serde.
- A `beads`-style distribution: multi-platform compiled binary, checksummed, fetched at
  install time (not a committed blob), with the plugin resolving/invoking it on PATH.
- Migrate the-loop's own in-repo artifacts (its feature-graph, its plans) to JSON in one
  clean cut; delete the YAML code path entirely.
- A Rust lint/quality profile (clippy pedantic/nursery, `deny(warnings)`, rustfmt) that
  carries the aggressive-linting regime applied elsewhere in the project.

**Out of scope:**

- The invocation seam — CLI-via-Bash with JSON stdout and exit-code gates is kept, not
  redesigned. MCP is explicitly rejected for this deterministic-local-logic role.
- The command *semantics* — what each command computes, its inputs, and its failure
  modes are frozen; this is a re-implementation, not a redesign of what the tool does.
- `config/model-bindings.json` and settings-derived config — already JSON; unaffected
  beyond being read by Rust instead of Node.
- Non-Claude host targets (Codex/Copilot manifests, as `beads` ships) — noted for a
  later intake, not built here.

## Decided

- **Eliminate the runtime dependency via a compiled binary, not accept-and-declare it.**
  Survey-confirmed load-bearing fact: Claude Code now ships as a Bun-compiled native
  binary; the native installer (`curl … install.sh`) never places `node` on PATH, and
  neither the Bash-tool, hooks, nor sandboxing docs assert any runtime floor beyond a
  POSIX shell + ripgrep. A user on the native installer, or driving the-loop on a
  Python/Go/Rust project, may have **no `node` anywhere** — and `node …the-loop.js`
  then simply fails to launch. `engines: node>=22.11` today is an undeclared, unenforced
  assumption. (Sources: `code.claude.com/docs` setup / tools-reference / hooks /
  sandboxing; Bun-compile corroborated by Bun's own announcement and community reports.)

- **Distribution follows the `beads` model, and the binary is never committed to the
  plugin repo.** Shipping executables from a plugin is *allowed* (the plugins-reference
  documents a `bin/` PATH mechanism), but committing a prebuilt blob is unsafe and
  unprecedented for a full CLI: per-arch blobs bloat the git-cloned bundle, macOS
  Gatekeeper quarantines unsigned downloads, binaries are unreviewable by humans and
  marketplace review, and the running artifact diverges from the source of record
  (the Cortex ADR-0050 "category error" argument). `beads` instead ships scripts +
  manifest and fetches a checksummed, per-platform binary at install time. `bun build
  --compile` was rejected specifically because its output embeds the whole Bun runtime
  (~100MB/platform), which forces the fetch model anyway at far worse size.

- **Language is Rust.** The tool's workload — CLI (clap), git-shelling, JSON output and
  validation, layered config merge — is serde-driven parse/transform/print with little
  concurrency or lifetime complexity: Rust's comfortable zone, not the borrow-checker
  zone. Binaries are ~3–8MB with sub-10ms startup (vs Node's cold start), compile-time
  correctness aligns with the project's correctness ethos, and `cargo-dist` provides a
  purpose-built "GoReleaser for Rust" that produces exactly the `beads` distribution
  (multi-platform archives, checksums, generated `install.sh`, npm shim). Go was the
  lower-risk alternative (it is what `beads` uses, trivial cross-compile, healthy
  `yaml.v3`), but Rust was chosen for alignment and maintainer motivation once the
  format decision removed Rust's one real disadvantage (below).

- **Durable format moves YAML-in-markdown → tool-owned JSON.** This is what unlocks a
  clean Rust fit. Rust's lossless-YAML story is genuinely weak — `serde_yaml` is both
  lossy (parse-to-struct discards comments/formatting) and unmaintained (archived 2024),
  and there is no clean CST-preserving equivalent of JS's `yaml` package. The current
  tool's *core* operation is comment/format-preserving round-trip mutation
  (`YAML.parseDocument`/`Document`; `check` validates round-trip fidelity), so Rust would
  make the tool's beating heart its hardest part. JSON + serde sidesteps this entirely.

- **Tool-first, freely hand-editable — not tool-only.** Nothing prevents a human from
  editing the JSON: it is a plain text file, not a locked store. The guardrail is the
  schema + `the-loop check` (validation + exit-code gate) that *catches* a bad hand-edit,
  not a barrier that forbids one. The tool re-emits **canonically** on write (stable key
  order, fixed indent), so a human's edits to *content* survive while incidental
  *formatting* normalizes — yielding clean, churn-free diffs. The one genuine loss is
  inline comments (JSON has none): milestone grouping and annotations that were YAML
  comments (`# ── walking skeleton ──`) become **schema fields** (`section`, `notes`),
  which makes grouping queryable data rather than prose the tool ignores.

- **Lossless round-trip machinery is dropped as a simplification.** With canonical serde
  emit, `check`'s round-trip test becomes trivial; the elaborate document-preserving
  apparatus disappears rather than being ported.

- **Clean break, no YAML back-compat.** "Still really early" — migrate the-loop's own
  feature-graph and plans to JSON once and delete the YAML path; the tool never reads
  the old format.

- **Rust is treated as a normal project language for the loop's own build machinery.**
  The loop's build path is language-agnostic by design; its build/validate agents write
  Rust with cargo tests as readily as JS with node:test, and the tdd/verify skills judge
  behavior, not language. The only deliberate addition is the Rust lint/quality profile
  above.

## Deferred

- **Distribution mechanics** — exact target platform matrix (darwin arm64/x64, linux
  x64/arm64, windows?), `cargo-dist` configuration, install location, and precisely how
  the plugin resolves and invokes the fetched binary (PATH lookup vs a SessionStart
  install/resolve hook vs an npm shim). `beads` is the reference model; the specifics are
  a Design call.
- **Self-modifying migration sequencing, and which *shape* of cutover** — the loop
  depends on this very CLI to run its phases, so the JS CLI cannot be torn out mid-flight
  without the loop losing the tool it runs on. Design must pick between two shapes the
  Bun-in-Rust post distinguishes: *build the full Rust CLI to parity side-by-side, verify,
  then flip the shell-invocation seam once* (Sumner's "everything all at once", which he
  argues is better) vs. *port module-by-module with both versions partially live for
  stretches* (his "incremental rewrite [that] adds temporary code you hope gets deleted…
  painful in the short-medium term"). Bias toward the atomic swap; the interleaved shape
  is the one the post warns against, and it bites hardest precisely in a self-modifying
  tool.
- **JSON schema shape** — how milestone grouping/annotation is modeled as fields, and
  whether the human-readable prose wrapper around today's feature-graph survives as a
  generated view (`feature-graph.md` from `feature-graph.json`) or is dropped.
- **Whether any command's surface is reconsidered** during the rewrite (default is strict
  parity; the rewrite is an opportunity, not a mandate, to revisit).
- **Non-Claude host manifests** (Codex/Copilot), as `beads` ships — a later intake.

## Assumptions

- The current CLI's documented command surface and its node:test suite together
  constitute a sufficient behavioral spec to re-express as Rust acceptance tests; no
  behavior is defined only implicitly in ways the rewrite would lose.
- The feature-graph and plans are the only durable YAML-in-markdown artifacts of
  consequence; the executor registry is already substantially JSON config
  (`config/model-bindings.json`), so its blast radius is small.
- `cargo-dist` (or equivalent) can produce the `beads`-style multi-platform,
  checksummed, install-scripted distribution without bespoke release infrastructure.
- A JSON feature-graph remains adequately reviewable in git diffs for the human's
  review workflow (noisier than YAML, but glanceable).

## Constraints

- **Zero runtime dependency on the user's machine** is the defining constraint — the
  whole point of the replatform. No assumption of `node`, `bun`, `python`, or `uv`.
- **The binary is fetched/checksummed at install, never committed** to the plugin repo.
- **The invocation seam is fixed:** CLI invoked via Bash, JSON on stdout, exit codes as
  lint gates. Skills/agents keep calling `the-loop <cmd>`.
- **Command semantics are frozen** — re-implementation at parity, not redesign.
- **The loop's build machinery must speak Rust** — cargo test / clippy / rustfmt — and a
  clippy-based quality profile matching the project's aggressive-linting regime is part
  of the deliverable.
- **Clean break** — no YAML read path survives.

## Done looks like

- The toolchain runs its full command surface on a machine with **no JS runtime present**
  — install via the native Claude Code installer, no `node`/`bun` anywhere, every command
  works.
- Installing the plugin **fetches a checksummed binary**; no prebuilt binary blob exists
  in the plugin's git tree, and no `node_modules` is vendored.
- The durable artifacts are **JSON**; a human hand-edit that violates the schema is
  **caught by `check`** (non-zero exit, nothing corrupted), and a valid hand-edit is read
  and then **canonically re-emitted** on the next tool write with a minimal diff.
- Every current command produces **equivalent results** to the JS implementation for the
  same inputs, verified by a **language-independent black-box oracle** — a suite that
  drives the CLI purely by shelling out and asserting on stdout JSON + exit codes, run
  against *both* the JS and Rust binaries through the parity window, with no case retired
  until Rust matches. (Bun's rewrite held parity across a million-line diff on exactly
  this: a test suite "written in TypeScript… doesn't depend on the runtime's programming
  language"; it still shipped 19 regressions, so compiling is not evidence of parity — an
  explicit regression pass is part of done.)
- The-loop's **own feature-graph and plans are migrated to JSON** and the YAML code path
  is gone; the loop still runs its phases end-to-end through the new binary.
- The Rust code passes the project's **clippy-based quality gate** with warnings denied.
