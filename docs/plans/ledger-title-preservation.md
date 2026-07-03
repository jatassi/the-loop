# Plan — ledger-title-preservation

Bug intake from validation `e9efcf74` (docs/validations/inner-loop-workflow.md): the
first live `spine ledger render` dropped `docs/ledger/ledger.md`'s leading title
line. The cause sits in `src/ledger.js` — `renderLedger` assembles the document
purely from `## `-headed sections, and its `section()` slicing captures text only
from a heading to the next heading, so anything in `priorText` before the first
`## ` heading never enters any slice and is silently discarded. No fixture in
`test/ledger.test.js` models pre-heading content: every fixture's `priorText`
begins directly at `## What this is`.

## Decomposition — fix in the core, then prove it live on this repo

Two tasks, chained. **t1** fixes the renderer in the pure core: everything in
`priorText` before its first `## ` heading is preserved byte-identically at the
top of the render, and when there is nothing there, the standard title line is
seeded — with fixtures that finally model a title line. **t2** restores this
repo's dropped title line and runs a real `spine ledger render` to prove the
fixed preservation path carries it through. Footprints are disjoint
(`src/` + `test/` vs `docs/ledger/`), but t2 must order after t1: rendering
before the fix lands would drop the restored line all over again.

## Pinned decisions the slice leaves open

**The standard title line.** The feature's first criterion says the renderer
"seeds the standard title line when priorText has none", but no repo artifact
defines one. The parsed design model carries no project name, and `renderLedger`
must stay deterministic and pure (no clock, no filesystem), so the repo-specific
parts of the original line ("the-loop", "established at Design finalize,
2026-06-29") cannot be seeded. The standard title line is pinned here as the
constant `# Ledger — projected from design.md (feature graph)` — the generic
segment of the original — followed by one blank line before `## What this is`.

**The repo's own title is restored, not seeded.** Criterion 2 wants ledger.md to
carry *its* title line again — the exact line the bug destroyed, which the seed
cannot reproduce. The title sits in the human-owned preserved region of the
document, so t2 restores it by hand (byte-identical to the pre-drop bytes, source
of truth `git show 705eed7:docs/ledger/ledger.md`) and the live render then
demonstrates the preservation path, not the seeding path.

**Degenerate priorText.** A `priorText` with no `## ` heading at all is
all-preamble: preserved in full, with the five sections regenerated or seeded
after it (the existing `section()` seeding already covers the two preserved
sections). An empty `priorText` has no preamble, so it takes the seeded standard
title line.

Both tasks sit well under the sizing ceiling; no `m` to justify.

## Tasks

```yaml
feature: ledger-title-preservation
design_version: 4
tasks:
  - id: t1
    title: renderLedger preamble — preserve pre-heading content, seed the standard title line
    status: pending
    covers: [1]
    acceptance:
      - for a priorText with content before its first "## " heading, renderLedger's output up to its own first "## " heading is byte-identical to priorText up to its first "## " heading — proven by a new test whose priorText fixture carries a title line ("# Ledger — …") followed by a blank line
      - for a priorText with no content before its first "## " heading, and separately for an empty priorText, the output up to its first "## " heading is exactly the pinned constant "# Ledger — projected from design.md (feature graph)" followed by one blank line
      - renderLedger stays deterministic and pure — the same three arguments render byte-identical output twice, and the function reads no filesystem or clock — and all five "## " sections still render in their existing order after the preamble
      - the pre-existing tests in test/ledger.test.js, whose fixtures carry no pre-heading content, are updated to expect the seeded standard title line and the full suite plus npm run check pass
    injects: []
    standards: [docs/standards/pure-core-thin-cli.md]
    footprint: [src/ledger.js, test/ledger.test.js]
    size: s
    depends_on: []

  - id: t2
    title: Restore this repo's Ledger title line and prove a live render preserves it
    status: pending
    covers: [2]
    acceptance:
      - docs/ledger/ledger.md begins again with the exact pre-drop content — byte-identical to the first two lines (title line, then blank line) of "git show 705eed7:docs/ledger/ledger.md", the line reading "# Ledger — the-loop   ·   projected from design.md (feature graph) · established at Design finalize, 2026-06-29"
      - the committed docs/ledger/ledger.md is the verbatim on-disk output of a real "node bin/spine.js ledger render" executed after the restoration — the command reported its write, the title line survived it, and the regenerated sections reflect the feature graph as of that run
    injects: []
    standards: [docs/standards/derived-and-hybrid-artifacts.md]
    footprint: [docs/ledger/ledger.md]
    size: xs
    depends_on: [t1]
```
