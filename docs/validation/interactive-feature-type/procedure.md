# Validation runbook — interactive-feature-type

Judge pass against `main...HEAD` on the assembled `integrate--interactive-feature-type`
worktree. The footprint is one optional feature-record field (`execution`) threaded
through parse/emit, validation, the eligible-set/proposal/render trio, and the
execution-context scope gate; plus four prose surfaces amended
(`design`, `diagnose`, `begin`, `execute`, `using-the-loop`) and one new
(`plugin/skills/interactive-execution/SKILL.md`).

Two of the nine criteria are prose-shaped (7 and 8), so both are exercised by a
**cold read** — a headless agent handed only the shipped files, with no access to
this repo — not by reading the diff. The six behavioural criteria are exercised
against the **real binary** on a throwaway fixture repo, never via in-process imports.

## Bring-up

```bash
# from the integration worktree root
cargo build --manifest-path cli/Cargo.toml --release   # → target/release/the-loop (0.7.0)
node bin/create-sample-repo.js                          # → configured fixture repo, prints its path
```

Fixture used: `/var/folders/.../loop-probe-goRzJX` — 3 features (`greet-core`
validated, `greet-cli` designed depending on it, `greet-farewell` proposed).
The **installed** `the-loop` on PATH is 0.5.1 and predates this field; every probe
below runs the freshly built `target/release/the-loop` explicitly.

## Exercise

### 1 · Integrity gates and suites

```bash
git diff main --stat                       # 18 files, +1213/-24; no source or test deletions
git diff main -- eslint.config.js package.json Cargo.toml   # empty — no lint-config edit
git diff main | grep -E '^\+.*(eslint-disable|allow\(clippy|#\[ignore\]|test\.skip)'
npm test                                   # node suite
cargo test --manifest-path cli/Cargo.toml  # Rust suite
npm run lint                               # eslint
cargo clippy --manifest-path cli/Cargo.toml --all-targets
cargo fmt --manifest-path cli/Cargo.toml --check
./target/release/the-loop check            # this repo's own graph
```

Expected: node **235 pass / 0 fail**; Rust **258 lib + 6 process pass / 0 fail**;
eslint, clippy, and rustfmt silent; `the-loop check` → `OK 49 features — 0 error(s)`.
The only `eslint-disable` substring in the diff is a *negative* assertion inside
`test/interactive-execution-skill.test.js` (the new skill must not restate the
validate protocol) — not a suppression. No test deleted or weakened; the 24
deleted lines are doc comments and the `check_scope` signature line.

### 2 · The tests bite (mutation probe)

Seven mutations applied one at a time and reverted, each expected to break a
*specific* new test rather than a pre-existing one:

| mutation | expected casualty |
|---|---|
| `begin/SKILL.md` route no longer names `interactive-execution` | `interactive-execution-skill.test.js` "/begin routes advance-interactive…" |
| `design/SKILL.md` "Ask even when you flag nothing" → conditional | `execution-mode-question.test.js` "once per promotion batch, flagged or not" |
| `eligible_set_ids` loses `!is_interactive(f)` | 4 `status::tests` (split, orientation, both propose cases) |
| `parse_execution` returns `Ok("autonomous")` for a non-string | `execution_true_and_null_return_named_malformed_error_never_silently_dropped` |
| `check_scope` door condition `!=` → `&&` | 3 `context::tests` (both refusals + both-modes-pass) |
| human render drops the `**Interactive ready:**` line | `render_summary_distinguishes_interactive_row_…` |
| `bad-execution` branch made unreachable | `bad_execution_rejects_values_outside_the_enum` + `check_bad_execution_exits_one_…` |

Each mutation produced exactly its listed casualty and nothing else.

### 3 · Behaviour, against the fixture (criteria 1–6)

All steps run with `cwd` = the fixture repo, `TL=<worktree>/target/release/the-loop`.

**Criterion 1 — round-trip.**
```bash
cp docs/feature-graph.json /tmp/base.json
"$TL" set-status greet-cli designed && diff /tmp/base.json docs/feature-graph.json
```
Expected: no diff — an unmarked graph re-emits byte-identically, no key and no null.
Then insert `"execution": "interactive"` on `greet-cli` immediately after `"status"`:
`"$TL" check` → exit 0; `set-status` round-trip → byte-identical, key kept in place.
Move the key *after* `depends_on` → `check` exits 1 with
`ERROR round-trip: emit(parse(text)) != text`, pinning canonical order.
Replace the value with `true` → exit 1,
`ERROR malformed-json: malformed JSON: execution must be a string (got true)` —
a named parse error, never a silent drop.

**Criterion 2 — enum.** Set `"execution": "sometimes"`; `"$TL" check` → exit 1,
`ERROR bad-execution: execution must be one of autonomous|interactive (got "sometimes") (greet-cli)`
— the offending feature and both legal values.

**Criterion 3 — the split.** Add `greet-loud` (designed, no deps, unmarked) beside
the interactive `greet-cli`; `"$TL" status --json` →
`eligibleSet == ["greet-loud"]`, `interactiveReady == ["greet-cli"]`,
proposal `advance-eligible-set ["greet-loud"]` (the eligible set still wins).

**Criterion 4 — the false-repair trap.** Remove `greet-loud`, leaving the interactive
feature as the only dependency-ready designed work; `"$TL" status --json` → proposal
`{"kind":"advance-interactive","features":["greet-cli"],"summary":"1 interactive feature(s) are dependency-ready — attend a session"}`.
Never `blocked`, and the summary makes no repair claim.

**Criterion 5 — the two doors.**
```bash
"$TL" prepare-execution-context --features greet-cli --target-branch main --script-out /tmp/s.js
```
Expected: exit 1, **empty stdout**, `/tmp/s.js` absent, stderr
`error wrong-execution-door: "greet-cli" is execution: "interactive" — run it through the interactive-execution skill, not the ordinary execute door (greet-cli)`.
Re-run with `--interactive` → exit 0, execution context printed (131 lines).
Symmetrically, `--features greet-loud … --interactive` → exit 1, empty stdout, no
file, stderr `… is not execution: "interactive" — run it through the ordinary execute door, not --interactive`;
`greet-loud` through the ordinary door → exit 0.

**Criterion 6 — the human render.** `"$TL" status` prints
`**Next:** nothing dependency-ready.`, then a separate `**Interactive ready:** \`greet-cli\``
heading, and the table row `| greet-cli | designed (interactive) | CLI entry point |`
beside plain `| greet-core | validated | … |`.

### 4 · Cold read of the prose surfaces (criteria 7–8)

Copy the shipped files into an empty scratch directory — no repo, no ADRs, no design
docs — and put a fresh agent in front of them:

```bash
mkdir cold && cp plugin/skills/{design,diagnose}/SKILL.md cold/
cd cold && claude -p --model sonnet --permission-mode plan --allowedTools Read < prompt.txt
```

Ask: may you decide `execution` yourself, or must you ask? How many questions for a
20-feature batch? Must you ask when nothing is flagged (each file)? Name the criteria.
Quote the one-line test. What are the two values and what does absent mean?

Expected answers, all quoted back from the files: **must ask** ("the human's answer,
never yours to infer", both files); **once** ("twenty questions is a worse artifact
than one"); **yes** in design ("Ask even when you flag nothing") and **yes** in
diagnose ("Ask anyway, every time, even when you flag nothing"); all six criteria
present verbatim in both; the one-line test identical in both; `autonomous | interactive`
with "Absent means `autonomous`".

Repeat for `plugin/skills/{interactive-execution,begin}/SKILL.md`. Expected: the
`advance-interactive` proposal routes to "the `interactive-execution` skill" by name;
a bare invocation reads `interactiveReady` and, when empty, "say so and stop here";
the two quoted commands are `the-loop prepare-execution-context --features <id>
--target-branch <ref> --interactive` and `the-loop worktree-create loop/<id>
--base-branch <target>`; the hand-off spawns "the ordinary `validate` agent" against
`loop/<id>` and explicitly does **not** restate its merge/land protocol, passing only
the field list. Frontmatter carries `name: interactive-execution` and
`allowed-tools: Bash(the-loop *), Bash(git *), Read, Write, Edit, Agent`.

### 5 · Landing hygiene (criterion 9)

```bash
grep -c '"execution"' docs/feature-graph.json          # → 0
git diff main --stat -- docs/feature-graph.json        # → empty
git diff main -- plugin/ | grep -E '^\+' | grep -E 'ADR-[0-9]|docs/(adr|designs|plans)|design-decisions|CLAUDE\.md'
```

Expected: no `execution` key on any record (the marker waits for the upgraded binary,
because an older `set-status` re-emits the graph and drops unknown keys), and no added
plugin line citing a bare ADR number or a path into this repo's own design docs. The
diff in fact *removes* one (`ADR-0037` from `design/SKILL.md`). `begin/SKILL.md`'s
pre-existing `docs/adapters/features.md` reference names the **consuming** project's
own loop-owned artifact and is untouched by this diff.

## Teardown

```bash
rm -rf /var/folders/.../loop-probe-goRzJX   # the printed fixture path
rm -rf cold cold2 /tmp/base.json /tmp/s.js
```
