# artifact-spine — Artifact files, schemas, and the graph/plan toolkit

**Status:** shipped (v1 2026-07; reshaped by the v2 taming, ADR-0036/0037).

The foundation everything else stands on: the hybrid Markdown+YAML artifact format
and the pure toolkit over it.

## What it is

- `src/blocks.js` — finds/replaces the ```yaml block under an exact `## Heading`
  (`yamlBlockAfter`, `replaceBlock`) and extracts verbatim prose sections
  (`sectionAfter` — how `the-loop launch` reads the recorded bindings out of design.md).
- `src/parse.js` / `src/render.js` — the round-trip: `render(text, parse(text)) ===
  text`, byte-identical. Mutations go parse → mutate the retained YAML document →
  render; never string surgery. Comments and key order survive.
- `src/schema.js` — the feature-node schema and graph validator (ids as lowercase
  slugs because they become git refs and paths; cycle detection; the three durable
  statuses).
- `src/plan.js` — the plan artifact's parse/validate/resolve (see the `plan` feature
  doc for the contract).
- `src/launch.js` — the launch assembler's pure core: scope gates, git-derived task
  state (`builtTaskIds`), snapshot shaping.

## Contract: feature node

```
{ id, title, status: designed|validated|shipped,
  depends_on: [id], acceptance: criterion | [criterion], notes?: [str] }
```

`design_version` is doc-level only (an int at the top of the graph block) — plans
carry the version they were cut from and warn when stale.

## Constraints

- Parse is lenient (missing block → empty model); semantics live in `validate()`.
- Everything in `src/` is pure — no filesystem, no process, no clock; effects live
  at the bin edge (`bin/spine-commands.js`).
- YAML house style is pinned by render options (`[a, b]` flow, no line folding) so
  re-rendering an unchanged model is byte-identical — required by `the-loop check`.
