# naming-map — probe record

Fixture-repo probe (this repo's own binding): the CLI exercised from the outside,
as a user would, never in-process. This feature's own observable surface is a
document's content plus a blind-generation/blind-inference process — not CLI
behavior — so the exercise below is weighted toward that, with a light CLI
bring-up/teardown to confirm the fixture-repo binding itself still holds for this
tree.

## Bring-up

```
node bin/probe-fixture.js
```
Printed a temp git repo path (`/var/folders/.../loop-probe-BkDW54`) seeded as a
populated v2 target repo.

## Exercise

1. **CLI sanity** — `node <plugin-root>/bin/the-loop.js orient` against the
   fixture: `mode: "active"`, `frontier: ["greet-cli"]`, as expected — confirms the
   binding still holds; this feature makes no code changes, so no other CLI
   behavior is in scope.

2. **Criterion 1 (enumeration + families) and criterion 3 (verdict completeness)**
   — read `docs/design/naming-map.md` in full at the branch head (b564196).
   Structural check: `status: approved`; 128 data rows across nine `## ` families
   (eight from the method plus `## Feature identifiers`, explicitly recorded as a
   seam adjustment). Mechanical check (script-parsed, escaped-pipe-aware): every
   row's verdict column is non-empty and starts `keep` or `rename →` — no
   `pending`/blank/vague cells anywhere in the file. Cross-referenced enumeration
   coverage by hand against live repo surfaces: `node bin/the-loop.js --help`
   (all CLI verbs/flags present as rows), `docs/dictionary/DICTIONARY.md` (all 21
   non-brand terms present as rows), `docs/design/graph.md`'s 25 feature ids
   (all present, matching exactly against the Feature identifiers family plus the
   two constrained-keep ids in Artifacts & paths), and `src/`/`bin/`/`workflows/`
   module filenames (all present under Code modules). No gaps found.

3. **Criterion 2 (blind generation)** — spot-checked process integrity: scanned
   for rows where `proposed == current` under a `keep` verdict not annotated
   "re-proposed blind" (none found — every such row is honestly flagged) and
   independently exercised the same blind method (see step 4) to confirm a
   truly no-context `claude -p` invocation, shown only a name and its
   grammatical role with no repo access, produces an uncontaminated, on-topic
   inference rather than a giveaway.

4. **Delta check** — `git diff df4c10f..HEAD -- docs/design/naming-map.md`
   (df4c10f = the prior validation leg's verified tip; HEAD = b564196 merged
   in) is exactly one row, one cell: the Runtime probe row's verdict, changed
   from `system runbook` to `validation runbook` with the adjudication reasoning
   inline. Everything else byte-identical to the previously-verified tree.

5. **Criterion 4 (blind-inference check), scoped to the one new name per the
   feature's own Validator brief** — ran three independent fresh, no-context
   `claude -p` invocations (isolated scratch cwd, no CLAUDE.md, no prior
   conversation, no repo access) with only:
   `Name: "validation runbook". Role: a recorded-procedure name (an
   architecture-doc section). State what you infer this named thing's purpose
   is.`
   All 3/3 independently converged on: a recorded, repeatable step-by-step
   procedure for verifying a system/build/change actually works — what checks to
   run, what to expect, what counts as pass/fail — so verification is consistent
   and executable by anyone (or any agent) rather than ad hoc. This matches the
   row's purpose line (starting the built system, exercising it against
   acceptance criteria, shutting it down, consumed when independently checking
   finished work) and none of the three responses mischaracterized it as an
   ops/incident runbook — the collision that sank the prior candidate ("system
   runbook") is gone. Judged: pass.

## Expected observations

- Fixture `orient` returns the seeded baseline unchanged (no code touched).
- `docs/design/naming-map.md` has zero unresolved/blank verdicts and complete
  family coverage against the live repo's actual name surface.
- The tracked delta since the last verified tip is exactly the one adjudicated
  cell described in the feature's own account.
- 3/3 fresh no-context agents state a purpose for "validation runbook" matching
  its row and clear of the prior collision.

## Teardown

```
rm -rf /var/folders/.../loop-probe-BkDW54
```
Confirmed removed (`ls` of the parent temp dir shows no `loop-probe-*` entry
remaining).
