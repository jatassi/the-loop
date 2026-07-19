# Survey: Structured Agentic Dev-Lifecycle Frameworks on Claude Code (July 2026)

Commissioned by the competitive-eval Define session (2026-07-19) to confirm or
swap the provisional rival picks for the head-to-head eval. Conducted by the
survey agent: five parallel researchers (one per target plus a catch-all for
newer entrants), followed by a verification pass re-fetching primary sources
for every load-bearing claim. Primary-source discipline: raw template/command/
source files and registry APIs over READMEs, READMEs over blog posts.
Secondary-source claims flagged inline. Reference point: the-loop
(define→design→build→validate→release→operate).

**Headline recommendation: pick GitHub Spec Kit and BMAD-Method as the two
rivals. OpenSpec is the designated alternate.**

---

## Ranked shortlist

### 1. GitHub Spec Kit (github/spec-kit) — PICK

- **Maintenance:** Extremely active — v0.13.0 released 2026-07-17 (two days
  before this survey), essentially daily releases through July
  ([CHANGELOG](https://raw.githubusercontent.com/github/spec-kit/main/CHANGELOG.md)).
  Maintained by GitHub itself; no deprecation signals.
- **Adoption:** ~122k stars, ~10.9k forks, 195 releases, 1,462 commits
  ([repo](https://github.com/github/spec-kit)) — the most recognizable name in
  this space by a wide margin.
- **Lifecycle coverage:** Ten commands verified against `templates/commands/`:
  core `/speckit.constitution`, `/speckit.specify`, `/speckit.plan`,
  `/speckit.tasks`, `/speckit.taskstoissues`, `/speckit.implement`,
  `/speckit.converge`; optional `/speckit.clarify`, `/speckit.analyze`,
  `/speckit.checklist`. Maps to define→design→build plus a lightweight
  validate (`analyze` = static cross-artifact consistency; `converge` = diff
  codebase vs spec/plan/tasks and append gap-tasks). **No release or operate
  coverage.**
- **Claude Code first-class? Yes — confirmed from source, not marketing.**
  `src/specify_cli/integrations/claude/__init__.py` defines
  `ClaudeIntegration(SkillsIntegration)` with `"name": "Claude Code"`,
  installing `.claude/skills/speckit-<name>/SKILL.md` files
  ([source](https://raw.githubusercontent.com/github/spec-kit/main/src/specify_cli/integrations/claude/__init__.py)).
  Note it now defaults to **Skills mode**, not `.claude/commands` prompt
  files; skills are both user-invocable and model-auto-invocable.
- **Invocation:** `uv tool install specify-cli`, then
  `specify init <project> --integration claude` generates files into the repo.
  Not a marketplace plugin — a code generator whose output Claude Code picks
  up natively.
- **Headless:** Realistic. `/speckit.specify` caps itself at 3
  `[NEEDS CLARIFICATION]` markers and is instructed to "make informed
  guesses"; `/speckit.clarify` is optional and skippable. **One hard gate:**
  `/speckit.implement` checks `checklists/*.md` and on incomplete items will
  "**STOP** and ask: 'Some checklists are incomplete. Do you want to proceed
  with implementation anyway? (yes/no)' Wait for user response" (verified
  verbatim in
  [implement.md](https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/implement.md))
  — if checklists are absent it proceeds silently, so a scripted eval simply
  skips `/speckit.checklist` or completes checklists programmatically.
- **Gotchas:** `.specify/` + `specs/<NNN-name>/` layout; git-branch coupling
  is now **opt-in** (feature state lives in `.specify/feature.json`,
  overridable via `SPECIFY_FEATURE_DIRECTORY` — good news for scripting);
  constitution is soft-required ("IF EXISTS"); extension hooks in
  `.specify/extensions.yml` can inject mandatory pre-steps, so run a clean
  install.

### 2. BMAD-Method (bmad-code-org/BMAD-METHOD) — PICK

- **Maintenance:** v6 stable, **v6.10.0 published 2026-07-03** (npm registry
  API), near-daily commits through mid-July including the survey date; minor
  releases every 3–5 weeks
  ([repo](https://github.com/bmad-code-org/BMAD-METHOD),
  [npm](https://www.npmjs.com/package/bmad-method)).
- **Adoption:** ~50.8k stars (live page); Discord community cited at "15,000+
  developers" (secondary, unverified); large ecosystem (TEA test-architect
  module, VS Code extension, multiple third-party Claude Code plugin
  wrappers).
- **Lifecycle coverage:** The broadest methodology surveyed — four phases per
  the official
  [workflow-map](https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/docs/reference/workflow-map.md):
  Analysis (brainstorming/research/product-brief), Planning (`bmad-prd`,
  `bmad-ux`), Solutioning (`bmad-architecture`,
  `bmad-create-epics-and-stories`, `bmad-check-implementation-readiness`),
  Implementation (`bmad-create-story`, `bmad-dev-story`, `bmad-code-review`,
  `bmad-correct-course`, `bmad-retrospective`), with named persona agents
  (Analyst/PM/Architect/Dev/UX/Tech-Writer). The map itself states it
  "terminates at retrospectives… No release, deployment, or operational
  phases are included" — release-gate authority exists only in the opt-in TEA
  enterprise module.
- **Invocation:** `npx bmad-method install --yes --modules bmm --tools
  claude-code` — Claude Code is an explicitly first-class tool target;
  installs `_bmad/` (agents/workflows/config) + `_bmad-output/` and generates
  `bmad-*` skills/slash commands. No official marketplace plugin (issue
  [#746](https://github.com/bmad-code-org/BMAD-METHOD/issues/746) open);
  install is fully flag-driven and CI-friendly.
- **Headless:** Newly credible — the finding that changes BMAD's viability.
  **`bmad-dev-auto`** (no approval checkpoint; status written to story
  frontmatter) plus **`bmad-loop`**
  ([repo](https://github.com/bmad-code-org/bmad-loop), v0.8.1, 2026-07-06): a
  deterministic Python orchestrator — "No LLM in the control loop. Story
  selection, retry budgets, gates, and completion checks are code, not
  prompts" — with `claude` as the reference CLI
  (`bmad-loop init --cli claude; bmad-loop run`). It halts only at six named
  checkpoints (ambiguous intent, capability gaps, review non-convergence
  after 5 iterations, failed acceptance criteria, etc.). Party mode gained
  `--non-interactive`. **Honest caveat:** the *planning* workflows (PRD,
  architecture, elicitation) are still numbered-menu interactive by design; a
  scripted end-to-end run either pre-seeds planning artifacts, drives
  elicitation with canned answers, or scopes the eval so BMAD's headless leg
  starts at stories. Workable, but the main eval-engineering cost of picking
  BMAD.
- **Gotchas:** v6 layout is `_bmad/` + `_bmad-output/` — most tutorials
  online describe the obsolete v4 `docs/prd.md`/`.bmad-core/` layout; pin
  version with `--channel`/`--pin`. Requires Node 20.12+, Python 3.10+, and
  `uv`. Web-Bundles (planning in Gemini Gems/GPTs) exist but are optional —
  everything runs IDE-side on Claude Code. Open Claude Code friction bugs
  (#773, #1152) worth pre-testing.

### 3. OpenSpec (Fission-AI/OpenSpec) — strongest alternate

- 61.5k stars, v1.6.0 (2026-07-10), pushed the day before the survey
  ([repo](https://github.com/Fission-AI/OpenSpec)). Workflow: `/opsx:explore
  → propose → apply → archive` plus `/opsx:verify`, `/opsx:ff`, etc.;
  `claude` is a supported tool ID installing to `.claude/skills/`, and the
  CLI documents `--json`, `--yes`, `--no-interactive`, `--force` "for
  programmatic use by AI agents and scripts"
  ([docs/cli.md](https://github.com/Fission-AI/OpenSpec/blob/main/docs/cli.md))
  — arguably the best headless posture of the group. **Why #3, not #2:** it
  deliberately rejects phase-gating ("fluid not rigid… no rigid phase gates")
  and stops before validate/release/operate, so it's a weaker match on
  comparability — a head-to-head would partly become "state machine vs
  artifact graph." Swap it in if BMAD's interactive planning proves too
  costly to script.

### 4. cc-sdd (gotalab/cc-sdd) — best structural match, too small

- 3.6k stars, v3.0.2 (2026-04-13), active
  ([repo](https://github.com/gotalab/cc-sdd)). Kiro-style chain —
  `/kiro-spec-init → /kiro-spec-requirements` (EARS) `→ /kiro-spec-design →
  /kiro-spec-tasks → /kiro-impl` — where `/kiro-impl` is a long-running
  autonomous loop (fresh TDD implementer per task, independent reviewer,
  auto-debug after two rejections, "safe to re-run after interruption").
  Installed via `npx cc-sdd@latest --claude-skills` (the old `--claude` flag
  is deprecated). Architecturally the closest thing to the-loop that exists,
  and Claude-Code-first — but at 3.6k stars it fails outside-reader
  credibility, and its literal `claude -p` behavior is undocumented. Keep as
  a wildcard third arm for a same-genus comparison.

### 5. claude-task-master (eyaltoledano/claude-task-master) — fails comparability

- ~27.9k stars; v0.43.1 (2026-03-31, npm registry — slowing cadence, Feb→Mar
  was the longest gap in a year). Excellent headless machinery: scriptable
  CLI, a no-API-key **`claude-code` provider** riding the local CLI's auth
  ([docs](https://github.com/eyaltoledano/claude-task-master/blob/main/docs/examples/claude-code-usage.md)),
  and `task-master loop` (v0.41) running Claude Code one-task-per-iteration
  in a Docker sandbox for unattended runs. But it is a **dependency-aware
  task-orchestration layer, not a lifecycle methodology**: it assumes a PRD
  exists, has no define/design discipline of its own, and ends at "task
  marked done" — no validate/release/operate. Gotchas if ever used: a stray
  `ANTHROPIC_API_KEY` env var silently overrides the `claude-code` provider
  ([issue #1256](https://github.com/eyaltoledano/claude-task-master/issues/1256));
  MIT + Commons Clause license; Hamster cloud upsell (stay in Solo mode).

### 6. Agent OS (buildermethods/agent-os) — no longer comparable; drop

- v3.0 (2026-01-20) was a **deliberate retreat**: it deleted `write-spec`,
  `create-tasks`, `implement-tasks`, and `orchestrate-tasks` outright,
  "deferring to modern AI tools for the parts they now handle better"
  ([CHANGELOG](https://raw.githubusercontent.com/buildermethods/agent-os/main/CHANGELOG.md)).
  What remains is 5 commands for standards + product docs + spec-shaping,
  every one built on sequential ask-the-user loops ("Wait for user response
  before proceeding"), with `/shape-spec` hard-gated on Claude Code Plan
  Mode. 5.1k stars, ~2.5 months without commits, and an open "Is Agent OS
  being maintained?" community thread. Its v3 changelog is still worth
  reading as a thesis statement (see synthesis).

### Dismissed from the catch-all

**SuperClaude** (23.6k stars) — behavioral-instruction/persona layer, no
owned artifact state graph; not a lifecycle engine. **ccpm** (8.3k stars) —
stale since March 2026, removed its scriptable `/pm:*` interface.
**claude-flow/Ruflo** (65k stars, renamed Feb 2026) — best-documented
headless CLI surveyed (`--headless`, `--output-format json`, literal
`claude -p` worker examples) but a swarm-orchestration platform with a heavy
Rust/WASM footprint; its SPARC lifecycle is secondary. Include only for a
deliberate "single-track discipline vs swarm" third axis. **Anthropic's
official plugin marketplace** — point-solution plugins only, no unified
lifecycle plugin. **Provectus AWOS** — philosophically the closest analog to
the-loop (state-file-driven, MCP hooks into CI/monitoring) but at 62 stars
fails credibility.

---

## Why Spec Kit + BMAD as the two rivals

- **Spec Kit** maximizes fairness-of-comparison and recognizability —
  GitHub-official, ~122k stars, daily releases — while being genuinely
  full-structure on define→design→build→validate and cleanly headless (one
  known, avoidable gate). It is the framework an outside reader will demand
  a comparison against.
- **BMAD** is the only rival with methodology ambition matching (arguably
  exceeding) the-loop's — roles, gates, review, retrospectives — and as of
  June–July 2026 it finally has a real headless story (`bmad-dev-auto` +
  `bmad-loop`) with Claude as the reference CLI. It also gives the eval a
  useful contrast pair: Spec Kit's artifact-pipeline philosophy vs BMAD's
  persona/ceremony philosophy, with the-loop positioned between them.
- Neither rival covers **release/operate** — no surveyed framework does in
  core (BMAD's TEA release-gates are a bolt-on). The eval rubric must score
  those phases "not attempted" rather than zero, or the comparison will look
  rigged.

## Tablestakes across the field (ubiquity-ranked)

1. **Spec → plan/design → tasks → implement as distinct artifacts on disk**
   (Spec Kit, BMAD, cc-sdd, OpenSpec; the-loop: has it).
2. **Distribution as generated `.claude/skills` or commands via a CLI
   installer**, not marketplace plugins (Spec Kit, OpenSpec, cc-sdd, BMAD;
   the-loop is an actual plugin — a differentiator worth noting in the eval
   writeup).
3. **Named headless/non-interactive mode** — became table stakes in the last
   year (Spec Kit's guess-don't-ask spec rules, OpenSpec's
   `--no-interactive`, BMAD's dev-auto/loop, task-master's `loop`, Ruflo's
   `--headless`).
4. **Optional-not-mandatory clarification/quality gates** with documented
   skip paths (Spec Kit clarify/checklist, cc-sdd validate-gap, BMAD's six
   halt conditions).
5. **Lifecycle ends at "code done"** — release/operate absent everywhere
   (the-loop's release→operate phases are genuinely differentiating).

## Differentiators worth stealing

- **Spec Kit `/speckit.converge`:** repeatable codebase-vs-spec drift diff
  that appends gap-tasks — a ready-made validate-phase primitive.
- **BMAD's deterministic outer loop:** frontmatter status as the control
  channel, orchestrator as plain code polling files, six named halt
  conditions — directly applicable to making the-loop's phases resumable and
  headless.
- **task-master's complexity-scored expansion** (1–10 score gates
  decomposition) and dependency-graph `next` selection.
- **cc-sdd's per-task adversarial trio** (fresh implementer / independent
  reviewer / auto-debugger).
- **Agent OS's `index.yml` standards router** — one-line-per-file index
  scanned before loading full standards into context.

## Closing synthesis

The field bifurcated in the past year. One pole (Agent OS v3, arguably
OpenSpec's anti-phase stance) concluded that Claude Code's native Plan Mode
and task tracking made heavyweight scaffolding redundant and retreated to
thin context-injection. The other pole (Spec Kit, BMAD, cc-sdd,
task-master's `loop`) doubled down on structure — but moved the enforcement
out of prompts and into deterministic code and file-state, precisely to make
loops unattended-safe. the-loop sits on the second pole, and the
eval-relevant implication is that headless operability is no longer a
nice-to-have differentiator but the axis the leaders compete on; the-loop's
open flank is that its release→operate phases have no rival to be measured
against — both its differentiator and the part of the rubric that must be
scored asymmetrically.
