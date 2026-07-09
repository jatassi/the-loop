# the-loop

An owned, composable agentic dev loop — built from native Claude Code primitives
(skills, subagents, commands, a Workflow) — that moves an idea through the full SDLC:
**define → design → build → validate → release → operate → evolve**. It ships as a
**Claude Code plugin**; the artifacts it produces live git-versioned in the target
repository it operates on. Its first job is to build itself. Founding principle: **earns
its context** — every component justifies its token cost (rebuilt around that
principle 2026-07-04; ADR-0034–0040).

Design is the source of truth: [`docs/architecture.md`](docs/architecture.md) (the
system), [`docs/feature-graph.md`](docs/feature-graph.md) (the feature graph — the
durable state machine), [`docs/designs/`](docs/designs/) (one design
doc per feature), [`docs/adr/`](docs/adr/) (the *why*),
[`docs/glossary.md`](docs/glossary.md) (the vocabulary).
`node plugin/bin/the-loop.js status` prints the status story on demand.

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
- **`/the-loop release`** replays the runbooks, holds the one human gate, and runs
  the project's recorded release runbook.

## Layout

Plugin content lives under `plugin/` (the marketplace `source`) so the shipped bundle
is exactly that subdirectory; dev tooling stays at the repo root and never ships
(ADR-0048).

```
.claude-plugin/marketplace.json   marketplace descriptor → source: ./plugin
plugin/                        the plugin root — the entire shipped bundle
  .claude-plugin/plugin.json   plugin manifest
  package.json                 type:module + the vendored runtime dep declaration
  src/                         pure core (parse/render, schema, plan, execution-context
                               preparation, models)
  bin/the-loop.js              the CLI (list | check | set-status | status |
                               prepare-execution-context | plan | worktree-create |
                               worktree-remove | executors-list | models-list)
  workflows/execution-pipeline.js   the execution pipeline (concurrency-policy
                               scheduling, task-brief prompts)
  agents/                      system prompts: plan, build, validate, drive
  commands/ skills/            front door + define/design/release/code-quality
  config/                      model-bindings.json + executors/ (CLI-executor playbooks)
  node_modules/yaml/           the one runtime dep, vendored (tracked, no build step)
bin/create-sample-repo.js      dev/test fixture generator (repo root — not shipped)
test/                          node:test suites
docs/                          durable artifacts: architecture, adr, glossary, runbooks, releases
```

## Develop

Plain ESM JavaScript, no build step. Requires Node ≥ 22.11. The plugin's one runtime
dependency (yaml) is vendored under `plugin/node_modules/`; the repo root carries only
dev tooling (eslint, node:test).

```
npm install      # dev tooling (eslint, node:test); the runtime dep ships vendored
npm test         # node --test
npm run check    # validate + round-trip docs/feature-graph.md, then eslint
```
