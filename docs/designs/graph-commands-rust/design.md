# graph-commands-rust — feature-graph.json schema + status/list/check/set-status in Rust

**Status:** designed 2026-07-09 from `docs/briefs/rust-cli-replatform.md` (ADR-0051).

The Rust CLI's first real vertical: the feature-graph moves to a pure JSON file with
canonical emit, and the four graph commands reach parity. This slice defines the
serde spine every later command builds on.

## The file and its schema

`docs/feature-graph.json` (the Rust binary's view; `docs/feature-graph.md` stays the
JS CLI's until json-cutover migrates this repo — fixtures carry both formats via the
parity-oracle's paired generator):

```json
{
  "design_version": 26,
  "features": [
    {
      "id": "kebab-case-slug",
      "section": "walking skeleton (v1.0)",
      "title": "one line",
      "status": "proposed | designed | validated | shipped",
      "depends_on": ["other-id"],
      "acceptance": ["observable, binary criterion"],
      "notes": ["optional"]
    }
  ]
}
```

Same contract as today's YAML (`plugin/src/feature-schema.js` is the reference):
`id` matches `^[a-z0-9][a-z0-9-]*$` (ids become git refs and paths — reject before
they reach either); `acceptance` required except at `proposed`; `depends_on` edges
must resolve, no self-edges, no cycles (DFS, report the cycle path). **New field
`section`** (optional string) replaces the YAML era's `# ── milestone ──` comments —
grouping as queryable data; `list`/`status` output carries it through untouched.

## Canonical emit — the whole round-trip story

Writes always re-emit the entire file canonically: schema key order (as in the block
above), 2-space indent, `\n` line endings, trailing newline. A valid hand-edit's
*content* survives the next tool write; its incidental *formatting* normalizes. This
replaces the JS CLI's document-preserving machinery (`YAML.parseDocument`, `render`
round-trip checks) entirely — `check`'s round-trip criterion becomes "emit(parse(text))
is canonical and JSON-equal to text", trivially true after any tool write.

## Commands at parity

Behavior per the JS reference in `plugin/bin/cli-commands.js` + `plugin/src/`:

- **`check [path]`** — validate schema + referential integrity; prints the
  `OK/FAIL … N features — E error(s), W warning(s)` summary with per-issue lines,
  exit 0/1. Malformed JSON is a named refusal, not a panic.
- **`status [path]`** (human summary) and **`status --json`** (machine orientation:
  mode, position, eligible set, next-action proposal — port of
  `propose-next-action.js` + `status-summary.js`, including recorded-bindings
  detection, which scans `docs/architecture.md` headings and stays a markdown scan).
- **`list [path]`** — the parsed model as JSON.
- **`set-status <id> <status> [path]`** — flip one feature, write canonically, print
  the updated record.

Exit-code and stdout-JSON parity is judged by the oracle's paired-fixture cases; the
refusal catalog (missing/duplicate/malformed id, bad status, missing acceptance on
non-proposed, dangling/self/cyclic depends_on, bad design_version, malformed JSON)
mirrors `feature-schema.js` codes.

## Touched surfaces

| Surface | Change |
|---|---|
| `cli/src/` | graph model (serde types), canonical emitter, validator, four commands |
| `test/oracle/` | graph-command cases flip from pending to live |
| `cli/` unit tests | validator/emitter edge cases (cargo test) |

## What a builder would otherwise guess

- Serde structs use field defaults so absent `depends_on`/`notes`/`section` parse
  clean and **absent stays absent** on emit (no `"notes": null` churn).
- Unknown top-level or per-feature keys are a `check` error (tool-owned file), not
  silently dropped — a hand-edit typo must be caught, not eaten by the next write.
- `status --json` output must be JSON-equal to the JS CLI's on paired fixtures —
  port the proposal logic faithfully; do not redesign proposals (semantics frozen).
- The JS CLI is untouched by this feature; both implementations live side by side
  until json-cutover.

## Acceptance (from the feature graph)

1. Reads `docs/feature-graph.json`, re-emits canonically; shuffled-key hand-edit
   re-emits content-equal, bytes canonical.
2. Schema carries the feature-record contract with `section` expressing the old
   comment groupings.
3. `check` exit 0 "OK" on valid; exit 1 naming each offense on invalid.
4. Oracle's status/status --json/list/check/set-status cases pass against the Rust
   binary — stdout JSON-equal, exit codes equal, on paired fixtures.
