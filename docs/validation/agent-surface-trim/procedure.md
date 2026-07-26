# Validation runbook — agent-surface-trim

Written at release time (v0.8.1), not at validate time. This feature ran as a
**human-attended session** and the human waived the independent validate leg, because
the adjudication was done together in-session (`ccda1b2`). This procedure therefore
records what a replay can and cannot re-establish, and is explicit about the one
criterion that is not discharged.

The footprint is prose-only: 5 agent definitions, 18 `.md` files under
`plugin/skills/`, `CLAUDE.md`, and `cli/assets/execution-pipeline.js`'s assembled
prompt strings. **No `cli/` source changed** — `git diff v0.8.0..main -- cli/ .github/`
is empty — so no behavioural probe against the binary applies. What replaces it is a
mix of mechanical greps (AC3, AC2's reachability half) and reading (AC2's
single-appearance half, AC4).

## Criterion-by-criterion

### AC1 · Every in-scope file read, every candidate ruled — **attested, partly verifiable**

The inventory is verifiable; the reading is not. A file ruled **keep** leaves no trace
in the diff, so "no file skipped" cannot be reconstructed after the fact from the tree.
It rests on the attended session's attestation.

What replay *does* confirm is that the inventory the criterion names is the real one:

```bash
ls plugin/agents/*.md | wc -l              # → 5
find plugin/skills -name '*.md' | wc -l    # → 18
```

Both match the criterion's stated counts exactly. (`plugin/shared/bound-stores.md` and
`plugin/shared/execution-mode.md` bring the total to 20; they are dependency-added
shared references, outside the criterion's "18 skill files".)

### AC2 · Each instruction appears once per surface; code-quality pack reachable — **PASS**

The reachability half is mechanical and green — all five agent definitions carry the
`Skill` tool in frontmatter, which is what makes the code-quality pack invocable at all:

```bash
for f in plugin/agents/*.md; do
  printf '%-28s ' "$(basename "$f")"
  grep -m1 '^tools:' "$f" | grep -q Skill && echo 'Skill ✓' || echo 'Skill ✗'
done
```

Expected: `build.md`, `drive.md`, `plan.md`, `record.md`, `validate.md` — all `Skill ✓`.

The criterion's *observation* clause — a spawned build-shaped agent seen invoking the
pack from a target-project worktree before inline duplicates were removed — is a
session event. Replay cannot re-observe it; the frontmatter check above is the durable
residue that keeps it true going forward.

The single-appearance half is judgment, not grep: the ruling recorded that where an
instruction survives on two shipped surfaces, both readers need it and neither can
reach the other. That doctrine is itself now written down in
`plugin/skills/write-skills/SKILL.md` under **Pruning** ("Single source of truth is
bounded by reachability"), which is the durable form of the ruling.

### AC3 · No bare decision-record citations under shipped surfaces — **PASS, guarded**

```bash
grep -rE 'ADR-[0-9]{4}' plugin/agents/ plugin/skills/    # → no output, exit 1
```

Green. All seven pre-seeded citations (`drive.md` ×3, `record.md`, `validate.md`,
`design/SKILL.md`, `release/SKILL.md`) are gone. This closes the "known issue, not
blocking" carried forward in the v0.8.0 release report.

The criterion is now **guarded against regression** by
`test/shipped-surface-self-containment.test.js`, which asserts the policy in three
directions rather than pinning prose:

- no shipped surface cites an `ADR-\d{4}`;
- no shipped surface points at another agent definition or this repo's own
  `docs/adr/` / `docs/plans/the-loop` records;
- a consuming project's own `docs/` paths **survive** — `design/SKILL.md` must still
  name `docs/architecture.md` and offer `docs/adr/`, and `using-the-loop` must still
  name `docs/feature-graph.json`.

That third test is the one that matters most: it is what keeps a future sweep from
"fixing" the criterion by deleting the paths that legitimately point at the consuming
project rather than at this repo.

### AC4 · write-skills carries the session's judgment as principles — **PASS**

Read `plugin/skills/write-skills/SKILL.md`. The fold-in must appear in **Pruning**
(§178) and **Failure modes** (§207) as reusable principle, not a per-file changelog of
this session. Confirmed present:

- *Pruning* — "Single source of truth is bounded by reachability": within one file it
  binds at full force; across files only where a shared home is one the reader will
  actually reach. Plus the two-question test (does each reader need this to act, can
  either reach the other?), the note that a skill cannot include another skill, and
  "split by branch, not by line count".
- *Failure modes* — "**Phantom authority**": citing a document the reader cannot open,
  which "reads as rigour and resolves to nothing" and degrades the instruction to a
  no-op. This is the generalized form of AC3's concrete ADR sweep.

Neither passage names this session, the trimmed files, or the feature. That is the
criterion's actual bar and it is met.

### AC5 · begin-version-handshake through the pipeline end-to-end — **NOT DISCHARGED (waived)**

> Given the trimmed surfaces on main, when `begin-version-handshake` is run through the
> pipeline end-to-end, then plan, build, and validate all complete with parseable
> reports and no block attributable to the trim.

**This did not run.** `begin-version-handshake` is still `designed` at the v0.8.1 cut.

The validating commit `ccda1b2` recorded the intent to hold the record at `validated`
until this ran. At the v0.8.1 release gate the human **explicitly waived it** and
elected to ship. The waiver is recorded here and in `docs/releases/v0.8.1/report.md`.

**What the waiver costs.** The trim's premise is that instructions were removed only
where a reader did not need them. Every check above is static — greps and reading. The
one criterion designed to test the premise *dynamically*, by running unattended agents
across the trimmed surfaces and seeing whether they still complete, is the one that did
not run. So the residual risk is precisely: a surface trimmed one sentence too far,
invisible to static review, surfacing as a plan/build/validate block on the next
unattended run.

**The standing check.** `begin-version-handshake` is the next eligible feature. Its
pipeline run is still the discharge for this criterion — the waiver defers it, it does
not cancel it. On that run, judge any plan/build/validate block against the trim before
against the feature, and append the outcome to this section.

### AC6 · Reached through the interactive door end to end — **PASS, one wrinkle**

The durable half is verifiable:

```bash
python3 -c "
import json; d=json.load(open('docs/feature-graph.json'))
print([f.get('execution') for f in d['features'] if f['id']=='agent-surface-trim'])"
# → ['interactive']
```

The marker is on the record. Per `713f576`, `the-loop status` reported
`interactiveReady: [agent-surface-trim]` with proposal `advance-interactive` — the door
the criterion requires — and the session was launched by the `interactive-execution`
skill via `prepare-execution-context --interactive`. That commit also records the
producer-side miss worth remembering: `interactive-feature-type` shipped the marker but
nothing set it, so the field had to be added deliberately before status would route
here instead of proposing an unattended run.

**Wrinkle found during this replay — `the-loop list` does not report `execution`.**

```bash
the-loop list | python3 -c "
import json,sys; d=json.load(sys.stdin)
print([f.get('execution') for f in d['features'] if f['id']=='agent-surface-trim'])"
# → [None]        ...but the file says ['interactive']
```

Root cause: `FeatureOut` in `cli/src/commands/graph.rs:268` has no `execution` field, so
the JSON projection behind `list` and `set-status`'s confirmation echo omits it.

Scope, established empirically rather than assumed:

- **The durable graph is safe.** `emit` handles `execution` (`graph.rs:304`) and a
  round-trip test pins it (`graph.rs:685`). Running `set-status` on an unrelated feature
  in a scratch copy left `agent-surface-trim`'s marker intact — verified, not inferred.
  So this release's own `set-status … shipped` does not strip it.
- **`status --json` is correct.** `interactiveReady` reads the parsed struct, not
  `FeatureOut`.
- **Bound stores are safe.** Snapshots are materialized from the adapter and the
  subcommands run against them via `--graph-path` (parse/emit), so no round-trip passes
  through the projection.
- **What breaks is a reader.** `list` is documented as "the parsed feature graph as
  JSON" and silently misreports one field. Observed live: at the v0.8.1 release gate,
  reading `list` showed no marker on this feature and the raw file had to be opened to
  find it.

This is pre-existing — it shipped with `interactive-feature-type` in v0.8.0 — and no
code in the v0.8.1 diff touches it. Recorded as a known issue, not a blocker; it wants
a fix feature.

## Summary

| criterion | verdict |
|---|---|
| AC1 · every file read and ruled | attested (inventory counts confirmed: 5 + 18) |
| AC2 · one instruction per surface; pack reachable | **pass** (5/5 `Skill` tool; doctrine recorded) |
| AC3 · no bare ADR citations | **pass**, regression-guarded by test |
| AC4 · write-skills carries principles | **pass** |
| AC5 · pipeline run on trimmed surfaces | **not discharged — waived at the v0.8.1 gate** |
| AC6 · reached through the interactive door | **pass**; surfaced a `list`-projection defect |

Suites at the released tip: node **179 pass / 0 fail**; Rust **258 lib + 6 process pass
/ 0 fail**; eslint, clippy, rustfmt silent; `the-loop check` → `OK 49 features —
0 error(s)`. Note the node count fell 235 → 179: the trim deleted 17 test files
(−1558 lines) whose assertions pinned prose it removed, and added
`shipped-surface-self-containment.test.js` (+69) to guard AC3 as policy instead.
