# fix-drive-executor-lifecycle — drive.md's executor-lifecycle guidance loses healthy executor runs three ways: a default 120s foreground timeout kills executors mid-work, the drive's own turn/output enforcement ends while a backgrounded executor is still writing (leaving finished work uncommitted), and drives relaunch quiet-but-working executors with byte-identical briefs

**Date:** 2026-07-09 · **Affects:** role-agent-binding (the drive agent doc, `plugin/agents/drive.md`; executor-delegation is the ancestral contract) · **Class:** instruction-gap / lifecycle-mechanics (one bug, three root causes: unquantified timeout, unbounded wait vs. the drive's own turn budget, no stalled-vs-working check before relaunch) · **Cause established by:** inspected (waiver: guidance defect; failure evidenced in recorded transcripts)
**Environment:** the-loop v0.4.10; `plugin/agents/drive.md` current on main; drive agents on `claude-sonnet-5`, executors `grok` (grok-4.5) via CLI, headless, macOS; Claude Code Bash tool default timeout 120000ms (max 600000ms); consuming projects `~/Git/the-loop` and `~/Git/j45`, workflow runs 2026-07-09 → 2026-07-10 · **Determinism:** (a) always — any executor attempt exceeding 120s under a foreground default-timeout Bash call is killed; (b) and (c) intermittent, load/duration dependent · **Regressed since:** never worked — the lifecycle guidance has been this vague since the drive agent was born; the 2026-07-09 `fix-drive-preflight-overreach` revision touched adjacent step-2 text (foreground/background/poll-loop wording) but never named a concrete timeout or bounded the wait against the drive's turn budget

## Steps to reproduce

No red/green command exists — the defect is prose guidance in an agent doc, and its
failures are only observable in recorded executor-run transcripts. The closest
attempt, and the inspection that established each cause (the human granted the
guidance-defect waiver):

1. Route a build task through a drive with a CLI executor binding (`build: { executor: "grok" }`)
   on a real multi-file task that takes 120–160s of executor wall time.
2. Observe the executor session's lifetime and the drive's relaunch behavior in
   `~/.grok/sessions/<url-encoded-worktree>/<session-id>/` (`summary.json`
   `created_at`/`updated_at`, `signals.json`, `chat_history.jsonl`) and the drive
   transcript `agent-<id>.jsonl` under the workflow's `subagents/workflows/wf_*/`.
3. Red observations: executor sessions dying at 101–115s having only read files /
   started writing; a drive parked on `Bash{command:"true"}` / "Waiting for the
   executor process to finish" that is force-returned by `[structured-output-enforce]`
   with finished work uncommitted; a byte-identical brief relaunched ~120–133s after
   the prior attempt while the prior executor left no cancellation flag.

Post-fix, step 3 goes green: executor attempts never die to a default timeout; a
drive that runs out of budget returns a retryable, worktree-adoptable state before
enforcement cuts it; no relaunch of a live-or-just-cut-off executor.

## Expected result

`plugin/agents/drive.md` step 2 — *"Run the executor in the foreground with a
generous timeout; only when a run can outlive the shell tool's timeout ceiling,
background it and block on a single long wait command (repeat the wait if it times
out) — never a rapid poll loop"* — is meant to produce: executor attempts that never
die to a default timeout; a drive that returns a retryable, adoptable state BEFORE
enforcement cuts it; and no relaunch of a live executor. Step 4's own words already
name the intended contract — *"An executor merely cut off mid-work, with no
auth/availability failure of the environment itself, is a retryable infrastructure
failure: report it so the feature lands in the retry lane"* — but nothing in the doc
tells a drive how to keep an executor alive long enough to avoid that lane in the
first place, or how a fresh drive should adopt an intact worktree.

## Actual result

**(a) Timeout kills — `loop-parity-oracle--corpus-context`.** Four consecutive grok
sessions in the same worktree, each a byte-identical cold relaunch of the last:

| session | created | duration | outcome |
|---|---|---|---|
| 019f4985 | 00:55:34Z | 101s | killed mid "I'll start by reading the oracle driver contract and the CLI command implementations…"; empty `signals.json` |
| 019f4987 | 00:57:47Z | 104s | killed; empty `signals.json` |
| 019f4989 | 00:59:50Z | 115s | killed; empty `signals.json` |
| 019f498b | 01:01:54Z | 140s | completed; full `signals.json` (`sessionDurationSeconds: 139`, `turnCount: 1`, no cancellation) |

Relaunch intervals: 133s, 123s, 124s. Killed sessions cluster at 101–115s (under the
120s Bash ceiling once startup is subtracted); the only survivor ran 140s. Also
`loop-graph-commands-rust--graph-model-emit`: 019f49e4 died at 115s → 019f49e6
completed at 157s. Eight grok sessions across six the-loop tasks show this pattern —
die at ~101–115s having only read files, relaunched cold with the identical brief.

**(b) Turn-end orphan — j45 run `wf_33b389eb-45e` (2026-07-10 ~01:50Z).** The drive
transcript `agent-a29a92dcd20276a22.jsonl` tail shows the drive backgrounding grok,
then parking on an exit monitor: `Bash{"command":"true"}` → `echo
waiting-for-notification` → *"Waiting for the executor process to finish (background
monitor `bndqfefzw` will notify when it exits)."* The next record is a
`[structured-output-enforce]` directive forcing an immediate StructuredOutput call.
The drive returned `blocked` / kind `infrastructure`, summary: *"Executor (grok) was
launched in the worktree and was actively editing exactly the four footprint files
when this run had to return before verification/commit could complete."* Its own
`detail` documents the retryable state and the desired remedy verbatim: grok (pid
98025) *"was still running"*, its diff *"touched only the intended footprint …
(263 insertions/45 deletions total)"*, and *"This is a retryable infrastructure
situation: the worktree and its in-progress diff are intact and should be resumed
(rerun/attach to the same worktree, let the executor finish, then verify at the build
bar and commit)."* grok kept running detached; the complete-looking diff sat
uncommitted; a human relaunch (`wf_f164d0c5-37f`) spawned a fresh drive that adopted
the intact worktree and committed.

**(c) Premature relaunch — `loop-exercise-library--exercises-repo-migration`.**
Session 019f4516 (created 04:15:11Z, 23 chat messages) cut off after ~2 assistant
turns / 13 tool calls mid-grep and wrote no `signals.json` at all (no cancellation
recorded). A byte-identical brief was relaunched as 019f4518 at 04:17:14Z — 123s
later, the same ~120s cadence as (a). Also `integrate--exercise-library`: two
concurrent judge sessions started 7s apart carrying the identical 6220-char brief —
no dedupe of concurrent identical briefs.

## Root cause(s)

All three live in one file, `plugin/agents/drive.md` step 2 (build-brief lifecycle),
with step 3/step 4's retry lane inheriting the gap. The trigger in every case is an
executor attempt whose real wall time crosses the Bash tool's default 120000ms
timeout — the exact regime the doc's "generous timeout" was supposed to cover but
never quantifies.

- **RC1 — "generous timeout" names no value and no mechanism (kills, case a).**
  drive.md:33-36 says *"Run the executor in the foreground with a generous
  timeout"* but never states a concrete number, never mentions the Bash tool's
  `timeout` parameter, and never states its default (120000ms) or ceiling
  (600000ms). A drive that issues a plain foreground `grok -m …` Bash call inherits
  the 120s default and the tool SIGKILLs the executor at the ceiling — visible as
  the 101–115s deaths with empty `signals.json` (grok never got to write its
  end-of-session summary). The doc offers backgrounding *"only when a run can
  outlive the shell tool's timeout ceiling"* — framed as the exception for the rare
  very-long run, when for compile/suite-running executor tasks it is the common case.

- **RC2 — the "single long wait" is never bounded against the drive's own
  turn/output-enforcement budget (orphan, case b).** drive.md:34-36 says to
  *"background it and block on a single long wait command (repeat the wait if it
  times out)"* but nowhere tells the drive to bound that wait against its own budget,
  nor what to return when the executor is still alive as the budget runs out. So the
  drive parks (`Bash{command:"true"}`, "Waiting for the executor process to
  finish"), the harness's `[structured-output-enforce]` fires mid-park, and the drive
  emits an ad-hoc blocked/infrastructure return with completed work left
  uncommitted and the executor still detached. The doc has no *proactive*
  bounded-wait-then-return protocol, and no **adoption step** telling a subsequent
  drive that finds an intact worktree with a finished (or still-running) executor to
  resume/verify/commit rather than re-run from scratch — the recovery in (b) happened
  only because a human relaunched and the fresh drive improvised it.

- **RC3 — no stalled-vs-working check gates the retry/relaunch (premature relaunch,
  case c).** drive.md:37-40 grants *"ONE retry with the failure fed back"* and
  step 4 (drive.md:46-49) classifies *"cut off mid-work"* as retryable, but neither
  defines how to distinguish a stalled executor from a quiet-but-working one before
  relaunching. There is no instruction to check process liveness (is the pid still
  running?) or output-file growth (is the diff still advancing?) before treating an
  attempt as failed, and nothing dedupes concurrent identical briefs. So a
  still-working or freshly-cut-off executor (no cancellation flag) is relaunched with
  a byte-identical brief, and two identical judge briefs run 7s apart.

- **Why no existing test or validation caught it.** drive.md is agent guidance
  (prose), exercised only in live headless executor runs; it has no red/green
  harness. The executor-delegation validation and the drive probes (drive-widget /
  drive-gadget / drive-slugify, visible in `~/.grok/sessions/`) all used tiny
  fixture tasks that finish in seconds — well under the 120s Bash ceiling — so the
  ceiling was never crossed in any eval. No eval runs an executor past the timeout
  ceiling, and no harness asserts "executor still alive at drive return" or "no
  byte-identical relaunch of a live executor." Calibration records run outcomes, not
  executor lifetimes, and these runs eventually produced a committed feature (via a
  later cold relaunch or a human adopt), so every run looked healthy in aggregate.
  The sibling `fix-drive-preflight-overreach` (2026-07-09) rewrote the same step 2
  for a token-spend concern and reworded the foreground/background line, but left the
  lifecycle mechanics — the timeout value and the wait's relationship to the drive's
  budget — untouched.

## Evidence

- Case (a): `~/.grok/sessions/%2FUsers%2Fjatassi%2FGit%2Fthe-loop%2F.claude%2Fworktrees%2Floop-parity-oracle--corpus-context/`
  — `summary.json` `created_at`/`updated_at` for 019f4985 (101s), 019f4987 (104s),
  019f4989 (115s), 019f498b (140s, `sessionDurationSeconds: 139`); empty
  `signals.json` on the three killed sessions vs. full signals on the survivor;
  019f4985 `chat_history.jsonl` first assistant text *"I'll start by reading the
  oracle driver contract and the CLI command implementations so the case corpus
  matches the real semantics."* Relaunch intervals 133/123/124s.
- Case (b): `~/.claude/projects/-Users-jatassi-Git-j45/ebf87348-b22b-4cbf-918c-c6b979c2b9ee/subagents/workflows/wf_33b389eb-45e/agent-a29a92dcd20276a22.jsonl`
  — tail records: `Bash{"command":"true"}`, `echo waiting-for-notification`,
  *"Waiting for the executor process to finish (background monitor `bndqfefzw` …)"*,
  then `[structured-output-enforce]`, then the `blocked`/`infrastructure`
  StructuredOutput whose `detail` names pid 98025 still running, the four-file
  263+/45- footprint diff, and the "rerun/attach to the same worktree" remedy.
- Case (c): `~/.grok/sessions/%2FUsers%2Fjatassi%2FGit%2Fj45%2F.claude%2Fworktrees%2Floop-exercise-library--exercises-repo-migration/`
  — 019f4516 `created_at` 04:15:11Z, 23 chat messages, no `signals.json`; 019f4518
  `created_at` 04:17:14Z (123s later). Concurrent-brief case in
  `%2F…%2Fintegrate--exercise-library/`.
- `plugin/agents/drive.md:33-36` (foreground/generous-timeout/single-long-wait),
  `:37-40` (ONE retry), `:46-49` (cut-off-is-retryable) read against the observed
  behavior — no concrete timeout, no Bash `timeout` parameter, no budget-bounded
  wait, no adoption step, no stalled-check.

## Fix design

One surface edit, `plugin/agents/drive.md` (build-brief section, step 2 lifecycle
sentence plus step 3/4 retry lane; validate section's judge run inherits the same
run-the-executor mechanics and should be covered by the same wording). No code
changes — this is agent guidance. Propose:

1. **Concrete timeout + background-by-default for long tasks (RC1).** Replace
   "generous timeout" with explicit mechanics: invoke the executor's Bash call with
   an explicit `timeout` parameter at the tool's ceiling (600000ms), and make
   **background-plus-single-long-wait the default for compile/suite-running tasks**
   (anything that reads several files, writes code, and runs a test suite), not the
   rare exception — foreground short-timeout is only for trivially quick executors.
   Name the default (120000ms) explicitly as the value to override so the failure is
   legible.

2. **Bounded-wait + retryable-with-adoption-note return (RC2).** Instruct the drive
   to bound its wait against its own turn/output budget: if the executor is still
   running as the budget nears exhaustion, the drive must *proactively* return
   `blocked` kind `infrastructure` (retry lane) with a self-contained
   worktree-adoption note — worktree path, branch, footprint touched so far,
   executor pid, verification commands still owed — **before** enforcement forces an
   ad-hoc return. Add an explicit **adoption step**: a drive whose first action finds
   an intact worktree with a finished-or-running executor for its task resumes it
   (attach/let it finish, then verify at the build bar and commit) rather than
   re-running the brief from a cold start.

3. **Stalled-vs-working check before any relaunch (RC3).** Before the step-3 ONE
   retry or any relaunch, the drive must confirm the executor is actually stalled —
   check process liveness (pid no longer running) and/or output-file growth (diff no
   longer advancing over a short window). A live-or-still-advancing executor is
   waited on, never relaunched with a byte-identical brief; a genuinely dead one is
   retried once. Note the concurrent-identical-brief hazard so a drive does not
   start a second executor against a worktree an equivalent brief is already driving.

Constraints for the builder: keep the drive/executor split intact (drive owns
mechanics, executor owns judgment — do not add exploration); do not weaken the
build-bar verification or the integrity lines; the adoption path must still re-run
tests/lint at the build bar before committing (adopting an intact worktree is not a
license to skip verification).

## Regression

- A post-fix executor-routed run on a 120–160s task shows the executor session
  running to completion (no 101–115s death, non-empty `signals.json`), because the
  drive's Bash call carries an explicit ceiling `timeout` and/or backgrounds the run.
- When a drive runs out of budget with the executor still alive, its return is a
  retry-lane `blocked`/`infrastructure` with a self-contained worktree-adoption note
  emitted proactively — never a `[structured-output-enforce]`-forced ad-hoc return
  with finished work uncommitted.
- No byte-identical brief is relaunched while the prior executor's process is still
  running or its output file still growing; the drive records the liveness/growth
  check it made before any retry.

## Validation procedure

`docs/validation/role-agent-binding/procedure.md` gains one exercise step: after the
next drive-routed run on a task that takes >120s of executor wall time, inspect the
executor session and drive transcript per Steps to reproduce — the executor session
must run to completion (non-empty `signals.json`, no ~101–115s death), any
budget-exhaustion return must be a proactive retry-lane blocked with a
worktree-adoption note, and no byte-identical relaunch may overlap a live executor.
