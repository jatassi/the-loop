# Brief: using-the-loop skill

## Intent

Agents landing in a project set up with the-loop need orientation: know the loop
exists, don't stomp its tool-owned state, route loop-shaped work through `/begin`,
and find deeper detail only when they need it. The loop's functionality is varied
and an excellent shape for progressive disclosure — the ambient cost must be near
zero because it is paid in every single session, forever. The original idea was an
injected markdown primer pointed at from CLAUDE.md/AGENTS.md; the interview pivoted
to a bundled skill, which is the Claude-native disclosure mechanism: the description
is injected into every session for free, the body loads only on trigger.

## Users

Agents. Specifically the **ordinary dev-session agent** — a human working with
Claude on anything in a consumer project (bugfix, question, refactor) who may never
mention the loop. That agent is the sole design target. The main-loop orchestrator
and pipeline subagents get their real instructions from skills and task contracts;
for them the skill must merely be instantly dismissible. The human beneficiary is
the project owner whose loop-owned state stays intact.

## Scope envelope

Full progressive-disclosure organization of the-loop's agent-facing documentation,
with the new skill as the root node — but the decisions concentrated the build into
one deliverable: the bundled `using-the-loop` skill, plus a dedup sweep of existing
loop surfaces. Covers both documentation corpora: the plugin's shipped surfaces
(skills, CLI) and the consumer project's generated artifacts (`docs/` tree).

**Out of scope:**
- Non-Claude agents / AGENTS.md cross-tool discovery — noted for a later intake;
  SKILL.md being plain markdown on disk keeps that door open at near-zero cost.
- Restructuring or rewriting existing skills (`begin`, `onboard`, …) beyond
  trimming clear duplication found by the dedup sweep.
- Any injected primer file, CLAUDE.md/AGENTS.md pointer, or onboard/CLI changes.

## Decided

- **Vehicle: a bundled skill, `using-the-loop`** (invoked `the-loop:using-the-loop`),
  fully replacing the injected-primer idea. Why: plugin skill descriptions are
  already injected into every session at no marginal mechanism cost, and the
  description→body→references shape *is* progressive disclosure — no new machinery.
- **No ambient CLAUDE.md/AGENTS.md line survives; the skill is the whole
  deliverable.** Contested: the interviewer flagged that protective guardrails
  ("don't hand-edit `docs/feature-graph.json`") are needed exactly when the agent
  doesn't realize the loop is relevant, and trigger text is a weak carrier for
  prohibitions. The human chose full replacement anyway; the description must carry
  the protective trigger family.
- **Tier structure.** Tier 0: the description (always injected). Tier 1: the skill
  body — orientation, engagement, and the map. Tier 2: (a) the CLI as live oracle
  (`the-loop status --json`, `hooks-list`, `models-list`, `list`) — documentation
  that would go stale is instead a command that can't; (b) the consumer project's
  own artifacts — the body teaches the *shape* of `docs/`, each artifact
  self-describes. Authored `references/` files start at zero and are added only
  when authoring proves a gap neither the CLI nor an artifact covers.
- **Two corpora, two homes.** Plugin surfaces are the shipped tiers; project
  artifacts are per-project tiers. Consumer projects receive only the plugin —
  the-loop repo docs (architecture, glossary, ADRs) never ship, so no tier may
  point at them.
- **Description trigger families (three, nothing else):** loop-shaped work
  arriving; an agent about to touch loop-owned `docs/` state; "how is this
  project set up / organized" curiosity.
- **Body content (three moves):** this project runs the-loop and these paths are
  tool-owned — don't hand-edit; loop-shaped work enters via `/begin` (the one entry
  point — the body does not enumerate phase skills, begin routes); the tier-2 map.
- **Additive with dedup.** Author the skill without touching anything; then sweep
  the other loop surfaces once and trim only clear duplication of orientation
  content that now has a better home.
- **No trigger evals.** Contested: the interviewer recommended a six-scenario
  trigger eval set as the only empirical check available; the human rejected it.
  The done bar is static checks only.
- **Name: `using-the-loop`**, kept despite the qualified-form stutter
  (`the-loop:using-the-loop`); self-describing where it matters. Write-skills pass
  may veto at authoring time.
- **Does this already exist:** no external product overlaps; the design *is* the
  lean-on-what-exists answer — it rides the existing Claude Code skill mechanism
  and the existing CLI rather than building any new surface.

## Deferred

Named for Design so they aren't lost:

- Exact description wording — how the three trigger families compress into ≤75
  tokens.
- Body structure and content selection within the three moves; which CLI commands
  and `docs/` paths make the map.
- Whether any `references/` file survives gap-proving (the phase-model/vocabulary
  explainer is the likely single candidate).
- How the budget ceilings are enforced — write-skills judgment vs a mechanical
  check.
- The dedup sweep's concrete targets — which surfaces (begin, onboard, CLI help)
  hold duplicated orientation content and what gets trimmed.

## Assumptions

Proceeding without verification:

- The skill description alone can carry protective triggering reliably enough —
  explicitly unverified, since trigger evals were rejected and no ambient guardrail
  line exists. Accepted risk.
- Plugin skill descriptions are injected into every session (including subagent
  sessions) in consumer projects with the plugin enabled, and a ≤75-token
  description is a tolerable ambient cost there.
- The existing CLI surface is stable enough to serve as tier 2a without the skill
  needing per-release edits.

## Constraints

- Description ≤ **75 tokens**. Body ≤ **150 lines** hard, ~100 target.
- Loop surface authoring rules apply: self-contained, no ADR/internal-doc
  references, write-skills pass before landing.
- No new mechanisms: Claude Code skills + the existing `the-loop` CLI only.
- Nothing may depend on the-loop repo documents that don't ship with the plugin.

## Done looks like

- A bundled skill exists under the plugin's skills, discoverable in every consumer
  session as `the-loop:using-the-loop`.
- Its description fits the token ceiling and covers exactly the three trigger
  families.
- Its body fits the line ceiling and delivers the three moves; every command and
  path named in it is verified against the shipping CLI and artifact layout.
- Zero authored `references/` files, unless a gap was proven and recorded during
  authoring.
- The dedup sweep over existing loop surfaces is done and clear duplication is
  trimmed.
- No changes to CLAUDE.md/AGENTS.md templates, onboard, or the CLI were needed.
- The write-skills pass has been run and passed.
