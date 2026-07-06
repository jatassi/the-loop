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
`node bin/the-loop.js status` prints the status story on demand.

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

```
.claude-plugin/plugin.json   plugin manifest
src/                         pure core (parse/render, schema, plan, execution-context
                             preparation, models)
bin/the-loop.js              the CLI (list | check | set-status | status |
                             prepare-execution-context | plan | worktree-create |
                             worktree-remove | executors-list | models-list)
workflows/execution-pipeline.js   the execution pipeline (concurrency-policy
                             scheduling, task-brief prompts)
agents/                      system prompts: plan, build, validate, drive
commands/ skills/            front door + define/design/release/code-quality
docs/executors/              CLI-executor playbooks (grok)
test/                        node:test suites
docs/                        durable artifacts: architecture, adr, glossary, runbooks, releases
```

## Develop

Plain ESM JavaScript, no build step. Requires Node ≥ 22.11.

```
npm install      # one dependency: yaml
npm test         # node --test
npm run check    # validate + round-trip docs/feature-graph.md, then eslint
```
