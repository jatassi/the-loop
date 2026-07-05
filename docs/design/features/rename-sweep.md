# rename-sweep — apply the approved map atomically

**Status:** designed. Depends on `naming-map`: this feature executes the approved
map at `docs/design/naming-map.md` mechanically — it makes **zero naming
decisions**. An ambiguity in the map (a rename whose application site is genuinely
unclear) is a feature-shaped block naming the row, never an on-the-spot judgment.

## What this is

One atomic landing that moves every living surface to the approved vocabulary:
rename files, identifiers, terms, and conventions; add `(historical)` dictionary
aliases; rewrite prose exactly where it used a renamed term or coined jargon; leave
historical records byte-identical. After it lands, each replaced old name greps to
zero on living surfaces and the loop runs end to end under the new vocabulary.

## Scope of "living surfaces"

`docs/` (except the historical set), `skills/`, `agents/`, `commands/`,
`workflows/`, `bin/`, `src/`, `test/`, `config/`, `executors/`, README, CLAUDE.md,
plugin manifest. The **historical set** — byte-identical before/after: `docs/adr/`,
`docs/ships/`, `docs/rca/`, `docs/research/`,
`docs/agentic-dev-loop-design-intent.md`, `docs/agentic-dev-loop-design-decisions.md`,
`docs/briefs/` (records of past intent), and the frozen map itself (append the
`swept: <date>` header line; nothing else changes).

## Bootstrap posture (a loop renaming its own conventions)

1. **The run executes the code it launched with** (system law for self-edits):
   sweep tasks run under the old conventions — old branch prefixes, old status
   values, old commit-subject shapes. New conventions govern the next run.
2. **Paired data+code renames land atomically** in this feature's squash, proven by
   the suite on the merged tree. The known pairs, from source:
   - status values — `STATUS = ['designed', 'validated', 'shipped']`
     (`src/schema.js`) must agree with every status in `graph.md`;
   - branch shapes — `` `loop/${featureId}` `` and
     `` `loop/${featureId}--${taskId}` `` (`src/launch.js`) must agree with how the
     workflow and worktree commands cut branches *on the post-sweep tree*;
   - the commit-subject prefix (`src/launch.js`) must agree with what build agents
     are told to write.
3. **Never rename the in-flight subtree**: `naming-map` and `rename-sweep` rows are
   `keep` by construction; graph ids of all other nodes rename freely, and their
   feature-doc and probe-pack filenames follow (`docs/design/features/<id>.md`,
   `docs/probes/<id>.md`).
4. **Quiet graph**: launched alone in scope, nothing else in flight. The launch leg
   re-checks this.

## Mechanics

- **Coverage re-check first**: diff the name inventory at this feature's branch
  point against the map's `enumerated_at` tip. A name born in between is applied
  if the map's family pattern decides it mechanically and it passes the standard;
  otherwise it surfaces as a deviation. Nothing is silently skipped.
- **Aliases**: every renamed dictionary term keeps its old name —
  `**aliases:** <old name> (historical)`. Renamed non-dictionary surfaces (files,
  verbs) need no alias entry; the frozen map is their record.
- **Prose**: rewrite sentences that used a renamed term; while in a file, fix
  jargon-coining phrasing per the plain-speech clause. Not a general copy-edit —
  untouched-term prose stays put.
- **Craft rule**: the craft baseline gains one distilled line — identifiers follow
  the naming standard (dictionary rules section); no coined proper nouns.
- **Memory refs are out of repo and out of scope** — stale terms there are the
  operator's problem, noted at the boundary.

## Plan note (the knife is Plan's, but the tension is known)

Cross-cutting terms make file-disjoint task footprints hard: one term touches
docs, skills, src, and test at once. Fewer, larger tasks split **by family or by
term-set** (all sites of one term-set in one task) beat many per-directory tasks
that would each half-rename a term. Compose-and-prove covers the overlap that
remains.

## Validator brief

On the merged tree: for each `rename → X` row, old name greps to zero outside the
historical set (run it; don't trust the report); historical set byte-identical
(`git diff --stat` against the base for those paths is empty); aliases present for
renamed dictionary terms; `npm test` and `npm run check` green; probe the loop from
outside — `orient` reads the swept graph, `launch --scope` (dry against a ready
feature or the fixture repo) assembles a valid snapshot naming the new vocabulary.
