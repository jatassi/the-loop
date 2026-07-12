# Validation runbook — using-the-loop-skill

Judge pass against `main...HEAD` on the assembled `integrate--using-the-loop-skill`
worktree. The surface is a single bundled skill file
(`plugin/skills/using-the-loop/SKILL.md`); its prose is exercised by literal read,
its CLI/docs-path claims are exercised against the shipping binary and a fixture
repo, and the suite/lint are re-run as integrity gates.

## Bring-up

```bash
# From the-loop repo root
node bin/create-sample-repo.js          # → configured fixture (feature-graph + design)
node bin/create-sample-repo.js empty    # → bare unconfigured fixture
```

## Exercise

Against the shipping binary (`target/release/the-loop`), from the repo root:

```bash
./target/release/the-loop --help
./target/release/the-loop status --help
./target/release/the-loop list --help
./target/release/the-loop hooks-list --help
./target/release/the-loop models-list --help
```

Against each fixture (cwd = fixture path):

```bash
the-loop status --json
the-loop list
the-loop hooks-list
the-loop models-list
the-loop status     # human form
```

Integrity (from the-loop repo root):

```bash
npm test                                     # expect 208/208 pass
node --test test/using-the-loop-skill.test.js   # feature suite in isolation
npm run lint                                 # expect clean
git diff main...HEAD --stat                  # read-only: SKILL.md + its test + one design-doc line
ls plugin/skills/using-the-loop/             # SKILL.md only
```

Prose surfaces checked by literal read:

- `plugin/skills/using-the-loop/SKILL.md` — frontmatter description (three trigger
  families, ≤400 chars), body (≤150 lines, exactly three moves: loop-owned path
  table + don't-hand-edit rule, `/begin` as sole named entry point, tier-2 map to
  CLI + project artifacts), no ADR numbers / the-loop-internal references,
  no project-specific content
- `plugin/skills/begin/SKILL.md`, `plugin/skills/onboard/SKILL.md`,
  `plugin/skills/configure/SKILL.md` — grepped for project-orientation trigger
  language or prose duplicated from the new body (dedup sweep, criterion 6)
- top-level `the-loop --help` text — grepped the same way

## Expected observations

- `--help` output lists `status`, `list`, `hooks-list`, `models-list` — every CLI
  invocation the new SKILL.md body names.
- Configured fixture: `status --json` returns `mode: "configured"`, a real
  `eligibleSet`/proposal; `list` returns `designVersion` + `features`;
  `hooks-list` / `models-list` return their resolved inventories — all commands
  the body points at as tier-2 live state actually work against a real project.
- Empty fixture: `status --json` returns `mode: "unconfigured"`, proposal kind
  `onboard` — confirms the CLI is a live oracle regardless of project state.
- `docs/` paths named in the body (`docs/feature-graph.json`,
  `docs/architecture.md`, `docs/briefs/`, `docs/designs/<id>/design.md`,
  `docs/glossary.md`, `docs/adr/`, `docs/bugs/`, `docs/runbooks/<topic>.md`,
  `docs/validation/`, `docs/releases/`, `docs/calibration/`, `docs/adapters/`)
  each match a path a loop phase skill/agent actually writes, per this repo's own
  `docs/` tree and phase skill/agent prose.
- `plugin/skills/using-the-loop/` contains exactly one file: `SKILL.md`.
- Description measured at 353 chars (≤400); body measured at 46 lines (≤150).
- `begin`/`onboard`/`configure` descriptions and `the-loop --help` carry no
  verbatim orientation-trigger prose duplicated from the new body — no trims
  needed, none made.

### Integrity gates

- Diff adds only: `plugin/skills/using-the-loop/SKILL.md`,
  `test/using-the-loop-skill.test.js`, and a one-line path-form fix in
  `docs/designs/using-the-loop-skill/design.md`. No `eslint-disable`, no
  lint-config edit, no deleted or weakened pre-existing test.
- Full suite 208/208; lint clean. The feature's own 6 tests bite the shipped
  SKILL.md text, the shipping binary's `--help` output, and the repo's `docs/`
  tree (not vacuous passes).

### Acceptance criteria (judge summary)

1. **Met** — `plugin/skills/using-the-loop/` ships `SKILL.md` only; frontmatter
   `name: using-the-loop`.
2. **Met** — description is 353 chars, names all three trigger families
   (concrete entry moments, the protective `docs/` moment naming
   `feature-graph.json`, and orientation curiosity).
3. **Met** — body is 46 lines, makes exactly the three moves (path table + rule,
   `/begin` as sole named skill, tier-2 map); no other bundled skill named.
4. **Met** — every named CLI command (`status`, `list`, `hooks-list`,
   `models-list`) appears in `--help`; every named `docs/` path matches a
   phase-written convention.
5. **Met** — no ADR numbers or the-loop-internal document references; no
   project-specific content (generic across consumer projects).
6. **Met** — dedup sweep found no project-orientation trigger language or
   duplicated prose in begin/onboard/configure or top-level `--help`; no trims
   required.

## Teardown

```bash
rm -rf "$(node bin/create-sample-repo.js)"        # if not already removed
rm -rf "$(node bin/create-sample-repo.js empty)"  # if not already removed
```

Do not leave probe repos on disk.
