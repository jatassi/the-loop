# the-loop

An owned, composable agentic dev loop — built from native Claude Code primitives
(skills, subagents, commands, a Workflow) — that moves an idea through the full SDLC:
**define → design → build → validate → release → operate → evolve**. It ships as a
**Claude Code plugin**; the artifacts it produces live git-versioned in the target
repository it operates on. Its first job is to build itself. Founding principle: **earns
its context** — every component justifies its token cost (rebuilt around that
principle 2026-07-04; ADR-0034–0040).

Design is the source of truth: [`docs/architecture.md`](docs/architecture.md) (the
system), [`docs/feature-graph.json`](docs/feature-graph.json) (the feature graph — the
durable state machine, tool-owned JSON), [`docs/designs/`](docs/designs/) (one design
doc per feature), [`docs/adr/`](docs/adr/) (the *why*),
[`docs/glossary.md`](docs/glossary.md) (the vocabulary).
`the-loop status` prints the status story on demand.

## Install

The compiled `the-loop` binary is distributed via [cargo-dist](https://opensource.axo.dev/cargo-dist/)
GitHub Releases (checksummed per-target archives plus generated installers). Install
once onto your PATH with the shell installer:

```sh
curl -LsSf https://github.com/jatassi/the-loop/releases/latest/download/the-loop-installer.sh | sh
```

Every loop surface invokes bare `the-loop` after that. A missing binary is an
environment-shaped halt — re-run the one-liner above; there is no auto-fetch and
no shim. Windows users can use the PowerShell installer from the same release
(`the-loop-installer.ps1`). macOS Gatekeeper signing/notarization is out of scope;
unsigned binaries fetched via `curl | sh` (not a browser) do not receive the
quarantine attribute.

## How it runs

- **`/the-loop`** orients from the graph and proposes the next action; the human
  confirms scope.
- **`the-loop prepare-execution-context --features <ids>`** gates everything
  mechanically and assembles the one execution context the Workflow consumes.
- The **execution pipeline Workflow** runs Plan → Build → Validate per feature,
  concurrent where dependencies allow. Every unit of work runs in its own worktree
  under `.claude/worktrees/` — the main checkout is yours and is never touched.
- Durable state is code commits + the graph's four statuses
  (`proposed | designed | validated | shipped`, `proposed` the backlog stage);
  plans live on feature branches and vanish when the feature's squash-merge lands;
  a blocked feature is a question in the chat at the run boundary.
- **`/the-loop release`** replays the validation procedures, holds the one human gate,
  and runs the project's recorded release runbook.

## Layout

Plugin content lives under `plugin/` (the marketplace `source`) so the shipped bundle
is exactly that subdirectory; dev tooling stays at the repo root and never ships
(ADR-0048).

```
.claude-plugin/marketplace.json   marketplace descriptor → source: ./plugin
plugin/                        the plugin root — the entire shipped bundle
  .claude-plugin/plugin.json   plugin manifest
  workflows/execution-pipeline.js   the execution pipeline (concurrency-policy
                               scheduling, task-brief prompts; harness-executed —
                               shells to bare `the-loop` for every artifact touch)
  agents/                      system prompts: plan, build, validate, drive
  commands/ skills/            front door + define/design/release/code-quality
cli/                           the Rust CLI crate (builds the `the-loop` binary)
  config/                      compiled-in defaults: model-bindings.json,
                               hook-defaults.json, executors/ (CLI-executor playbooks)
bin/create-sample-repo.js      dev/test fixture generator (repo root — not shipped)
test/                          node:test suites (workflow harness, skill packs,
                               oracle — the Rust binary's black-box regression suite)
docs/                          durable artifacts: architecture, adr, glossary, validation, releases
```

## Develop

The CLI is Rust (`cargo build --release` at the repo root); the plugin bundle carries
no runtime JavaScript beyond the harness-executed workflow script. Dev tooling (the
node:test suites, eslint) is plain ESM JavaScript, no build step, Node ≥ 22.11.

```
npm install      # dev tooling only (eslint, node:test)
npm test         # node --test
npm run check    # validate + round-trip docs/feature-graph.md, then eslint
```
