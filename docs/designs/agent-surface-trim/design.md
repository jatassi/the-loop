# agent-surface-trim — audit and targeted trim of the agent-facing surfaces

## What this is

A maintenance pass over every prose surface the-loop puts in front of an agent,
read against five context-engineering shifts (rules→judgment, examples→interface
design, upfront loading→progressive disclosure, repetition→single source,
manual→auto memory). The workflow's structure — phases, gates, artifacts,
contracts — is untouched; what gets trimmed is line-level coaching inside
prompts. Every surviving sentence must be defensible; there is no line-count
target.

## Execution mode — human-attended, never pipelined

This feature is **not built by the execution pipeline**. It runs as a live
adjudication session: surfaces are read together, candidates surfaced one at a
time, and the human rules on each — decision and edit in one step, in a
worktree, merged to main at the human's gate. Do not scope this feature into an
autonomous run. (A `proposed` backlog record, `interactive-feature-type`, exists
to make this execution mode first-class in the schema later.)

## Inventory (every file gets adjudicated)

| surface | extent |
|---|---|
| `plugin/agents/*.md` | 5 files — build, drive, plan, record, validate |
| `plugin/skills/**/*.md` | 16 files — all skills including reference files |
| `CLAUDE.md` | project root |
| `plugin/workflows/execution-pipeline.js` | the assembled prompt strings only (`resourceGuide`, `planPrompt`, `buildPrompt`, `smallBuildPrompt`, `validatePrompt`) — prose edits, no logic changes |

Out of scope: `eval/kernels/` (drifted copies, eval not gating this), the Rust
CLI, the workflow scheduler, artifact schemas.

## Resolved decisions

**code-quality gets wired in, not folded or left orphaned.** The pack
(`plugin/skills/code-quality/`) stays the single authoritative home for build
constitution, test judgment, design vocabulary, and review catalog. The five
agent definitions gain the `Skill` tool in their frontmatter `tools:` line
(today: `tools: Read, Grep, Glob, Bash, Write, Edit`) — a deliberate,
human-authorized capability amendment — and the inline duplicates in `build.md`,
`drive.md`, and `validate.md` shrink to invocations/pointers. The wiring is
**validated live** during the session: spawn one build-shaped agent and confirm
it can invoke the code-quality skill from inside a target-project worktree
before any inline copy is deleted. If invocation fails there, fall back to
folding the pack into its consumers (each piece one home) and deleting the
skill.

**Authoring doctrine extends `write-skills` in place** — the-loop's
writing-for-agents surface (same generalization Matt Pocock announced for
`writing-great-skills` on 2026-07-23, unshipped upstream). Three edits: the
description gains agent-definition triggers; the body gains a compact "Agent
definitions" deltas section (description = delegation trigger; `tools:` list is
part of the interface; the body is a system prompt read cold by a stateless
worker); and the **Negation** failure mode is vendored from upstream
(2026-07-06): steering by prohibition names the elephant — prompt the positive;
keep a prohibition only as a hard guardrail you can't phrase positively, and
pair it with what to do instead. The session's generalized judgment calls fold
into the existing Pruning / Failure-modes sections. This write-up is the
durable record of the pass — it carries reasoning, not just conclusions, but as
principles, never a per-file changelog.

**Review order: structural pass first, then per-file in traffic order.**

1. Structural: build the cross-surface duplication map (mechanical, checkable),
   land the code-quality wiring + Skill-tool amendment, rule on each duplicated
   instruction's one home.
2. Per-file, batched by file (each file read once, all five lenses active), in
   reader-traffic order: agent definitions (build, drive, validate, plan,
   record) → runtime prompt assembly → high-traffic skills → long tail →
   `CLAUDE.md` last.

**Every candidate gets one of four fates: keep, rewrite, relocate, delete.**
Delete is the default; git history is the archive — no graveyard file. Relocate
means moving down the information-hierarchy ladder to a reference the agents can
actually reach (the code-quality pack is the standing destination), and the
ruling must name the receiving file and the pointer wording, or it's a delete.
Rewrite is the Negation move: surviving guardrails rephrased positively where
possible, prohibition kept only where it can't be, paired with the do-instead.
The four trap-guarded rules (test-weakening, test-aware implementation,
truncation, footprint excursion) have demonstrable failure modes and are
expected keeps/rewrites, not deletes — cutting one is an uninstrumented bet and
the human rules on it explicitly.

**`/doctor` seeds candidates, case-by-case, no reconciliation artifact.** Its
findings enter the session as ordinary candidates. A human overrule produces a
doctrine sentence only when it reveals a real principle (e.g. pipeline protocol
— contract shapes, return JSON, worktree discipline — is interface, not
coaching); pure noise is dismissed without record.

## Constraints

- Worktree isolation; merge to main only at the human's gate, no PR.
- No behavior changes beyond the Skill-tool amendment recorded above.
- Surfaces stay self-contained: no references to ADRs or internal design docs
  from shipped skills/agents.
- A write-skills pass runs over every touched surface before landing.

## Validation

Human-judged against the acceptance criteria in the feature graph. The
empirical leg: after the trim lands on main, run one already-designed backlog
feature (`cli-upgrade`, `begin-version-handshake`, or `execute-skill`) through
the pipeline end-to-end on the trimmed surfaces — real work shipped and the
gross-breakage check in one act. A block attributable to the trim reopens the
relevant ruling; then `set-status validated` → `shipped` by hand.

## Risks accepted in the brief

Judgment is the only gate (no eval); the pass is self-referential (it edits the
instructions future build/validate agents read, including on this repo); the
premise — that current prescription density costs performance — is unverified.
The doctrine write-up is the mitigation for reproducibility.
