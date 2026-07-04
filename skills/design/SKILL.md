---
name: design
description: Design a project from its Brief — architecture narrative, feature graph, Ledger, and Dictionary. Use when a Brief is ready to become a design, the user wants to decide what to build and in what order, or /the-loop routes to Design.
---

# Design — Brief → design.md

Turn the Brief into the project's living design: `docs/design/design.md`, narrative
architecture plus the feature graph the engine runs on, with the Ledger born at
finalize. This is the last human-gated phase before autonomous execution — ambiguity
that survives it is inherited by every downstream agent.

## 1 · Read the Brief

Read `docs/briefs/brief.md`; if there is none, run the `frame` skill first. Treat the
Brief's **Deferred** section as your opening question list — every deferred item gets
resolved in this session. Everything **Decided** is settled; don't relitigate it.

If `docs/design/design.md` already exists, you are amending a living design: fold the
new intake's features into the existing graph instead of starting over.

## 2 · Interview the architecture into shape

Load the bound grilling skill (`/grilling`, unless this project's configuration binds
another interview skill) and drive the design decisions through it: architecture, data
model, interface contracts, boundaries, tech posture.

- **Survey before you invent.** Before proposing to custom-build anything — auth,
  persistence, orchestration — search for what already exists and cite what you find.
  Low confidence on a consequential choice is a research trigger, not a coin flip.
- **Design it twice.** When a choice is contested or hard to reverse, resolve the
  alternates' model: `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" models`, and read the
  `design.alternative` role's entry — its `model`, or the session inherit when that
  value is literally `"session"` or the role is missing from the printed table
  (session-side spawns take a model only — a bound effort does not apply there).
  Sketch two or three radically different shapes on that model — parallel
  subagents, each titled `[<resolved-model>] ` and handed a different constraint
  (minimize the interface · maximize flexibility · optimize the common case) —
  then compare and recommend one. Be opinionated: the human wants a strong read,
  not a menu.
- **Ask the three lifecycle questions.** Each is project-shaped, "none" is a recorded
  answer, never a skipped question, and the answers land in the narrative's
  **Lifecycle** section:
  - **Runtime probe** — what commands bring this system up, exercise it, and tear it
    down? Validation observes the running system through them; declining downgrades
    validation to tests-only and is recorded as a deliberate opt-out.
  - **Observability** — once this is deployed, how does the human find out something
    is wrong?
  - **Operations** — what ops/debug tooling will this project need, if any?

Capture side effects the moment a decision lands — never batch them to the end:

- **A term pinned** → write it into `docs/dictionary/DICTIONARY.md` right there: one
  heading and a one-line definition per term, related terms linked as `[[name]]`.
- **A decision that is hard to reverse, surprising without context, and a real
  trade-off** → offer to record it as an Architecture Decision Record in
  `docs/adr/`. All three criteria or no record.

## 3 · Slice the features — the human owns the knife

Propose a coarse feature breakdown and build order; the human decides the slice
boundaries. Test every slice, and the order:

- A feature is a vertical slice: independently validatable, independently shippable,
  and big enough to decompose into more than one task. Smaller than that, it's a task
  — fold it into a feature; too big for one observable acceptance criterion — split
  it.
- **Order for a walking skeleton.** The earliest slices cut end-to-end through every
  layer, and any prefix of the build order is a viable system.
- **Extra is a failure like missing.** No feature the Brief didn't ask for; when in
  doubt, leave it out and note it as a possible later intake.

## 4 · Write design.md — for the agent who wasn't in the room

Every downstream reader is a stateless agent handed an injected slice of this
document; it was not in the room. Each feature, with its contracts, must stand alone.

Narrative prose carries the judgment. Default sections: **Overview** (what this is
and why) · **Architecture** (the shape, data model, boundaries) · **Non-goals**
(things that could reasonably be goals but aren't) · **Error handling** (the failure
posture) · **Lifecycle** (the three answers from step 2).

Two machine-parsed YAML blocks carry the structure, each under its exact heading:

Under `## Feature graph`:

```yaml
design_version: 1
features:
  - id: kebab-case-stable-handle
    title: one line
    status: designed          # every new feature starts here
    depends_on: [other-id]    # build-order edges; omit when none
    interfaces: [contract-id] # contracts it owns or touches; omit when none
    acceptance: an observable, binary criterion
```

Under `## Key interface contracts` (when features share interfaces):

```yaml
contracts:
  - id: contract-id
    body: |
      the shape, sketched in prose — the what, never the how
```

Acceptance criteria are the validator's only brief, and it wasn't in the room either:
each must be observable and binary — Given/When/Then is the default shape — and vague
adjectives (fast, robust, secure) are made measurable or cut.

Then run `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" check` from the repo root. It
rejects duplicate or dangling ids, dependency cycles, missing acceptance criteria, and
bad statuses. Fix until it prints `OK`.

## 5 · Reader-test, sweep, gate

Three checks stand between a draft and finalize:

1. **Reader test.** Resolve the reader's model — `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js"
   models`, and read the `design.reader` role's entry: its `model`, or the session
   inherit when that value is literally `"session"` or the role is missing from the
   printed table. Hand the draft to a fresh subagent on that model (title prefixed
   `[<resolved-model>] `), with zero session context; it reports back what it would
   build and where the document is ambiguous or silent. Fold every finding into the
   draft — an ambiguity the reader hits, a build agent will hit too.
2. **Sweep.** Confirm: every **Decided** and **Done looks like** item from the Brief
   landed in a feature or was explicitly dropped with the human · no TBDs or
   placeholders anywhere · no criterion two builders could read differently ·
   `spine check` still prints `OK`.
3. **Gate.** Present the assembled design and ask the human to approve it. Do not
   finalize without approval — the next step makes the project live.

## 6 · Finalize — the Ledger is born

- Write `docs/ledger/ledger.md`, the project's resting status surface. Four sections:
  **What this is** (two sentences plus a pointer to design.md) · **Where we are**
  (feature counts by status — all `designed` at birth) · **What needs you** (nothing
  yet) · **What's next** (the first dependency-ready features). From here on the loop
  re-renders it; nobody hand-edits it.
- Review the Dictionary entries captured during the session; fill any gaps the sweep
  exposed.
- Commit design.md, the Ledger, the Dictionary, and any decision records together —
  the project's first artifact commit.

Close by telling the human the design is final, `/the-loop` now sees an active
project, and the engine — Plan → Build → Validate — picks up the first
dependency-ready features next.
