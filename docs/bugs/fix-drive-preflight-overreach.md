# fix-drive-preflight-overreach — drive agents pre-digest the codebase before the executor runs, doing the executor's exploration twice and roughly doubling drive context

**Date:** 2026-07-09 · **Affects:** role-agent-binding (the drive agent doc; executor-delegation is the ancestral contract) · **Class:** instruction-gap (agent doc names the prompt's inputs but never bounds the assembly) · **Cause established by:** inspected (waiver: token spend has no red/green harness; cause established by a quantitative audit of 71 production drive transcripts plus reading `plugin/agents/drive.md`)
**Environment:** the-loop v0.4.9 (checkout `b69fc0f`), drive agents on `claude-sonnet-5`, executor `grok` (grok-4.5) via CLI; consuming projects `~/Git/the-loop` and `~/Git/j45`, workflow runs 2026-07-03 → 2026-07-09 · **Determinism:** always — every build-task drive in the corpus explores before handing off (median 3, max 16 full-file Reads pre-handoff; 69% of all tool-result bytes corpus-wide land before the executor is invoked) · **Regressed since:** never worked — the behavior is as old as the drive agent itself

## Steps to reproduce

No single red/green command exists — the symptom is token spend, observable only
in a run's transcripts. The closest attempt, and the audit that established the
numbers:

1. Run any execution pipeline with a role bound to a CLI executor (e.g. `build:
   { executor: "grok" }`), letting at least one build task route through a drive
   agent.
2. Open the run's drive transcript (`agent-<id>.jsonl` next to the workflow's
   `journal.jsonl`, agentType `the-loop:drive` in the sibling `.meta.json`).
3. Classify every tool_result by whether it precedes the first executor
   invocation (a Bash command matching the registry's run command, e.g.
   `grok -m …`). Red: full-file Reads of project source before that point.

Post-fix, step 3 goes green: zero pre-handoff source reads.

## Expected result

The drive is "a thin variant of the routed contract that delegates the judgment
to a CLI executor and owns everything around it" (`plugin/agents/drive.md:7-9`).
Mechanics before the handoff are worktree creation and the registry lookup; the
task brief is self-contained by construction (criteria, footprint, wiring, and a
"Fetch more only if needed" pointer list — see any prepared build brief), and the
executor runs headless *inside the worktree* with the same file access the drive
has. Nothing before the handoff should scale with the size of the code under
change; a drive's context should be dominated by its own verification (step 3 of
the contract), not by exploration.

## Actual result

Across 71 drive transcripts from the last 7 days (54 build briefs, 17 validate
briefs, both projects):

- Build drives: median 62 assistant turns, median peak context 59k tokens, max
  167k; validate drives: median 104 turns, median peak 69k, max 199k. The
  80–100k figures observed in the workflow UI are the upper half of this
  distribution.
- 42% of all tool-result bytes are full-file `Read`s; **81% of those reads happen
  before the executor is invoked**. Counting every tool, 69% of tool-result
  bytes land pre-handoff.
- Concrete case (j45, `manual-timer/timer-e2e`, run `wf_a53a5f81-dbb`, agent
  `aacf069c`): from a self-contained ~700-token brief, the drive read 12 full
  source files (~103 KB, ~26k tokens) — spec precedents, the screen component,
  audio/wake-lock modules, `playwright.config.ts` — to author a 15.4 KB executor
  prompt pre-digesting all of it (exact `data-testid`s, init-script
  serialization gotchas, `READY_SECONDS = 5` timing math). The prompt then tells
  the executor to *"read these first, in the actual repo"* — the exploration was
  paid twice by design of the prompt itself.

## Root cause(s)

- **Underlying cause:** `plugin/agents/drive.md` step 2 — *"assemble the prompt
  from your task brief (criteria, footprint, wiring)"* — names the prompt's
  inputs but never bounds the assembly. The doc nowhere states the
  drive/executor responsibility split as exclusive, and nothing forbids reading
  source to "understand the task first," so a diligent model treats prompt
  assembly as research-and-author rather than pass-through. The brief format's
  own "Fetch more only if needed" guard applies to the drive's *mechanics*
  reading, and doesn't stop enrichment reading.
- **Trigger:** any brief whose wiring names precedent files ("the glass suite's
  instrumentation precedent") — an invitation to open them.
- **Secondary wastes, same doc:** (a) the prompt-file uniqueness warning is
  honored after the fact — 8/71 runs wrote a generic `prompt.md` first, then
  rewrote the same ~14 KB under a task-unique name (~3–4k output tokens each);
  (b) "run the executor in the foreground" fights the Bash tool's 600s timeout
  ceiling, so long executor runs get backgrounded anyway and then rapid-polled
  (`jobs; ps aux | grep grok` turn after turn).
- **Why nothing caught it:** no token budget is gated anywhere — calibration
  records outcomes, not spend — and these drives returned `built` with green
  suites, so every run looked healthy.

Explicit non-goal: validate-brief drives are heavy *by contract* (they own
merge/assembly/landing per ADR-0047; the 288-turn, 199k-context tail is conflict
resolution during integration merges). This fix does not touch that weight.

## Evidence

The transcript audit over
`~/.claude/projects/{-Users-jatassi-Git-the-loop,-Users-jatassi-Git-j45}/*/subagents/workflows/wf_*/agent-*.jsonl`
(filtered to `agentType: *drive`, mtime ≤ 7 days) producing the corpus numbers
above; the `wf_a53a5f81-dbb`/`aacf069c` transcript (12 pre-handoff Reads, the
15.4 KB prompt Write, its "read these first" line); the
`wf_5f8d2bcb-f4a`/`ae1baf01` transcript (duplicate 14.5 KB prompt writes
`prompt.md` → `e2e-authoring-plan-editing-prompt.md`, plus the
`while kill -0 … sleep 5` / `jobs; ps aux` polling fight); `drive.md` step 2
read against the observed behavior.

## Fix design

One surface edit, `plugin/agents/drive.md` (build-brief section; validate
section untouched):

1. State the split as strict and exclusive, up front: the drive owns mechanics
   (worktree, registry lookup, prompt hand-off, build-bar verification, commit,
   report); the executor owns judgment (reading the code, deciding the change,
   writing it and its tests). Opening a source file before the executor has run
   is the executor's work done twice.
2. Rewrite step 2: the prompt is the brief passed through near-verbatim —
   criteria, footprint, wiring, commit subject — wrapped in the registry's
   prompt format plus the verification commands the executor must leave green.
   No enrichment: no reading footprint or precedent files, no code excerpts, no
   pre-digested pattern notes.
3. Fold the two secondary wastes into the same step: write the prompt file
   once, under the task-unique name, on the first write; and replace the
   foreground-only line with graded guidance — foreground with a generous
   timeout, and when a run can outlive the shell's timeout ceiling, background
   it and block on a single long wait command, never a rapid poll loop.

Expected effect: pre-handoff bytes drop to near zero; build-drive median peak
context roughly halves (59k → ~30–40k) with turns dropping proportionally.

## Regression

- A post-fix executor-routed run's drive transcript shows zero full-file Reads
  of project source before the first executor invocation (the audit in Steps to
  reproduce, green).
- Exactly one prompt file is written per executor attempt, task-unique from the
  first write.
- No `ps`/`jobs` polling sequences around executor runs.

## Validation procedure

`docs/validation/role-agent-binding/procedure.md` gains one exercise step: after
the next drive-routed run, audit the drive transcript per Steps to reproduce —
pre-handoff source reads must be zero and the prompt file single-write.
