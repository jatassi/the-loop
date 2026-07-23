---
name: design
description: Design a project from its brief — system narrative, feature graph, and per-feature design docs. Use when a brief is ready to become a design, the user wants to decide what to build and in what order, or /begin routes to Design.
---

# Design — brief → design artifacts

Turn the brief into the project's living design. This is the last human-gated phase
before autonomous execution — ambiguity that survives it is inherited by every
downstream agent. Three artifacts come out (ADR-0037):

- `docs/architecture.md` — the **system** narrative: what this is, architecture,
  boundaries, cross-feature interface contracts, non-goals, error posture — plus three
  recorded bindings under exact headings: `## Validation procedure` (bring-up / exercise /
  teardown commands; "none" is a recorded opt-out), `## Release runbook` (ready
  checks, deploy commands, health check, rollback path), and `## Operations toolkit`
  (how this project's deployed instances get operated). The toolkit interview asks:
  where instances run and how an agent reaches them (deployment targets); what an
  agent can do there, each capability tagged `read` or `mutate` at recording time so
  safety is never judged at runtime; and **"how will you know something's wrong?"**
  — observability, where each recorded apprisal path names the runbook it routes to
  ("the human notices" is a legal answer); then runbook pointers (default
  `docs/runbooks/<topic>.md`, held loosely) and a never-do list of project-specific
  prohibitions. Offer a recommendation fitted to the project's nature — "skip" is a
  legal recommendation for a toy, and whole-section "none" is a recorded opt-out
  same as the other two bindings. These interviews are
  **confirm-or-fill**: if a section already carries content — written by onboard's
  brownfield assess-and-fill or a prior Design pass — read it back and confirm it's
  still accurate rather than re-asking from scratch; interview only the gaps a
  section is missing. Only a genuinely empty section gets the full interview.
- `docs/feature-graph.json` — the machine feature graph, plain JSON with a
  top-level `design_version` integer and a `features` array (snake_case keys —
  the binary rejects camelCase with unknown-key errors):

  ```json
  {
    "design_version": 1,
    "features": [
      {
        "id": "kebab-case-stable-handle",
        "title": "one line",
        "status": "designed",
        "depends_on": ["other-id"],
        "acceptance": [
          "an observable, binary criterion (Given/When/Then is the default shape)"
        ]
      }
    ]
  }
  ```

  `status` is one of `proposed | designed | validated | shipped` — durable states
  only. `depends_on` holds build-order edges; also draw one when a feature designs
  better knowing another's final shape. A `proposed` record — recorded intent
  parked on the backlog, not yet designed — needs only `id` and `title`;
  acceptance is Design's output, not intake's, so it's optional (a sketch is
  welcome, not demanded) until you promote it here. `the-loop check` validates
  schema, edges, and round-trip; `set-status` and the emitter canonicalize
  formatting (2-space indent), so follow any hand-edit with `the-loop check`.

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

   The moment the stack is chosen, capture the settings-side project hooks that only
   exist once a stack is known — test harness, lint, pre-commit — via
   `the-loop hooks-set <family> <layer>
   <json-value>` (the `testHarness`, `lint`, and `precommit` families). This is where
   the **lint-policy elicitation** lives: recommend the stricter policy for the
   chosen stack and land it in the project's real lint config — never a parallel
   policy blob; `hooks-set lint` binds the run command only.
3. **Slice features — the human owns the knife.** A feature is a vertical slice:
   independently validatable and shippable. Order for a walking skeleton — any prefix
   of the build order is a viable system. Extra is a failure like missing. Consult
   `docs/calibration/index.md` when present as an input to how features get sliced
   (smaller/more numerous vs fewer/larger, based on what past runs showed).
4. **Capture as you go**: a pinned term goes to `docs/glossary.md` —
   but first ask "does a standard industry term already name this?"; if yes, use it
   and record nothing (the ratchet). A hard-to-reverse, surprising, real-trade-off
   decision gets offered as an ADR in `docs/adr/`. All three criteria or no record.
5. **Lint**: `the-loop check` until it prints OK.
   Acceptance criteria are the validator's only brief — observable, binary, vague
   adjectives made measurable or cut, and each exercisable by the validator that
   will judge it: a criterion needing an environment the validator won't have (a
   live authenticated session, an installed plugin, a cross-compile toolchain) is
   rephrased against what it can drive, or explicitly deferred to the release
   gate's health check.
6. **Gate**: present the files you created/modified **FIRST**, then get explicit approval. 
   For a large or contested design, offering a fresh-context reader test first is a good 
   judgment call. Commit the artifacts as one commit. `/begin` now sees a configured 
   project.
