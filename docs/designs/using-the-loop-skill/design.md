# using-the-loop-skill — bundled orientation skill for consumer sessions

## What it is

A bundled skill, `using-the-loop` (invoked `the-loop:using-the-loop`), that orients
the **ordinary dev-session agent** in a consumer project: a session working on
anything — bugfix, question, refactor — that may never mention the loop. It is the
root of the loop's progressive-disclosure documentation: the skill **description**
is tier 0 (injected into every session for free by the plugin mechanism), the
**body** is tier 1 (loaded only on trigger), and the body's map points at tier 2 —
the CLI as live oracle and the consumer project's own artifacts. No new mechanism
is built; the feature rides the existing skill machinery and the existing CLI.

Not the audience: the main-loop orchestrator and pipeline subagents (they get real
instructions from phase skills and task contracts — for them the description must
merely be instantly dismissible). Out of scope entirely: non-Claude agents /
AGENTS.md discovery (a later intake; SKILL.md is plain markdown on disk, so the
door stays open), any CLAUDE.md/AGENTS.md pointer or injected primer, onboard/CLI
changes, and trigger evals (rejected at Define; description efficacy is an
accepted-unverified assumption).

## The description — recorded interface (tier 0)

The frontmatter description is this text, verbatim (write-skills pass may polish
phrasing, never structure — the three trigger families and the concrete use-cases
are load-bearing; "loop-shaped"-style coinages are banned here because the reader
hasn't loaded any loop vocabulary yet):

> Orient in a project run with the-loop. Use when starting a new feature or idea,
> fixing a reported bug, preparing a release, or deciding what to build next;
> before creating, editing, or deleting the loop-owned `docs/` artifacts
> (`feature-graph.json`, `briefs/`, `designs/`, `bugs/`, …); or when asking how
> this project is set up, organized, or developed.

Budget: ≤ 400 characters (~75 tokens). The three trigger families, in order:
concrete entry moments, the protective moment (names real paths because path
mentions in context are what fire a description mid-refactor), orientation
curiosity.

## The body — tier 1, three moves, ≤ 150 lines (target ~100)

Generic across all consumer projects: no project-specific content — specifics come
from the CLI at runtime and the project's own artifacts. The three moves, in order:

**Move 1 — what this project runs, and what the loop owns.** One short paragraph:
the project is developed with the-loop, which moves ideas through
define → design → build → validate → release (bugs enter via diagnose; deployed
instances are operated via operate). That sentence is the phase model — no deeper
phase explanation belongs in this skill. Then the loop-owned state rule, with the
canonical path list:

| Path | What it is |
|---|---|
| `docs/feature-graph.json` | the machine feature graph — **tool-owned JSON, never hand-edit**; read via `the-loop list`, statuses via the loop |
| `docs/architecture.md` | system narrative + recorded bindings (validation, release, operations) |
| `docs/briefs/` | Define outputs — one brief per intake |
| `docs/designs/<id>/design.md` | one design doc per feature |
| `docs/glossary.md` | pinned project vocabulary |
| `docs/adr/` | architectural decision records |
| `docs/bugs/` | RCA docs from diagnose |
| `docs/runbooks/<topic>.md` | operational runbooks |
| `docs/validation/` · `docs/releases/` · `docs/calibration/` · `docs/adapters/` | validation procedures, release reports, run calibration, bound-store adapters |

The rule the table carries: `feature-graph.json` is written only by the loop's
tooling; the prose artifacts are amended through their owning phases — don't
casually rewrite, rename, or delete any of these, and don't "clean up" paths that
look stale.

**Move 2 — engaging the loop.** `/begin` is the one entry point: it states where
the project stands and proposes the next action; `/begin <phase>` jumps straight to
a phase. The body names no other bundled skill — begin routes; enumerating phase
skills here would rot and double-instruct.

**Move 3 — the map to deeper tiers.** Live state comes from the CLI, not from
prose that can go stale: `the-loop status` (`--json` for machine orientation),
`the-loop list` (the parsed graph), `the-loop hooks-list` (the resolved
configuration), `the-loop models-list` (role→model bindings). The project's story
lives in its own artifacts: `docs/architecture.md` for the system narrative,
`docs/designs/<id>/design.md` for any feature's design, `docs/glossary.md` for
vocabulary, git log for history. Deeper engagement is `/begin`.

`references/` files: **zero, decided.** The suspected gap (phase model,
vocabulary) is covered by move 1's one-line phase sequence plus the consumer
project's own glossary. The skill directory ships SKILL.md and nothing else.

## Constraints on authoring

- Loop surface authoring rules: self-contained, no ADR numbers or the-loop-internal
  document references anywhere in the skill (consumer projects don't receive them);
  the write-skills pass runs before landing.
- Budget enforcement is measurement, not mechanism: the ceilings are acceptance
  criteria the validator measures (chars/lines); no standing lint rule is added.
- Every CLI command and `docs/` path the body names must exist — commands verified
  against the shipping binary's help, paths against what the phase skills actually
  write (the table above is the verified list as of design time).

## The dedup sweep

After authoring, sweep these surfaces once and trim only clear duplication:

- **`begin`, `onboard`, `configure` SKILL.md** — descriptions checked for
  project-orientation trigger language (double-fire risk with the new
  description); bodies checked for orientation prose that now has a better home.
- **`the-loop --help`** (and subcommand help) — top-level text checked the same
  way.

The phase skills (define, design, diagnose, release, operate) trigger on
phase-specific asks and are out of the sweep. No restructuring: trims only.

## How it fits

Pure addition to `plugin/skills/` — no CLI change, no workflow change, no
architecture boundary or cross-feature contract touched (architecture.md narrative
unchanged). Depends on nothing unbuilt; the plugin-dir layout it lands in shipped
with plugin-dir-restructure.
