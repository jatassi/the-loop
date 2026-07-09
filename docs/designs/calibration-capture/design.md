# calibration-capture — Calibration Memory (per-project capture, recalled at Plan/Design)

**Status:** designed 2026-07-08 from `docs/briefs/calibration-capture.md` (which
carries the full walkthrough scenario and decision history). ADR-0007 settled the
posture: per-project, in the target repo, v1 capture-only (no auto-feedback),
human-glanceable. ADR-0046 exempts the capture commit from ADR-0034's
no-bookkeeping rule: these are unrecoverable run observations — evidence, not
derivable projections.

Every run automatically leaves a structured record of estimated-vs-actual
(sizes, footprints, agent counts, tokens, durations, outcomes, re-slice events);
a deterministic CLI digest over the record corpus is recalled at Plan
(machine-fed via the execution context) and Design (the design skill consults it
when slicing). Capture also separates loop-overhead tokens from build tokens, so
"earns its context" is measured per run, not assumed.

## Division of labor (the load-bearing rule)

**The workflow script computes; the `record` agent transcribes.** The record's
machine payload is a pure function of what the script observed — deterministic,
byte-final. The final spawn exists only because the script has no filesystem
(ADR-0038). The record agent writes the payload verbatim, adds **git-derived
enrichment only** (durations, diff stats, commit counts), runs
`the-loop calibration-summarize`, and lands one commit. Free-text interpretation
("auth features tend to re-slice") is banned from capture — pattern-reading is
recall-time work. Digest math is CLI code, never LLM arithmetic.

## Touched surfaces

| Surface | Change |
|---|---|
| `workflows/execution-pipeline.js` | observation collector; record-payload assembly; final `record` spawn |
| `agents/record.md` | new agent (rote transcriber; tools: Read, Grep, Glob, Bash, Write, Edit) |
| `bin/the-loop.js` + `bin/cli-commands.js` + `src/` | new `calibration-summarize` subcommand; `preparedAt` + `calibration` in the execution context |
| `config/model-bindings.json` | new role `record` (default: cheapest tier, e.g. `haiku`) |
| `agents/plan.md` | one line: a calibration digest may ride the prompt — bias sizing with it |
| `skills/design/SKILL.md` | slicing step consults `docs/calibration/index.md` when present |
| `docs/calibration/` (in the target repo, at runtime) | `runs/<date>-<seq>.md` records + fully derived `index.md` |

## Execution-context additions

The bin edge gathers two new fields (mirroring how `probe` is gathered —
`bin/cli-commands.js`: `sectionAfter(readFileSync(DESIGN,'utf8'), '## Validation
runbook')`):

- `preparedAt` — ISO-8601 UTC timestamp stamped by the CLI. This is the script's
  only legal clock (`Date.now()` is banned in workflow scripts for resume
  safety); it also seeds the record filename.
- `calibration` — the `## Digest` section of `docs/calibration/index.md`, or
  absent when that file doesn't exist. Only the bounded digest rides — never the
  run list. With no calibration history the context and every prompt are
  byte-identical to today's.

`assembleExecutionContext` today returns `{ target, scope, probe, models,
features, ...(cli && { cli }) }` — the two fields join that literal.

## Workflow-script observation

The script already routes every spawn through one choke point (`spawn(prompt,
opts, featureId)`) and assembles `const result = { completed, blocked, stalled,
budget: { spent: budget.spent, remaining: budget.remaining } }`. Additions:

- An observation collector: per feature — workflow path, the plan's task
  contracts (id, size, judgment_level, footprint — planned side only), per-role
  spawn counts, outcome (`validated | blocked | stalled | unreached`) with
  reason, re-slice detail when plan returns `needs_refinement`.
- Per-spawn budget sampling: read the budget's spent value before/after each
  awaited spawn, aggregated **per role** (plan/build/drive/validate). Under
  concurrency a delta includes other in-flight agents' spend, so the payload
  carries `attribution: serial | overlapped` (overlapped whenever 2+ spawns
  coexisted). The split is approximate by construction and the record says so
  structurally. Note: line 390 reads `budget.spent` as a property while the
  harness documents `spent()` — the builder must verify which form the live
  harness serves and use it consistently in both places.
- Record-payload assembly: a pure function over (observations, result,
  `executionContext.preparedAt`, scope, target) → the YAML payload string.
  Deterministic ordering (scope order for features, plan order for tasks); no
  other timestamps.

**Capture placement:** after `result` is assembled (halt paths included — the
halted run falls through to the same assembly), before the `return`:

- Skip with one `log()` line when `halted?.reason === 'budget-exhausted'` — a
  further spawn would just throw. Accepted gap, alongside hard script death.
- Otherwise spawn the record agent (`agentType: agentTypeFor('record')`, role
  binding `record`, `phase: 'Record'`, label `record`) inside try/catch: any
  failure logs one line and the run summary is returned unchanged. The capture
  can never alter, delay-fail, or replace the completion channel.
- `meta.phases` gains `{ title: 'Record' }` as a fourth entry. The meta must
  stay one physical line with the single-quoted `description: '…'` literal —
  `src/splice-workflow-description.js` shape-gates exactly that (phases entries
  are not matched; the splice survives the addition).

## Record artifact

`docs/calibration/runs/<date>-<seq>.md` — `<date>` = `preparedAt`'s UTC date,
`<seq>` = 1 + count of existing `runs/<date>-*.md`. Human-glanceable header
(one line per feature: id, path, outcome), then one ```yaml block:

```yaml
run:
  prepared_at: 2026-07-08T14:02:11Z
  target: main
  scope: [feature-a, feature-b]
  tokens:
    spent: 412000
    by_role: { plan: 61000, build: 298000, validate: 49000 }
    attribution: overlapped        # serial | overlapped — honesty flag
  halted: ~                        # reason when the run halted
features:
  - id: feature-a
    workflow_path: standard        # small | standard
    outcome: validated             # validated | blocked | stalled | unreached
    reason: ~                      # blocked/stalled detail
    reslice: ~                     # plan's needs_refinement detail
    agents: { plan: 1, build: 3, drive: 0, validate: 1 }
    tasks:                         # planned side, from the task contracts
      - { id: t1, size: s, judgment_level: standard, footprint: [src/x.js, test/x.test.js] }
    actual:                        # record-agent git enrichment, per feature
      files_touched: 9
      insertions: 210
      deletions: 40
      commits: 4
      duration_minutes: 22
```

The script emits everything except `features[].actual` (git enrichment) —
those keys arrive as explicit nulls the record agent fills. Enrichment sources:
the validate squash on the target (`git show --stat`) for diff stats; commit
timestamps (first loop commit on the feature's branches → squash) for duration;
best-effort — a non-validated feature keeps nulls. Records are permanent once
landed; the record agent commits (`calibration: run <date>-<seq>`) in a
worktree and publishes to the target by fast-forward, after all validators
(end of run — no lock contention). Return shape: `{ result: 'recorded' |
'blocked', path?, detail? }`.

## `the-loop calibration-summarize`

Deterministic aggregation over `docs/calibration/runs/*.md` that **regenerates
`docs/calibration/index.md` wholesale** — the entire file is derived (delete it
and it recomputes identically): a `## Digest` section (≤ 40 lines, bounded by
construction: fixed table set, top-5 lists, medians) followed by `## Runs`, one
line per record. Digest working set: per workflow path — count, median agents,
median duration; re-slice count/rate; planned-vs-actual footprint accuracy by
size class; top recurring block reasons (verbatim strings, count-grouped);
overhead-vs-build token split (lifetime + last-10 median, with the attribution
caveat surfaced). Same corpus → byte-identical output (stable sorts, no
timestamps). A record whose yaml block fails to parse → exit 1 naming the file.
Plain ESM JS in `src/` with node:test coverage, like every CLI surface.

## Recall

- **Plan (machine-fed):** `planPrompt` gains a section — `calibration digest
  (this repository's run history):` + `executionContext.calibration` — only when
  the field is present. `agents/plan.md` gets one line telling the plan agent to
  bias sizing/decomposition with it.
- **Design (human-attended):** the design skill's slicing step consults
  `docs/calibration/index.md` when present. A project with no history designs
  exactly as today.

## Constraints inherited

- ADR-0007: per-project; no cross-project reads or writes anywhere.
- ADR-0034: nothing scheduled; capture adds zero human ceremony. ADR-0046 is the
  recorded exemption for the capture commit.
- ADR-0038: script touches no filesystem; every repo action is the agent's.
- Naming law (ADR-0044): `record` (agent role) and `calibration-summarize` (CLI
  verb) were blind-generated and human-approved 2026-07-08. No new glossary
  entries — every term is composed of standard words (the ratchet).
- Plugin form: plain ESM JS, no build, node:test.
