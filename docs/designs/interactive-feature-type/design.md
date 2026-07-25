# interactive-feature-type

Execution-mode marker on the feature record: some features cannot be finished by an
autonomous agent, and the graph currently has no way to say so.

## Why

`agent-surface-trim` is the exemplar. Its acceptance reads *"when the adjudication
session ends, every surfaced candidate carries an explicit keep, rewrite, relocate, or
delete ruling"* — those rulings are the human's. There is no test that makes them, and a
Plan → Build → Validate pass over it would produce confident garbage.

Today nothing in the graph records that. The feature is `designed` with satisfied
dependencies, so it lands in the eligible set, `/begin` offers it inside its default
`advance-eligible-set` proposal, and the only thing preventing an autonomous run is the
human remembering. That constraint currently lives in a human's notes. This feature moves
it into the artifact, where the tooling enforces it.

## What changes

The feature record gains one optional field:

```json
{
  "id": "agent-surface-trim",
  "title": "Audit and targeted trim of agent-facing surfaces",
  "status": "designed",
  "execution": "interactive",
  "acceptance": ["…"]
}
```

`execution` is `"autonomous" | "interactive"`. **Absent means `autonomous`** — every
existing record in every consuming project stays valid and unchanged.

It is deliberately *not* a status. Status is the durable lifecycle position
(`proposed → designed → validated → shipped`) and an interactive feature travels the
same one. Execution mode is orthogonal: it says *who does the work*, not *how far along
it is*.

Interactive does **not** mean unvalidated. The human owns Plan and Build; the ordinary
validate leg still runs — fresh eyes, same acceptance criteria, same squash-land, same
status flip. Nothing reaches `validated` in this system without an independent look, and
this feature does not carve out an exception.

## The coherence sweep

Phases hand off through artifacts, so a change to the feature record is a change to
every surface that touches it. Each surface below is ruled explicitly; "unaffected" is a
ruling, not an omission.

### Producers — a required question, not an inference

The mode is **the human's answer**, not the authoring agent's judgment. An agent deciding
for itself which features it may run unattended is the wrong party asking the wrong
question. Both producer surfaces pose it explicitly before the artifact is final, with a
recommendation, and neither may default silently.

**The question**, posed once per pass:

> **Execution mode** — which of these should the pipeline build on its own, and which do
> we work through together in an attended session?
> Recommended: `agent-surface-trim` **interactive** (the work is the decision — its
> acceptance is a set of rulings only you can make). Everything else **autonomous**.
> Flip any of them.

Design poses it once for the whole batch it is promoting — a greenfield pass may promote
twenty features, and twenty questions is a worse artifact than one. It lists the flagged
features with the criterion that flagged each, defaults the rest to autonomous, and
invites the human to flip any. It is posed **even when nothing is flagged**: a question
that disappears when the recommendation is "no" is not required, and the unflagged pass
is exactly where a wrong default sticks silently. Diagnose poses it for its one fix
record.

**Recommend `interactive` when any of these fire:**

- **Taste.** Visual design, copy, tone, naming, API ergonomics. There is no test for
  "this reads well", and a model's confident default is precisely the templated result
  the human is trying to avoid.
- **The work *is* the decision.** The deliverable is a set of rulings and the
  implementation is trivial once they are made — a trim pass, a naming sweep, a policy
  change.
- **Adjudication-shaped acceptance.** A criterion whose subject is a human act
  ("every candidate carries a ruling", "the human approves the wording").
- **Only a person can see it.** Correctness that shows up in a rendered page, on a
  device, in how something feels — something the validator's environment cannot reach.
- **A real fork is still open**, or the human holds a preference they have not managed to
  write down. What cannot be specified has to be attended.
- **Hard to reverse and cheap to get subtly wrong.** Schema migrations, public API
  breaks, destructive operations, auth and permissions.

**Recommend `autonomous`** when acceptance is expressible as tests, no fork is open, and
a wrong answer is caught by the suite. This is the common case and the default.

**The one-line test:** *would the human want to look at the result before it lands — and
can the acceptance criteria make them look?* Yes and no means interactive.

| surface | obligation |
|---|---|
| `plugin/skills/design/SKILL.md` | Pose the question once per promotion batch, at the design gate where the human is already reviewing. Record each answer as `execution` on the record. |
| `plugin/skills/diagnose/SKILL.md` | Pose it for the `fix-<slug>` record at writeup. Most fixes are autonomous — a regression test is exactly the artifact an agent can drive — but a remedy that is itself a judgment call (a naming decision, a policy trade-off) is interactive. |
| `plugin/skills/define/SKILL.md` | **Unaffected.** A brief hints at the mode, but the question belongs where acceptance is written. Nothing to add. |
| `/begin` new-intake → park as `proposed` | **Unaffected.** A `proposed` record never enters the eligible set and the launch gate already refuses it. A parked record needs no marker, and asking then would be asking before the answer is knowable. |

Both producer skills carry the criteria and the two values **inline**. A shipped surface
cannot point at this repo, so self-containment is required there — it is not the
redundancy an audit should cut.

### Consumers

| surface | change |
|---|---|
| `cli/src/graph.rs` | Parse and emit `execution`. Key order after `status`. Absent stays absent — no null churn. |
| `cli/src/validate.rs` | Reject a value outside the enum, alongside the existing status check. |
| `cli/src/status.rs` | `eligible_set_ids` excludes interactive; new `interactive_ready_ids`; `propose` gains `advance-interactive`; `Orientation` gains `interactiveReady`; the human render marks interactive rows. |
| `cli/src/context.rs` | `check_scope` learns which door it is serving and refuses the wrong mode. |
| `cli/src/commands/prepare_execution_context.rs` | New `--interactive` flag selecting the door. |
| `plugin/skills/begin/SKILL.md` | Route the new proposal kind. |
| `plugin/skills/interactive-execution/SKILL.md` | **New surface.** The attended counterpart to `execute`. |
| `plugin/skills/execute/SKILL.md` | Inherits safety from the eligible set; says so in one line. |
| `plugin/skills/using-the-loop/SKILL.md` | Describes the artifact set to a consuming project — the record shape gained a field. |
| `plugin/workflows/execution-pipeline.js` | **Unaffected.** It never receives an interactive feature; the gate is upstream. |
| `plugin/agents/validate.md` | **Unaffected.** Interactive features get the same independent look, by the same contract. |

## Interfaces this touches

**Feature record** — the shape every graph command parses and emits
(`cli/src/graph.rs`, `struct Feature`). `execution` slots in as an optional string
beside `section`, and the canonical emit order becomes:

```
id, section, title, status, execution, depends_on, acceptance, notes
```

**Fail closed on a malformed value.** `section` currently drops a non-string value
silently:

```rust
"section" => {
    if let Some(s) = val.as_str() { section = Some(s.to_owned()); }
    // null / wrong type → absent; validator does not require section.
}
```

`execution` must **not** copy that. `"execution": true` silently becoming *autonomous* is
a fail-open that runs a human-attended feature through the pipeline. Follow the
`depends_on` / `acceptance` precedent in the same file instead — a wrong type is a named
`ParseError::MalformedJson`, so nothing downstream ever sees a dropped marker.

**Eligible set** — `cli/src/status.rs`:

```rust
pub fn eligible_set_ids(features: &[Feature]) -> Vec<String> {
    features.iter()
        .filter(|f| f.status == "designed" && f.depends_on.iter().all(|d| satisfied(d)))
        …
}
```

This set feeds three consumers at once: the `advance-eligible-set` proposal, the human
render's `**Next:**` line, and `eligibleSet` in the `--json` orientation that `/begin`
embeds. Filtering interactive out here fixes all three, and makes `execute` safe by
construction without `execute` changing behavior.

**Proposal precedence** — the same file. Today's chain is: eligible set → `design`
(naming proposed blockers) → `blocked` → `release` → `design` (backlog) → `new-intake`.
`advance-interactive` must be inserted **directly after the eligible-set branch and
before the stuck/`blocked` branch**. Order matters for correctness, not taste: interactive
features are `designed`, so they land in `stuck`, and with no proposed blocker behind them
`propose` returns

```rust
Proposal::new("blocked", stuck,
    "designed features exist but none are actionable — the graph needs repair")
```

A project whose only ready work is attended would be told its graph is broken. That is a
false statement about the project, and it is the kind of defect that surfaces only by
tracing the flow rather than the diff.

When both kinds of work are ready, the eligible set wins the proposal — but
`interactiveReady` rides the orientation JSON unconditionally, so `/begin` can mention
that attended work is also waiting.

**Scope gate** — `check_scope` in `cli/src/context.rs` already refuses a non-`designed`
feature with `not-designed`. It gains a mode so both doors are honest: without
`--interactive` an interactive id is refused; with it, an autonomous id is refused. The
refusal message names the other door. This is a backstop, not the primary defense — the
eligible set already keeps interactive ids out of proposed scopes. It exists for the
hand-typed id.

## The `interactive-execution` skill

The attended counterpart to `execute`, and named to sit beside it: `execute` launches the
autonomous pipeline, `interactive-execution` runs the human-attended session. It carries
the whole attended recipe.

1. **Resolve scope.** A human-typed feature id, or the `interactiveReady` set from
   `the-loop status --json`. Model-initiated invocation presents scope and target branch
   and waits for a confirm. An empty ready set stops, saying so.
2. **Assemble context.** `the-loop prepare-execution-context --features <id>
   --target-branch <ref> --interactive` prints the execution context — the same
   assembly the pipeline gets, gated the same way, minus the workflow splice. Design doc,
   acceptance, validation-procedure binding, hooks, and target all arrive from one place.
3. **Work it.** `the-loop worktree-create loop/<id> --base-branch <target>`, then work in
   that worktree turn by turn with the human. Every judgment the feature exists to
   collect is the human's; the agent does the reading, drafting, and mechanical edits.
   Commit as the work lands, subject `<id>/feature: <what landed>` — the existing
   small-path convention, no new one.
4. **Hand to validate.** When the human calls it done, spawn the ordinary `validate`
   agent against `loop/<id>`, with the fields the execution context already supplies:
   feature id and title, target and integration worktree command, merge order, cli,
   acceptance criteria, validation-procedure binding, and design doc. Relay its verdict.

The validate **protocol** has exactly one home (`plugin/agents/validate.md`) and is not
restated here. What this skill assembles is the same thin field injection the pipeline's
`validatePrompt` performs — a second caller of one contract, not a second copy of it. An
audit sweeping for redundancy should read it that way.

## Landing hazard — read before touching the real graph

An older `the-loop` binary **silently deletes** an `execution` key it does not know.

`set_status` (`cli/src/commands/graph.rs:154`) does not validate; it parses, mutates
status, and re-emits the whole graph. `emit` deliberately drops unknown keys — asserted
by `unknown_top_level_and_per_feature_keys_are_captured_not_dropped_or_panic`. So on a
binary predating this feature, `set-status` round-trips the marker straight out of the
file, with no error and no output naming it.

It strikes at the worst moment: `the-loop set-status <feature> validated` is the validate
agent's final act, run with whatever binary is installed — which, while this feature is
landing, is the old one.

Therefore:

- **This feature's commit adds no `execution` key to any record in this repo's graph.**
  Prove the machinery with fixture graphs in tests, not by mutating the shipped graph.
- Marking `agent-surface-trim` is a separate human act, after the new binary is installed.
- Do not attempt to fix this by making `emit` preserve unknown keys. Forward compatibility
  has to ship *before* the field it protects, so it cannot help this landing. It is worth
  doing for the next schema addition and is parked as `graph-schema-forward-compat`.

## Constraints

- Absent `execution` must remain byte-identically absent on emit. Every existing graph in
  every consuming project round-trips unchanged, or this breaks projects that never asked
  for the feature.
- The `--interactive` flag selects a door; it does not loosen one. Every other gate —
  graph validation, model bindings, plan validation — applies unchanged.
- No surface under `plugin/` may reference this document, this repo's `docs/`, or an ADR
  number. A consuming project has the plugin and the binary and nothing else.
