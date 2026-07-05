# the-loop

An owned, composable agentic dev loop — built from native Claude Code primitives
(skills, subagents, commands, a Workflow) — that moves an idea through the full SDLC:
**frame → design → build → validate → ship → operate → evolve**. It ships as a
**Claude Code plugin**; the artifacts it produces live git-versioned in the target
repo it operates on. Its first job is to build itself. Founding principle: **earns
its context** — every component justifies its token cost (rebuilt around that
principle 2026-07-04; ADR-0034–0040).

Design is the source of truth: [`docs/design/design.md`](docs/design/design.md) (the
system), [`docs/design/graph.md`](docs/design/graph.md) (the feature graph — the
durable state machine), [`docs/design/features/`](docs/design/features/) (one design
doc per feature), [`docs/adr/`](docs/adr/) (the *why*),
[`docs/dictionary/`](docs/dictionary/DICTIONARY.md) (the vocabulary).
`node bin/the-loop.js ledger` prints the status story on demand.

## How it runs

- **`/the-loop`** orients from the graph and proposes the next action; the human
  confirms scope.
- **`the-loop launch --scope <ids>`** gates everything mechanically and assembles the
  one snapshot the Workflow consumes.
- The **inner-loop Workflow** runs Plan → Build → Validate per feature, concurrent
  where dependencies allow. Every unit of work runs in its own worktree under
  `.claude/worktrees/` — the main checkout is yours and is never touched.
- Durable state is code commits + the graph's three statuses
  (`designed | validated | shipped`); plans live on feature branches and vanish when
  the feature's squash-merge lands; a blocked feature is a question in the chat at
  the run boundary.
- **`/the-loop ship`** replays the probe packs, holds the one human gate, and runs
  the project's recorded ship recipe.

## Layout

```
.claude-plugin/plugin.json   plugin manifest
src/                         pure core (parse/render, schema, plan, launch, models)
bin/the-loop.js                 the CLI (graph | check | set-status | ledger | launch |
                             plan | worktree | executors | models)
bin/the-loop.js              orient (position + proposal JSON)
workflows/inner-loop.js      the engine (ready-set scheduling, kernel prompts)
agents/                      role cards: plan, build, validate, drive
commands/ skills/            front door + frame/design/ship/craft
executors/                   CLI-executor playbooks (grok)
test/                        node:test suites
docs/                        durable artifacts: design, adr, dictionary, probes, ships
```

## Develop

Plain ESM JavaScript, no build step. Requires Node ≥ 22.11.

```
npm install      # one dependency: yaml
npm test         # node --test
npm run check    # validate + round-trip docs/design/graph.md, then eslint
```
