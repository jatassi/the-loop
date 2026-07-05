# naming-map — the human-approved rename map

**Status:** designed. First application of the naming standard (ADR-0044; canonical
text in the dictionary's rules section). Produces the map that `rename-sweep`
executes mechanically — all naming judgment is spent here, none there.

## What this is

A complete inventory of every name below the brand tier in this repo, each with a
blind-generated replacement candidate (or a keep), resolved by explicit human
verdict, committed at `docs/design/naming-map.md`. The standard's bar: an engineer
who has never seen the-loop, shown a name plus only its grammatical role, correctly
infers what the named thing is for. `the-loop` itself is brand-tier exempt.

## Method

1. **Enumerate** every name from a recorded tip (commit sha in the map header):
   dictionary terms, CLI verbs and their flags, skill/agent/command/workflow names,
   artifact and doc filenames plus path conventions, graph feature ids, statuses,
   lanes, tiers, branch and commit-subject shapes, `src/`/`bin/`/`test/` module
   filenames, and exported identifiers carrying a taxonomy term. Local identifiers
   naming no taxonomy concept are out of scope.
2. **Group into the eight families** (adjust seams if enumeration reveals better
   ones, and say so in the map): lifecycle phases & their surfaces; engine & run
   vocabulary; artifacts & paths; CLI verbs; statuses & conventions; roles/models/
   executors; context-architecture terms; code modules.
3. **Write a jargon-free purpose line per name.** One sentence, plain SDLC English,
   no current the-loop coinage — these lines feed generation, so jargon here
   re-anchors the whole exercise. They double as review documentation.
4. **Generate blind.** Fresh-context agents receive a family's purpose lines,
   grammatical roles, and sibling candidates — **never any current name** — and
   propose names as a coherent family set (consistent verb forms, shared artifact
   patterns). Clean slate: current names are re-derived, not grandfathered; a
   current name may win only by being independently re-proposed or by the human's
   verdict.
5. **Draft the map** (shape below) with runner-up candidates preserved per row.
6. **Gate.** The human resolves every row. Expected mechanics under
   kick-off-and-check-back: the build leg commits the draft map on the feature
   branch and returns a feature-shaped `blocked` ("map drafted, awaiting
   verdicts"); the human gives verdicts at the run boundary (bulk approval with
   named exceptions is the expected shape); the re-run records them and flips the
   map header to `approved`.

## Map shape (`docs/design/naming-map.md`)

```markdown
# the-loop — rename map
enumerated_at: <commit sha>
status: draft | approved        # approved is the human's flip, never the agent's

## <family>
| current | role | purpose (jargon-free) | proposed | runner-ups | verdict |
|---|---|---|---|---|---|
| spine | a CLI's informal name | the one CLI over the loop's artifacts | the-loop CLI | — | rename → the-loop CLI |
```

(The `spine` row is illustrative only — that rename already landed in the taming
reset; it is *not* a candidate constraint on this pass.)

## Constraints

- This feature touches only `docs/design/naming-map.md` — no renames execute here.
- The map's own vocabulary obeys the plain-speech clause; purpose lines contain no
  current coinage.
- `naming-map` and `rename-sweep` ids are born standard-compliant and appear in the
  map as `keep` rows — the sweep must not rename its own in-flight subtree.
- Old→new pairs feed two downstream consumers verbatim: the sweep's rename list and
  the dictionary's `(historical)` aliases. A row the human renames must name the
  replacement exactly — "something clearer" is not a verdict.

## Validator brief

Fresh eyes check: every enumerated name from the recorded tip appears in exactly
one row (spot-check the tip for missed surfaces); every row has a verdict; header
says `approved`; then the blind-inference check — shown each approved name plus its
grammatical role (never the purpose line first), a no-context agent states a
purpose the validator judges correct. A miss is an ordinary deviation for the human
at the boundary, not an auto-fail.
