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
autonomous run.

`interactive-feature-type` makes this mode first-class, and this feature now
**depends on** it — so the tooling enforces the exclusion rather than the human
remembering, and this session is the marker's first real use. Sequence:

1. `interactive-feature-type` ships; install the upgraded binary before anything
   else touches the graph.
2. Hand-add `"execution": "interactive"` to this record — with the new binary.
   **Order matters**: an older binary silently strips an `execution` key it does
   not know, and it does so inside `set-status`, the validator's last act.
3. Confirm `the-loop status --json` puts this id in `interactiveReady` and not in
   `eligibleSet`, with proposal kind `advance-interactive`.
4. Launch through `interactive-execution`, not by hand.

Because this session is the first-ever caller of `interactive-execution`, prove
the door before committing to the session: run step 3, then
`prepare-execution-context --interactive` on this id, plus the two refusals (an
autonomous id with `--interactive`, this id without it). That exercises scope
resolution and context assembly for free; a broken door then surfaces before the
adjudication starts rather than in the middle of it.

## The shipped surface stands alone

A consuming project installs `plugin/` and the `the-loop` binary. It does not have
this repo — no `docs/adr/`, no this-repo `docs/architecture.md`. Anything under
`plugin/` that needs this repo to make sense is broken, and this audit is where that
gets cleaned up.

**Read which world a reference points at.** Most `docs/…` paths in shipped surfaces
are *correct*: they name the consuming project's own artifacts — `docs/architecture.md`,
`docs/feature-graph.json`, `docs/designs/`, `docs/glossary.md` — which the loop creates
there. Cutting those would break the surfaces. The defects are references to *this*
repo. Pre-seeded candidates, mechanically found (`grep -rE "ADR-[0-9]{4}" plugin/`):

| file | refs |
|---|---|
| `plugin/agents/drive.md` | ADR-0040, ADR-0047 ×2 |
| `plugin/agents/record.md` | ADR-0007 |
| `plugin/agents/validate.md` | ADR-0035 |
| `plugin/skills/design/SKILL.md` | ADR-0037 |
| `plugin/skills/release/SKILL.md` | ADR-0039 |

Each is a provenance note that reads as authority to a stateless agent who cannot
open it. Rule on each: delete the citation and keep the claim, or keep nothing.
The pipeline engine's ADR-numbered comments are a separate ruling — they ship, but
no agent is asked to follow them.

### The tension with shift 4 — resolve it before the structural pass

"Repetition → single authoritative source" and self-containment pull in opposite
directions, and the boundary between them is `plugin/`.

- **Across the boundary**, self-containment wins. Two shipped surfaces stating the
  same rule is *not* redundancy to cut when each surface's reader needs it to act and
  cannot reach the other. The only external truth a shipped surface may lean on is the
  `the-loop` binary's behavior — never another document.
- **Within a single surface**, shift 4 applies at full force: the same instruction
  three times in one file is exactly the scar tissue this pass exists to remove.
- **Inside `docs/`**, cross-reference freely. It is not the shipped definition.

Get this backwards and the audit cuts the sentences that make the surfaces work, and
the damage shows up only in a consuming project. Every duplication ruling in the
structural pass carries a boundary check: *do both readers need this, and can either
reach the other?*

## Inventory (every file gets adjudicated)

| surface | extent |
|---|---|
| `plugin/agents/*.md` | 5 files — build, drive, plan, record, validate |
| `plugin/skills/**/*.md` | 18 files — all skills including reference files, and including `execute` and `interactive-execution`, the two surfaces this feature's dependencies add |
| `CLAUDE.md` | project root |
| `cli/assets/execution-pipeline.js` | the assembled prompt strings only (`resourceGuide`, `planPrompt`, `buildPrompt`, `smallBuildPrompt`, `validatePrompt`) — prose edits, no logic changes |

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
`writing-great-skills` on 2026-07-23, unshipped upstream). The three
**pre-decided** edits — description triggers on agent-definition authoring, an
"Agent definitions" deltas section, and the vendored **Negation** failure mode —
were split out as `write-skills-doctrine` and land ahead of this session, so
that `execute` and `interactive-execution` are authored against the upgraded
doctrine rather than audited against it afterward.

What remains here is the half that needs the session to have happened: the
session's generalized judgment calls fold into the existing Pruning and Failure
modes sections. This write-up is the durable record of the pass — it carries
reasoning, not just conclusions, but as principles, never a per-file changelog.

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
- Surfaces stay self-contained per *The shipped surface stands alone* above —
  including its boundary check on every duplication ruling.
- A write-skills pass runs over every touched surface before landing.

## Validation

Human-judged against the acceptance criteria in the feature graph. The
empirical leg: after the trim lands on main, run `begin-version-handshake`
through the pipeline end-to-end on the trimmed surfaces — real work shipped and
the gross-breakage check in one act. A block attributable to the trim reopens
the relevant ruling; then `set-status validated` → `shipped` by hand.

That feature is **held back for this purpose** — it depends on this one, so it
cannot be spent early. Its predecessors on the backlog (`cli-upgrade`,
`fix-execution-pipeline-name-entrypoint`, `fix-landing-into-checked-out-target`,
`write-skills-doctrine`, `execute-skill`, `interactive-feature-type`) will all
have shipped by the time this session runs.

## Risks accepted in the brief

Judgment is the only gate (no eval); the pass is self-referential (it edits the
instructions future build/validate agents read, including on this repo); the
premise — that current prescription density costs performance — is unverified.
The doctrine write-up is the mitigation for reproducibility.
