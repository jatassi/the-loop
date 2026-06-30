# the-loop

An owned, composable augmentation layer — built from native Claude Code primitives
(skills, subagents, hooks, commands, a Workflow) — that moves an idea through the full
SDLC: **refine → design → build → validate → ship → operate → evolve**. It ships as a
**Claude Code plugin**; the artifacts it produces live git-versioned in the **target repo**
it operates on. Its first job is to build itself.

Design is the source of truth: [`docs/design/design.md`](docs/design/design.md) (the *what*),
[`docs/adr/`](docs/adr/) (the *why* of every decision), [`docs/dictionary/`](docs/dictionary/DICTIONARY.md)
(the vocabulary). Start at [`docs/ledger/ledger.md`](docs/ledger/ledger.md) to see where the build is.

## Status

Hand-building the **walking skeleton** (v1.0) in dependency order until it can self-host
(ADR-0020). Built so far:

- **`artifact-spine`** — the artifact toolkit: schemas for the structured blocks, a
  `parse`/`render` pair over `design.md`, and the `resolve(id) → {node, contracts}` injection
  resolver (address-by-id; ADR-0003/0004). See [`src/`](src/).

## Layout

```
.claude-plugin/plugin.json   plugin manifest
src/                         the loop's own code (the artifact spine lives here today)
bin/spine.js                 CLI over the artifact spine (parse | index | resolve | check)
test/                        node:test suites (the real design.md is the fixture)
docs/                        durable artifacts: design, adr, dictionary, ledger
commands/ skills/ workflows/ arrive with `the-loop-entry` and later features
```

## Develop

Plain ESM JavaScript, no build step. Requires Node ≥ 20.

```
npm install      # one dependency: yaml
npm test         # node --test
npm run check    # validate + round-trip docs/design/design.md (exit 1 on failure)
```
