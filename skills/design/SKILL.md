---
name: design
description: Design a project from its brief — system narrative, feature graph, and per-feature design docs. Use when a brief is ready to become a design, the user wants to decide what to build and in what order, or /the-loop routes to Design.
---

# Design — brief → design artifacts

Turn the brief into the project's living design. This is the last human-gated phase
before autonomous execution — ambiguity that survives it is inherited by every
downstream agent. Three artifacts come out (ADR-0037):

- `docs/architecture.md` — the **system** narrative: what this is, architecture,
  boundaries, cross-feature interface contracts, non-goals, error posture — plus two
  recorded bindings under exact headings: `## Validation runbook` (bring-up / exercise /
  teardown commands; "none" is a recorded opt-out) and `## Release runbook` (ready
  checks, deploy commands, health check, rollback path).
- `docs/feature-graph.md` — the machine feature graph, one ```yaml block under
  `## Feature graph`:

  ```yaml
  design_version: 1
  features:
    - id: kebab-case-stable-handle
      title: one line
      status: designed          # proposed | designed | validated | shipped — durable states only
      depends_on: [other-id]    # build-order edges; also draw one when a feature
                                # designs better knowing another's final shape
      acceptance:
        - an observable, binary criterion (Given/When/Then is the default shape)
  ```

  A `proposed` record — recorded intent parked on the backlog, not yet designed —
  needs only `id` and `title`; acceptance is Design's output, not intake's, so it's
  optional (a sketch is welcome, not demanded) until you promote it here.

- `docs/designs/<id>/design.md` — one design doc per feature, written for the
  stateless agent who wasn't in the room: what it is, how it fits the architecture,
  the interfaces it touches (quote the relevant contract shapes), constraints, and
  anything a builder or validator would otherwise have to guess. This doc IS the
  feature's context slice — self-contained, a few KB, no required reading list.

## How to get there

1. **Read the intake's brief** (`docs/briefs/<slug>.md`, the slug Define chose for
   this intake; run `define` first if none; if several briefs are plausible, ask
   the human which intake is being designed). Deferred
   items are your question list; Decided items are settled. If a design already
   exists, you are amending it: fold new features into the graph, bump
   `design_version`.
2. **Interview the architecture into shape** with the `interview` skill. Survey before
   you invent — cite what exists before proposing custom builds. On a repo with
   existing code, ground the design in the code that's there: feature docs quote
   real interfaces from the source, never imagined shapes — the design artifacts are
   where comprehension of the existing system is paid once and cached. For a
   contested, hard-to-reverse choice, sketching 2–3 alternatives with subagents is
   available — a judgment call, not a mandate.
3. **Slice features — the human owns the knife.** A feature is a vertical slice:
   independently validatable and shippable. Order for a walking skeleton — any prefix
   of the build order is a viable system. Extra is a failure like missing.
4. **Capture as you go**: a pinned term goes to `docs/glossary.md` —
   but first ask "does a standard industry term already name this?"; if yes, use it
   and record nothing (the ratchet). A hard-to-reverse, surprising, real-trade-off
   decision gets offered as an ADR in `docs/adr/`. All three criteria or no record.
5. **Lint**: `node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js" check` until it prints OK.
   Acceptance criteria are the validator's only brief — observable, binary, vague
   adjectives made measurable or cut.
6. **Gate**: present the files you created/modified **FIRST**, then get explicit approval. 
   For a large or contested design, offering a fresh-context reader test first is a good 
   judgment call. Commit the artifacts as one commit. `/the-loop` now sees a configured 
   project.
