# Probe pack — ledger-title-preservation

Pinned from the perfect validation of patch_id
`da9d372eb996854d7e4e900972ccdc491dd3d392`: the renderer preamble fix.
`renderLedger` now carries everything before `priorText`'s first `## ` heading
byte-identically to the top of the render, and seeds the standard title line
(`# Ledger — projected from design.md (feature graph)`) when there is nothing
there. Exercised black-box through `node bin/spine.js ledger render` against
the fixture-repo probe, plus a live render on this repo itself.

Volatile fields (temp-dir paths, feature/test counts, durations, commit SHAs)
are masked; replay re-derives them fresh. Counts in particular drift with the
graph and suite — pin the zero-error/zero-fail shape, never the number.

```yaml
steps:
  - action: bring up the fixture-repo probe's populated variant — `node bin/probe-fixture.js populated`; call the printed path $FIX
    expected_observation: a temp git repo seeded with committed docs/design/design.md + docs/ledger/ledger.md, clean tree
  - action: overwrite $FIX/docs/ledger/ledger.md with pre-heading content — printf '# Custom Title\n\n<!-- sentinel-prior-text -->\n\n## First Section\n\ncontent\n'; capture the bytes before the first "## " heading
    expected_observation: captured prefix is "# Custom Title\n\n<!-- sentinel-prior-text -->\n\n"
  - action: from $FIX, run `node <the-loop>/bin/spine.js ledger render`
    expected_observation: prints {"written":"docs/ledger/ledger.md"}, exit 0
  - action: re-extract the bytes before the first "## " heading of $FIX/docs/ledger/ledger.md and compare with the captured prefix
    expected_observation: byte-identical — the sentinel pre-heading content survives the render verbatim
  - action: seed case — in a fresh populated $FIX, set docs/ledger/ledger.md to '## First Section\n\ncontent\n' (no pre-heading text) and run the same render
    expected_observation: the file now opens with "# Ledger — projected from design.md (feature graph)", then one blank line, then the first "## " heading
  - action: live case — from the the-loop repo root, record `head -1 docs/ledger/ledger.md`, run `node bin/spine.js ledger render`, re-run `head -1`, then `git diff -- docs/ledger/ledger.md`
    expected_observation: >-
      the first line is the repo's own title line ("# Ledger — the-loop   ·
      projected from design.md (feature graph) · established at Design
      finalize, 2026-06-29" as of pinning) before and after, never a "## "
      heading; the diff is empty apart from any sections regenerated because
      the graph moved since the last committed render
  - action: deterministic corroboration — `npm test` and `npm run check` at the repo root
    expected_observation: full suite green (0 fail) including test/ledger.test.js's preamble tests; check prints OK with 0 error(s), 0 warning(s) — counts unpinned, they drift with the graph
  - action: teardown — remove the temp fixture dirs
    expected_observation: no loop-probe-* temp dirs left behind
```
