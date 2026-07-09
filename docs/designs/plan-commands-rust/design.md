# plan-commands-rust — plan.json schema + plan parse/check/task in Rust

**Status:** designed 2026-07-09 from `docs/briefs/rust-cli-replatform.md` (ADR-0051).

Plans move from a `## Tasks` YAML block in `docs/plans/<id>/plan.md` to pure
`docs/plans/<id>/plan.json`, and the three plan subcommands reach parity. Plans are
transient (they live on feature branches, never merged — ADR-0037), so no repo
migration rides this feature: the format simply changes for plans written after
cutover, and the parity window feeds each binary its own format via the oracle's
paired fixtures.

## The file and its schema

`docs/plans/<id>/plan.json` — the task-contract shape from the architecture's
interface contracts, JS reference `plugin/src/plan.js`:

```json
{
  "feature": "feature-id",
  "design_version": 26,
  "tasks": [
    {
      "id": "task-slug",
      "title": "one line",
      "covers": [0, 1],
      "acceptance": ["observable, binary criterion"],
      "footprint": ["path/or/glob"],
      "size": "xs | s | m",
      "judgment_level": "rote | standard | complex",
      "depends_on": ["other-task-id"],
      "wiring": "optional"
    }
  ]
}
```

No status, no reports — git carries task state (commit subject `<feature>/<task>: …`
on branch `loop/<feature>--<task>`), unchanged.

## Commands at parity

- **`plan parse <feature-id> [path]`** — parsed plan as JSON (default path
  `docs/plans/<id>/plan.json`).
- **`plan check <feature-id> [plan] [graph]`** — validate the plan against the graph:
  task ids well-formed/unique, `covers` indexes within the feature's acceptance list,
  `size`/`judgment_level` enums, task `depends_on` resolution + cycle detection
  (same DFS as the graph), feature-mismatch refusal (plan declares a different
  feature than checked as). Prints the `OK/FAIL plan <id>: N task(s) …` summary,
  exit 0/1.
- **`plan task <feature-id> <task-id> [plan] [graph]`** — carve one task's brief out
  of the plan (the facts layer: agents get contracts below file granularity, ADR-0036)
  — port of `resolveTask`, JSON-equal output.

The round-trip criterion collapses as for the graph: canonical emit (schema key
order, 2-space indent, trailing newline) replaces block-preserving render.

## Touched surfaces

| Surface | Change |
|---|---|
| `cli/src/` | plan model + validator + three subcommands (reuses graph parsing and the shared cycle detector) |
| `test/oracle/` | plan cases flip from pending to live |
| Plan-agent surfaces | **none here** — prompts/skills say "plan file"; the path/format flip for newly written plans lands at json-cutover |

## What a builder would otherwise guess

- `covers` indexes are 0-based into the feature's `acceptance` array (JS reference:
  `resolveTask`/`validatePlan` in `plugin/src/plan.js`) — verify against the JS
  behavior via oracle cases rather than re-deriving.
- Warnings (non-blocking lints) print to stderr and never affect exit codes, exactly
  as the JS `validatePlan` splits errors from warnings.
- The plan's durable home is the feature branch; `plan` subcommands read a file path,
  not git — branch reading belongs to prepare-execution-context (run-commands-rust).
- Semantics are frozen: no new lints, no relaxations, whatever `plan.js` does is the
  spec even where it feels improvable.

## Acceptance (from the feature graph)

1. Schema at `docs/plans/<id>/plan.json` carries the task-contract shape, read and
   canonically re-emitted like the graph.
2. Oracle's plan parse/check/task cases pass against the Rust binary, including the
   refusals (feature mismatch, covers out of range, bad judgment level, task cycle),
   exit codes equal to the JS CLI.
