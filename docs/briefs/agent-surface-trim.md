# Brief — agent-surface-trim

## Intent

Anthropic removed over 80% of Claude Code's system prompt for the Claude 5 generation
with no measurable loss on their coding evals, and published the lessons as five shifts
in context engineering. the-loop was authored against an older generation of models. Its
agent-facing surfaces — five subagent definitions and sixteen skill files — carry a
density of imperative prescription that those shifts say is now, at best, wasted tokens
and, at worst, a source of conflicting instruction that degrades the agents it was
written to help.

The workflow itself is working: it is used daily across several projects and the human
likes it. This is not a rescue. It is a maintenance pass to find out which prescriptions
are load-bearing and which are scar tissue from working around limitations that no
longer exist — and to cut the scar tissue.

The five shifts, as the source article frames them:

1. **Rules → judgment.** Stop writing "never do X" absent a specific, demonstrable
   failure mode the model cannot reason its way out of.
2. **Examples → interface design.** Self-describing tool and contract shapes beat worked
   examples, which narrow the model's exploration space.
3. **Upfront loading → progressive disclosure.** Load context at the moment it is needed;
   structure guidance as a tree of files, not one monolith.
4. **Repetition → single authoritative source.** State an instruction in exactly one
   place. Redundancy no longer buys compliance.
5. **Manual → auto memory.** Let the model persist what matters instead of curating it
   by hand.

## Users

The human, as the-loop's author and its primary operator across several projects. The
agents the-loop spawns are the surfaces' actual readers, but they are not the user —
they do not choose to adopt this and cannot report on it.

## Scope envelope

**One feature: audit and targeted trim.** Read every in-scope surface against the five
shifts, surface trim candidates, adjudicate each one with the human, apply the cuts, and
fold the resulting judgment into the-loop's own authoring doctrine.

### In the inventory

| surface | extent |
|---|---|
| `plugin/agents/*.md` | 5 files, 443 lines — build, drive, plan, record, validate |
| `plugin/skills/**/*.md` | 16 files, 1,681 lines — all 11 skills including reference files |
| `CLAUDE.md` | 10 lines, project root |
| runtime-assembled prompts | `plugin/workflows/execution-pipeline.js` lines ~158–250: `resourceGuide`, `planPrompt`, `buildPrompt`, `smallBuildPrompt`, `validatePrompt` |

### Explicitly out

- **`eval/kernels/*.md`** — two already-drifted copies of `build.md` and `validate.md`.
  Left alone because the eval harness is not gating this work.
- **the-loop's structure** — the phase sequence, the gates, the artifact set, the
  contracts. Whether the *workflow* is over-prescribed for frontier models is a separate
  and much larger question.
- **Behavior changes of any kind.** This pass changes what agents are told, not what the
  pipeline does.

### Noted for later intakes

- Re-syncing `eval/kernels/` to the shipped agent definitions and re-running the matrix
  to measure the trim empirically.
- Per-model-tier surfaces: a thin core plus optional scaffolding loaded only for
  weaker bound executors.

## Decided

- **Trim uniformly to the frontier bar.** the-loop's default bindings are heterogeneous —
  `build.standard` and `build.rote` route to `grok-4.5`, `record` to Haiku 4.5, only
  `validate` and `build.complex` to Opus 5 — so the article's Claude-5 evidence does not
  transfer cleanly. The decision is to assume bound executors are frontier-class and
  converging, and to let operators on weaker executors compensate through model bindings
  rather than holding every surface at the weakest reader's level. This is a deliberate
  bet, not an oversight.
- **Collaborative per-candidate adjudication, not a mechanical criterion.** Each file is
  read under the article's lens, candidates are surfaced, and the human rules on them one
  at a time. An automated keep/cut rule was considered and rejected: the calls are
  genuinely subjective and the human wants to make them.
- **Opinions move up, not out.** the-loop's opinionatedness lives in its structure —
  phases, gates, artifacts, contracts — which this pass does not touch. What gets trimmed
  is line-level coaching inside prompts, which was never where the opinion lived. **No
  line-count reduction target**, because a quota invites cutting load-bearing text to hit
  a number. The bar is that every surviving sentence is defensible.
- **Human-attended editing session; the pipeline does not build this.** Trims are made
  directly in a worktree as each call is made — decision and edit in one step. Running it
  through Plan/Build/Validate would reduce the human to reviewing a finished diff, which
  is the opposite of the requested working mode.
- **Doctrine gets updated from the session.** `write-skills` (and wherever agent-definition
  authoring guidance ends up living) absorbs the judgment calls actually made, so future
  surfaces are authored at the new density instead of drifting back. Because there is no
  separate per-candidate decision record, this doctrine write-up *is* the durable record
  of the pass — it has to carry the reasoning, not just the conclusions.
- **Judgment is the only gate; no eval.** The existing `eval/` harness will not referee
  the trims. It would need a kernel re-sync first, it only covers 2 of the 21 surfaces,
  and the per-file calls in question are not really what it measures. The consequence is
  accepted knowingly and recorded as a risk below.
- **`/doctor` seeds the candidate list but does not bind it.** The human runs it on the
  repo before the session. Its findings are one input among several; it cannot know which
  of the-loop's prescriptions are pipeline protocol rather than model coaching.

### Findings already established

These came out of the interview and do not need re-deriving:

- **`plugin/skills/code-quality/` is orphaned.** 5 files, 299 lines, referenced by no
  agent definition, no skill, not the Rust CLI, and not `docs/architecture.md`. It can
  only ever fire through description auto-trigger. Simultaneously, its content —
  test discipline, no-TODOs, footprint rules — is duplicated *inline* into `build.md`,
  `drive.md`, and `validate.md`. That is shift #3 and shift #4 failing in opposite
  directions at the same time, and it is checkable by inspection rather than judgment.
- **Imperative density is uneven and measurable.** `operate/SKILL.md` carries 22
  never/always/must hits in 84 lines and closes with a literal `## Never do` list;
  `build.md` has "The lines that never move"; `constitution.md` has "Banned reasoning
  moves." These are the article's shift-#1 shape.
- **Parts of the-loop are already on the new side of the line.** `constitution.md:35`
  reads "Match the house idiom — read the neighboring code and write more of *it*", which
  is close to verbatim the replacement text Claude Code itself adopted. The pass is
  sharpening an existing direction, not reversing one.
- **The runtime prompt assembly is already lean.** `execution-pipeline.js` builds prompts
  mostly from structured labels and criteria lists rather than prose — close to what
  shift #2 asks for. Its prescriptive leaks are small and duplicative ("footprint (the
  lease — stay inside it)", "apply the test-gated merge policy") and duplicate `build.md`.
- **Four rules have mechanical detectors that will go unused.** `eval/traps/` contains
  `trap-a-red-test`, `trap-b-gamed-test`, `trap-c-truncation`, and `trap-d-footprint`,
  which map one-to-one onto `build.md`'s "lines that never move." They are the closest
  thing to the "demonstrable failure mode" evidence the article demands, and the decision
  not to run eval means they will not be consulted.

## Deferred

- **Where agent-definition authoring doctrine lives.** `write-skills` covers skills. It is
  not settled whether subagent definitions get a section there, a sibling surface, or
  something else. Design decides.
- **What happens to `code-quality`.** Wire it in explicitly, fold it into the surfaces
  that duplicate it, or leave it auto-triggering — the shape of the fix is a design call.
- **Review ordering.** Which surfaces are read first, and whether the pass batches by
  file or by principle.
- **Whether the trimmed prescriptions are deleted or relocated.** Some cut text may
  belong in a reference file under progressive disclosure rather than in the bin.
- **How `/doctor` output is reconciled** when it disagrees with a human call.

## Assumptions

Nothing here was confirmed; each is proceeding on belief.

- **That the-loop's prescriptiveness is actually costing agent performance today.** This
  is the human's stated concern and the premise of the whole intake, and it is
  *unverified*. No eval was run, no regression was observed, and no calibration signal
  isolates it. The article's 80% result is Anthropic's, on Claude Code's system prompt,
  against their coding evals — not on this repo's surfaces. The pass may find that most
  of the-loop's prescription is fine.
- That the article's five shifts generalize from a product system prompt to
  plugin-authored subagent definitions and skills.
- That `grok-4.5` and Haiku 4.5 tolerate frontier-bar prescription levels, per the
  uniform-trim decision.
- That the current calibration baseline (78% overhead / 22% build lifetime) reflects real
  overhead cost, despite 8 of 17 runs overlapping and the attribution being approximate.
- That `/doctor` in the installed Claude Code version implements the audit the article
  describes.

## Constraints

- **No pipeline.** Human-attended session only; every trim is adjudicated live.
- **Worktree isolation.** Per the project's git hygiene rule, changes are made in a
  worktree, not the main checkout, and merged back to `main` directly on approval — no
  GitHub PR.
- **No behavior changes.** Prose and structure of agent-facing surfaces only. The Rust
  CLI's logic, the workflow scheduler, and the artifact schemas are untouched.
- **Surfaces stay self-contained.** the-loop's existing authoring rule holds: no
  references to ADRs or internal design docs from shipped commands and skills.
- **A `write-skills` pass runs before anything lands**, per the project's standing rule
  for surface changes.

## Done looks like

1. **Every in-scope surface is adjudicated.** All 5 agent definitions, all 16 skill files,
   `CLAUDE.md`, and the runtime prompt assembly have been read against the five shifts,
   and every candidate surfaced to the human received an explicit keep, cut, or rewrite
   ruling. No file is skipped and no candidate is left undecided.
2. **Doctrine reflects the calls that were made.** the-loop's authoring guidance carries
   the reasoning from this pass in enough detail that a future surface author reaches the
   same density without re-reading the article.
3. **Every prescription has exactly one authoritative home.** No instruction appears in
   two surfaces; no surface is orphaned from everything that should reference it. This is
   verifiable by inspection.
4. **A self-hosted run completes clean on the trimmed surfaces.** the-loop runs at least
   one real feature end-to-end — plan, build, and validate all behaving, agents returning
   parseable reports, no new blocks attributable to the trim. This is the only empirical
   check in scope, and it catches gross breakage that reading cannot.

## Risks

- **The four trap-guarded rules are the highest-risk cuts and have no safety net.**
  Test-weakening, test-aware implementations, truncation, and footprint excursions are
  the failure modes with existing mechanical detectors. With eval out of scope, cutting
  any of them is an uninstrumented bet that will surface, if at all, as a bad build in a
  future run.
- **The pass is self-referential.** Editing `build.md` and `validate.md` changes the
  instructions that future build and validate agents read, including any that later work
  on the-loop itself. A bad trim degrades the tool that would otherwise catch it.
- **Judgment-only adjudication is not reproducible.** Deliverable #2 is the mitigation,
  and it is only as good as the reasoning actually written down.
