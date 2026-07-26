# Validation runbook — write-skills-doctrine

Judge pass against `main...HEAD` on the assembled `integrate--write-skills-doctrine`
worktree. The footprint is prose plus its executable acceptance: the frontmatter
description, one new body section, and one new failure mode in
`plugin/skills/write-skills/SKILL.md`, with `test/write-skills-doctrine.test.js`
asserting on the shipped text. Because the load-bearing behaviour of a
description is *triggering*, the description is exercised live with blind
headless probes, not only read.

## Bring-up

```bash
# From the integration worktree root
cargo build --release                   # target/release/the-loop — the suite spawns it
npm install                             # (already provisioned by worktree-create)
node bin/create-sample-repo.js          # → configured fixture, prints its path
```

## Exercise

### 1 · Integrity gates and suite

```bash
git diff main --stat                    # read-only: exactly 2 files
git diff main -- eslint.config.js package.json    # expect empty
grep -rn "eslint-disable" test/write-skills-doctrine.test.js plugin/skills/write-skills/
npm test                                # node suite
cargo test --release                    # Rust CLI suite
npm run lint
./target/release/the-loop check
```

### 2 · The tests bite (mutation probe)

Five mutations applied to `plugin/skills/write-skills/SKILL.md` one at a time,
each reverted with `git checkout --` afterwards, running
`node --test test/write-skills-doctrine.test.js` between:

| mutation | expected casualty |
|---|---|
| strip agent-definition wording from the description | criterion-1 test |
| move `## Agent definitions` to the end of the file | criterion-2 test |
| delete the `**Negation**` bullet | criterion-3 test |
| insert `See ADR-0035.` into the body | criterion-4 test |
| rename `## Pruning` to `## Prune` | criterion-5 test |

### 3 · Live trigger probe (criterion 1)

A blind index-only probe: build a skill index from the frontmatter
`name`/`description` of every `plugin/skills/*/SKILL.md` (no bodies), hand a
fresh headless agent a task about an `agents/` file, and ask which skills it
would load. Run the same probe with the pre-merge description substituted in as a
counterfactual.

```bash
claude -p --model sonnet --strict-mcp-config < probe.txt
```

Task framings used, three runs each per description variant:

- (a) "I'm about to create a new subagent definition file at `agents/reviewer.md`
  — frontmatter with a name/description/tools list, then the body…"
- (b) less leading, edit-shaped, never saying "agent definition": "Open
  `agents/reviewer.md` and tighten it: the frontmatter `tools:` line is missing
  Bash even though the steps run tests, and the body rambles."
- (c) framing (b) under a suppressive nudge ("most edits need none").

### 4 · Self-containment sweep (criterion 4)

```bash
grep -nEi "ADR|docs/|the-loop|feature-graph|\.\./" plugin/skills/write-skills/*.md
ls plugin/skills/write-skills/          # SKILL.md + GLOSSARY.md
```

Plus every non-http markdown link target in `SKILL.md` resolved on disk.

### 5 · Fixture still healthy (repo binding)

```bash
cd "$FIXTURE" && the-loop status --json && the-loop check
```

## Expected observations

- **Diff**: 2 files — `plugin/skills/write-skills/SKILL.md` (+24/-1) and
  `test/write-skills-doctrine.test.js` (new, 197 lines). No lint-config or
  `package.json` change, no `eslint-disable` anywhere, no pre-existing test
  touched. `docs/plans/write-skills-doctrine/` never landed on the branch.
- **Suite**: node 213/213 pass, 0 fail. `cargo test --release` 3/3 pass. `npm run
  lint` clean, exit 0. `the-loop check` → `OK 52 features — 0 error(s)`.
- **Mutation probe**: each of the five mutations turns exactly its own test red
  (4 pass / 1 fail every time) — the assertions bite the shipped text rather than
  passing vacuously.
- **Trigger probe**: framing (a) → `write-skills` loaded 2/2 with the landed
  description. Framing (b) → `write-skills` loaded 3/3, rationales explicitly
  citing agent definitions and `agents/` files. Framing (c), the suppressive
  nudge → 0/2 with the landed description *and* 0/2 with the pre-merge one, so
  that framing measures the nudge, not the description. The counterfactual does
  not discriminate: the pre-merge description also fires in (a) and (b) because
  the model generalises "agent skills" to agent files on its own. The criterion
  asks that the landed description trigger, and it does, reliably, in every
  non-suppressed framing.
- **Self-containment**: the grep returns nothing — no ADR number, no `docs/…`
  path, no reference to the authoring repo. The pack ships two files; the only
  markdown link in `SKILL.md` is `[`GLOSSARY.md`](GLOSSARY.md)`, which exists.
  The one external world the new section names is `agents/`, which exists in a
  consuming project.
- **Placement**: `## Agent definitions` sits between `## Writing the body` and
  `## Information hierarchy` — with the description/body guidance it modifies,
  and not the trailing section (10 sections follow it).
- **Preserved for the later trim**: `## Pruning` and `## Failure modes` keep
  their names and order, Pruning keeps all three of its rules, and all nine
  pre-existing failure modes survive verbatim — `**Negation**` is appended to the
  list, nothing is cut.
- **Fixture**: `status --json` → `mode: "configured"`; `check` → `OK 3 features`.

### Acceptance criteria (judge summary)

1. **Met** — description reads "Create or revise agent skills and agent
   definitions…" and carries the branch "writing or editing an agent definition
   under `agents/`". Live probe: loaded 5/5 across two non-suppressed framings.
2. **Met** — `## Agent definitions`, 17 lines, three bolded deltas: the
   description is a **delegation trigger** (decides whether the worker is
   spawned), the **`tools:` list is part of the interface** (a withheld
   capability the body assumes is an undiagnosable defect), the **body is a
   system prompt read cold** (stateless worker, no conversation history, no
   follow-up question). Placed inside the existing structure, not appended.
3. **Met** — `**Negation**` in Failure modes: prohibition names the elephant
   ("do not write placeholder tests" puts placeholder tests in front of the
   agent), prompt the positive, keep a prohibition only as a hard guardrail that
   cannot be phrased positively, paired with what to do instead.
4. **Met** — no ADR number, no path into the authoring repo's docs, GLOSSARY.md
   link resolves, pack self-contained on plugin + binary alone.
5. **Met** — Pruning and Failure modes in place, unrenamed, contents intact.

### Noted, not a defect

`GLOSSARY.md` gains no `### Negation` entry, while all nine pre-existing failure
modes have one. The `SKILL.md` bullet is self-sufficient, the companion link
resolves, and the design ruled the glossary unaffected — so this is not a
criterion miss. Worth folding in when the later authoring pass next edits Failure
modes.

## Teardown

```bash
rm -rf "$FIXTURE"          # the path create-sample-repo.js printed
git checkout -- plugin/skills/write-skills/SKILL.md   # after each mutation probe
```

Leave no probe repo and no mutated skill text on disk.
