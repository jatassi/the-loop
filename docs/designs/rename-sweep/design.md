# rename-sweep — apply the approved map atomically

**Status:** designed. Depends on `naming-map`: this feature executes the approved
map at `docs/design/naming-map.md` mechanically — it makes **zero naming
decisions**. An ambiguity in the map (a rename whose application site is genuinely
unclear) is a feature-shaped block naming the row, never an on-the-spot judgment.

## What this is

One atomic landing that moves every living surface to the approved vocabulary:
rename files, identifiers, terms, and conventions; add `(historical)` glossary
aliases; rewrite prose exactly where it used a renamed term or coined jargon; leave
historical records byte-identical. After it lands, each replaced old name greps to
zero on living surfaces and the loop runs end to end under the new vocabulary.

## Scope of "living surfaces"

`docs/` (except the historical set), `skills/`, `agents/`, `commands/`,
`workflows/`, `bin/`, `src/`, `test/`, `config/`, `executors/`, README, CLAUDE.md,
plugin manifest. The **historical set** — content untouched: `docs/adr/`,
`docs/ships/`, `docs/rca/`, `docs/research/`,
`docs/agentic-dev-loop-design-intent.md`, `docs/agentic-dev-loop-design-decisions.md`,
`docs/briefs/` (records of past intent), and the frozen map itself (append the
`swept: <date>` header line; nothing else changes). One approved exception (map
mechanics note 2): `docs/ships/*` and `docs/rca/*` move content-identical — git mv,
filenames preserved, bytes unchanged — into `docs/releases/` and `docs/bugs/`; the
grep-zero exclusion set is therefore the *post-move* record homes.

## Bootstrap posture (a loop renaming its own conventions)

1. **The run executes the code it launched with** (system law for self-edits):
   sweep tasks run under the old conventions — old branch prefixes, old status
   values, old commit-subject shapes. New conventions govern the next run.
2. **Paired data+code renames land atomically** in this feature's squash, proven by
   the suite on the merged tree. The known pairs, from source:
   - status values — `STATUS = ['designed', 'validated', 'shipped']`
     (`src/feature-schema.js`) must agree with every status in `feature-graph.md`;
   - branch shapes — `` `loop/${featureId}` `` and
     `` `loop/${featureId}--${taskId}` `` (`src/prepare-execution-context.js`) must agree with how the
     workflow and worktree commands cut branches *on the post-sweep tree*;
   - the commit-subject prefix (`src/prepare-execution-context.js`) must agree with what build agents
     are told to write;
   - artifact-path constants — everywhere code or a prompt names an artifact home
     (the graph, per-feature design docs, plans, runbooks, RCA lookups including
     the `features/`-then-`rca/` fallback becoming `designs/`-then-`bugs/`, the
     glossary) must agree with the moved files on the post-sweep tree.
3. **Never rename the in-flight subtree**: `naming-map` and `rename-sweep` rows are
   `keep` by construction; graph ids of all other records rename freely, and their
   design-doc and runbook filenames follow (`docs/designs/<id>/design.md`,
   `docs/runbooks/<id>/runbook.md`).
4. **Quiet graph**: launched alone in scope, nothing else in flight. The
   run-preparation leg re-checks this.
5. **Prepare the execution context from the target branch's checkout**:
   `naming-map`'s validated status lands on the target branch, not on `main` — a
   run-preparation run from the `main` checkout would refuse this feature's
   dependency gate. Run the run-preparation leg from a worktree of the target
   branch (the CLI reads artifacts from its working directory).

## Mechanics

- **The approved map's `## Sweep mechanics (human-approved at the boundary)`
  section is binding input**, alongside the row verdicts — five notes: the
  orient+ledger collapse into one `status` subcommand (human summary default,
  `--json` machine orientation); the record moves (above); label-vs-literal
  convention rows (literal `loop/<id>`, `loop/<id>--<task>`, commit-subject, and
  `fix-` patterns stay; future release tags use `v<version-number>`); the
  interview port's binding id stays `/grilling` (user-level skill outside this
  repo); and the deferred feature-status expansion, which the sweep must NOT
  implement (filed in docs/TODO.md for a post-sweep amendment).
- **Coverage re-check first**: diff the name inventory at this feature's branch
  point against the map's `enumerated_at` tip. A name born in between is applied
  if the map's family pattern decides it mechanically and it passes the standard;
  otherwise it surfaces as a deviation. Nothing is silently skipped.
- **Aliases**: every renamed glossary term keeps its old name —
  `**aliases:** <old name> (historical)`. Renamed non-glossary surfaces (files,
  verbs) need no alias entry; the frozen map is their record.
- **Prose**: rewrite sentences that used a renamed term; while in a file, fix
  jargon-coining phrasing per the plain-speech clause. Not a general copy-edit —
  untouched-term prose stays put.
- **Code-quality rule**: the code-quality baseline gains one distilled line —
  identifiers follow the naming standard (glossary rules section); no coined
  proper nouns.
- **Memory refs are out of repo and out of scope** — stale terms there are the
  operator's problem, noted at the boundary.

## Plan note (the knife is Plan's, but the tension is known)

Cross-cutting terms make file-disjoint task footprints hard: one term touches
docs, skills, src, and test at once. Fewer, larger tasks split **by family or by
term-set** (all sites of one term-set in one task) beat many per-directory tasks
that would each half-rename a term. The test-gated merge policy covers the overlap
that remains.

## Validator brief

On the merged tree: for each `rename → X` row, old name greps to zero outside the
post-move historical set (run it; don't trust the report); historical content
untouched — `git diff` against the base for in-place record paths is empty, and
the two moved corpora are rename-only (`git log --follow --find-renames` shows
100% similarity, no content delta); aliases present for renamed terms in the
swept glossary; the map's five mechanics notes implemented (exercise the status
collapse: default output is the human summary, `--json` the machine orientation);
`npm test` and `npm run check` green; probe the loop from outside — the machine
orientation reads the swept graph and the renamed run-preparation subcommand
assembles a valid execution context naming the new vocabulary (dry, against a
ready feature or the sample repo).
