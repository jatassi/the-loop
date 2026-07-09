# begin-front-door-rename — runbook record

Fixture-repo runbook (this repo's own binding): the CLI exercised from the outside,
as a user would, never in-process. Four of the five criteria are file-shape and
test-suite checks read directly off the landed tree; the fifth (a live session
against the installed plugin) rests on the operator's authenticated evidence
already recorded in the feature's design doc, corroborated here against this
tree's own `status --json` output.

## Bring-up

```
node bin/create-sample-repo.js
```
Printed a temp git repo path (a `loop-probe-*` directory under the OS temp root)
seeded as a populated v2 target repository, used for background confidence on the
CLI surface; the file-shape and ADR criteria were checked directly against this
integration worktree.

## Exercise

1. **Criterion 1 — front door file shape.**
   ```
   git show main:plugin/commands/the-loop.md > /tmp/old-front-door.md
   diff <(sed 's#/the-loop#/begin#g' /tmp/old-front-door.md) plugin/skills/begin/SKILL.md
   ```
   Confirmed `plugin/skills/begin/SKILL.md` frontmatter carries `name: begin`, the
   session-opener description, `argument-hint: "[phase]"`, the retired
   `allowed-tools` line unchanged, and no `disable-model-invocation` key. Body is
   content-identical to the retired `plugin/commands/the-loop.md` apart from the
   `/the-loop` → `/begin` name sweep; the orientation preamble stays the
   start-of-line inline `` !`node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js" status
   --json 2>&1` `` form.
   ```
   ls plugin/commands
   ```
   `No such file or directory` — the directory no longer exists.

2. **Criterion 2 — slash-form sweep.**
   ```
   rg "/the-loop\b" plugin/ test/ docs/architecture.md docs/glossary.md \
     docs/feature-graph.md docs/designs/
   ```
   Every remaining hit is either a `bin/the-loop.js` path reference (the CLI
   binary name, untouched by design) or lives inside the begin-front-door-rename
   feature's own record (`docs/feature-graph.md`'s begin-front-door-rename entry
   and `docs/designs/begin-front-door-rename/design.md`) — both self-referentially
   describing the rename itself, the same accepted pattern as proposed-status's
   un-scrubbed "the old three-value status statement greps to zero…" acceptance
   line (confirmed still present and still passing its own grep-zero test). No
   other living surface in the named list carries live slash-form `/the-loop`.

3. **Criterion 3 — suite green, tests repointed.**
   ```
   npm test
   npm run check
   ```
   170/170 tests pass; `check` reports `OK 32 features — 0 error(s), 0 warning(s)`
   and `eslint .` is clean. `test/skills-and-command-sweep.test.js` and
   `test/proposed-status.test.js` — the two tests the design doc names as reading
   `plugin/commands/the-loop.md` — now `read('plugin/skills/begin/SKILL.md')` and
   still assert substantive content (route table, `status --json`, `--script-out`
   wiring), not just file existence.

4. **Criterion 4 — ADR-0002 amendment only.**
   ```
   git diff main -- docs/adr/0002-form-factor-plugin-and-entry-surface.md
   ```
   The pre-amendment body is byte-identical to `main`; the only change is one
   appended `**Amended 2026-07-08 (begin-front-door-rename).**` paragraph recording
   the `/begin` rename and the dissolved command-vs-skill constraint.

5. **Criterion 5 — live session against the installed plugin.**
   Relied on `docs/designs/begin-front-door-rename/design.md`'s "Validation notes"
   section, which records the operator's 2026-07-09 authenticated run (`claude -p
   --plugin-dir ./plugin` on a worktree checkout at commit `b68068f`): `/begin`
   rendered on injected machine truth (design_version 23, 23/32 shipped, the exact
   5-feature eligible set) and `/the-loop` returned `Unknown command: /the-loop`.
   Corroborated the specificity of that evidence by running
   ```
   node plugin/bin/the-loop.js status --json
   ```
   on this landed tree, which reports the same `design_version: 23`, the same
   23/32 shipped count, and the same 5-feature eligible set the recorded evidence
   names — details only derivable from actually executing the preamble, not
   guessable from the diff. The installed-plugin re-check rides the next release
   health check per the design doc's own note.

## Expected observations

- `plugin/skills/begin/SKILL.md` frontmatter and body match the retired command
  apart from the name sweep; `plugin/commands/` is gone.
- No live slash-form `/the-loop` remains on a named living surface outside the
  feature's own self-referential record.
- `npm test` (170/170) and `npm run check` (32 features, eslint clean) both pass;
  the two repointed tests exercise substance, not just presence.
- ADR-0002 is byte-identical apart from the one appended amendment paragraph.
- The recorded live-session evidence names specifics that match this tree's own
  `status --json` output.

## Teardown

```
rm -rf <loop-probe-* fixture path from bring-up>
```
Confirmed removed — no worktree files were modified during judging.
