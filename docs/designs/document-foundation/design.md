# document-foundation — Artifact files, schemas, and the graph/plan toolkit

**Status:** shipped (v1 2026-07; reshaped by the v2 taming, ADR-0036/0037).

The foundation everything else stands on: the hybrid Markdown+YAML artifact format
and the pure toolkit over it.

## What it is

- `src/replace-fenced-block.js` — finds/replaces the ```yaml block under an exact
  `## Heading` (`yamlBlockAfter`, `replaceBlock`) and extracts verbatim prose
  sections (`sectionAfter` — how `the-loop prepare-execution-context` reads the
  recorded bindings out of `docs/architecture.md`).
- `src/parse-feature-graph.js` / `src/write-feature-graph.js` — the round-trip:
  `render(text, parse(text)) === text`, byte-identical. Mutations go parse →
  mutate the retained YAML document → render; never string surgery. Comments and
  key order survive.
- `src/feature-schema.js` — the feature-record schema and graph validator (ids as
  lowercase slugs because they become git refs and paths; cycle detection; the
  three durable statuses).
- `src/plan.js` — the plan artifact's parse/validate/resolve (see the `plan` feature
  doc for the contract).
- `src/prepare-execution-context.js` — the run-preparation assembler's pure core:
  scope gates, git-derived task state (`builtTaskIds`), execution-context shaping.

## Contract: feature record

```
{ id, title, status: designed|validated|shipped,
  depends_on: [id], acceptance: criterion | [criterion], notes?: [str] }
```

`design_version` is doc-level only (an int at the top of the graph block) — plans
carry the version they were cut from and warn when stale.

## Constraints

- Parse is lenient (missing block → empty model); semantics live in `validate()`.
- Everything in `src/` is pure — no filesystem, no process, no clock; effects live
  at the bin edge (`bin/cli-commands.js`).
- YAML house style is pinned by render options (`[a, b]` flow, no line folding) so
  re-rendering an unchanged model is byte-identical — required by `the-loop check`.
