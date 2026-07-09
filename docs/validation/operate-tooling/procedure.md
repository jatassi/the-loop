# operate-tooling — validation procedure

Fixture-repo binding (this repo's own binding): the CLI exercised from the outside,
as a user would — never in-process imports. Drive-variant validation (ADR-0047): the
mechanical assembly/gating below is this agent's own; the criterion judgment was
delegated to a CLI executor (`grok`, model `grok-4.5`) running judge-only (Read/Bash,
no writes) inside the assembled integration worktree, then gated mechanically.

## Bring-up

- Created the integration worktree at
  `.claude/worktrees/integrate--operate-tooling` fresh off `main` (a stale worktree
  of the same name from a superseded branch set was found first — deleted and
  recreated clean).
- Merged, in order, and test-gated after each: `loop/operate-tooling`,
  `loop/operate-tooling--operate-skill`, `loop/operate-tooling--runbook-genre-rename`,
  `loop/operate-tooling--ops-toolkit-interview`, `loop/operate-tooling--repo-ops-toolkit-section`.
  Every merge was a clean `ort` merge — no textual conflicts, so the test-gated merge
  policy never had to arbitrate a semantic one. `npm test` went from 257 (base) →
  261 → 265 → 268 → 269, green at every step.
- `git rm docs/plans/operate-tooling/plan.md` (plans never land on target) and
  committed.
- Baseline `node bin/create-sample-repo.js` fixture repo: default seeded
  `docs/architecture.md` carries no `## Operations toolkit` section — the starting
  state criterion 4's "absent section" case describes.

## Exercise

1. **Judge delegation.** Wrote a judge-only prompt (criteria verbatim, the diff
   scope, `agents/validate.md` §2's judging rules verbatim including the integrity
   gates, an explicit "do not alter this worktree" constraint, and a note on why
   `docs/validation/*/procedure.md` prose legitimately still reads "runbook"
   content-identically) and ran `grok -m grok-4.5 --prompt-file … --cwd
   .claude/worktrees/integrate--operate-tooling --always-approve --no-subagents
   --output-format plain`. It returned `{"result":"validated", …}` with per-criterion
   evidence (interview questions present, section template present, operate skill's
   routing/preamble/boundary/lazy-retrofit prose present, this repo's own
   `## Operations toolkit` present, no vendor names, rename swept, glossary
   redefined).
2. **Tree-unaltered gate.** `git rev-parse HEAD` and `git status --porcelain` before
   and after the executor run were identical (`e70e3d0e…`, clean) — the executor
   made no edits, confirming its verdict rests on a tree I can still trust.
3. **Re-ran the full suite and lint myself**, independent of the executor's word:
   `npm test` → 269/269 pass, 0 fail. `npm run check` → `node plugin/bin/the-loop.js
   check` (`OK 32 features — 0 error(s), 0 warning(s)`) then `eslint .` clean.
4. **Independent integrity spot-checks**, not taking the executor's summary on
   faith: `git diff main | grep -n eslint-disable` — no matches. `git diff main
   --diff-filter=D --stat` — no files deleted. `git diff main -- test/ | grep -n
   'test\.only\|test\.skip'` — no matches. No lint-config file touched in the diff.
5. **Independent factual spot-checks of the rename** (criterion 7): `docs/runbooks/`
   does not exist in the merged tree (`ls` → "No such file or directory"). `ls
   docs/validation | wc -l` → 14, matching the design doc's "14 exist as of
   2026-07-09" figure and the landed `test/runbook-genre-rename.test.js`'s dynamic
   re-list/re-grep (both assertions pass inside the 269-green suite). Manually
   grepped the whole tree (outside `docs/adr/`, `docs/research/`, `docs/briefs/`,
   `docs/releases/`, `docs/bugs/`, `eval/`) for validation-sense "runbook" survivors:
   every remaining hit was either (a) an operational-sense "runbook" (Release
   runbook, `docs/runbooks/<topic>.md` pointer, `runbooks` artifactStores family
   key), (b) inside `docs/validation/*/procedure.md` (a content-identical historical
   move, correctly out of scope — verified those files' prose is unchanged from
   their pre-move originals), or (c) the two explicitly-exempted self-describing
   design docs (`docs/designs/operate-tooling/design.md`,
   `docs/designs/rename-sweep/design.md`).
6. **Glossary spot-check** (criterion 8): `docs/glossary.md`'s `### runbook` entry
   now reads as the operational genre with a "*Not to be confused with:*
   `validation procedure`" cross-link; `### validation procedure` carries
   `**aliases:** runbook (validation sense) (historical), probe pack (historical)`
   — the pre-sweep `runbook` entry's own `probe pack (historical)` alias, inherited.
7. **Section-format spot-check** (criteria 1 and 5): read
   `docs/architecture.md`'s `## Operations toolkit` directly — deployment targets,
   three `read`/`mutate`-tagged capabilities, an observability line ("the human
   notices", with the apprisal-path-names-the-runbook rule stated), a runbooks
   pointer, and a never-do list, sibling to and ordered after `## Validation
   procedure` and `## Release runbook`.

## Expected observations

- Every merge in the listed order composes cleanly with the suite staying green
  throughout — no semantic conflict to arbitrate.
- The executor's `validated` verdict survives independent re-verification: same
  HEAD/clean status before and after, `npm test` and `npm run check` green under
  my own run (not just its say-so), and the integrity gates (no suppression, no
  deleted/weakened tests) clear under my own greps.
- `docs/runbooks/` is fully retired; every prior validation-sense record lives at
  `docs/validation/<id>/procedure.md`, content-identical; the two dynamic
  regression-test assertions in `test/runbook-genre-rename.test.js` pass as part
  of the 269-green suite.
- The glossary and the recorded-binding template match the design doc's skeleton
  exactly.

## Teardown

- `rm -rf` on every `node bin/create-sample-repo.js` fixture directory created
  during this session (under the OS temp dir, never inside this worktree).
- No tracked file in the integration worktree was modified by the executor or by
  any exercise step above except this procedure file and the graph status flip,
  both written by this (drive) agent as part of landing, never by the executor.
