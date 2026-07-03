---
description: "the-loop's front door — states where the project stands and proposes the next action; /the-loop <phase> jumps straight to a phase"
argument-hint: "[phase]"
allowed-tools: Bash(node *), Bash(git *), Bash(ln *), Bash(mkdir *), Read, Workflow
---

## Context

- Requested jump (may be empty): `$ARGUMENTS`
- Orientation — machine truth from the project's feature graph:

!`node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js" orient 2>&1`

## /the-loop — the project's front door

State where the project stands, propose the next action, and wait. Three hard rules:

1. **State the inferred position before doing anything else.** The human always sees
   where you think the project stands and why.
2. **The proposal is a handshake.** Offer it as the recommended default; the human
   confirms or overrides, and their answer sets the scope of what runs — nothing
   outside it starts.
3. **Never improvise a missing adapter.** If a phase's skill isn't available in this
   installation, say the route is decided but the adapter is missing, and stop.

### Branch on `mode`

(If the orientation above isn't JSON, run
`node "${CLAUDE_PLUGIN_ROOT}/bin/the-loop.js" orient` yourself and diagnose from its
stderr before branching.)

**`cold-start`** — nothing to resume: this is onboarding, not an error. Say so, then
walk the three legs, one question at a time, each with a recommended default the human
can accept or override:

1. **Configure (minimal)** — confirm the baked-in defaults: artifacts live in named
   directories under `docs/`; the test harness is the project's native test command.
   Runtime, deploy, and observability choices are deferred until their phase nears.
2. **Frame** — route to the `frame` skill (a brain-dump becomes a Brief).
3. **Design** — the Brief flows into the `design` skill.

If the orientation shows `hasBrief: true`, a Frame session already produced
`docs/briefs/brief.md` — confirm Configure, then resume at Design; don't re-frame.

**`active`** — a live project. Read `docs/ledger/ledger.md` for the story (what is
this / where are we / what needs you / what's next), then report:

- **Position** — from the orientation JSON. The feature graph is the source of truth;
  if the Ledger disagrees with it, trust the JSON and flag the Ledger as stale.
- **What needs the human** — every id in `parked`, each with its recommendation, first.
- **The proposal** — the default next action. If `frontier` is non-empty alongside
  parked items, offer both: decisions unblock parks; the frontier can advance
  meanwhile. Accepting `advance-frontier` enters the launch leg below.

**`partial`** — a half-configured project. Name exactly what `missing` lists, propose
a repair (finish the interrupted Design, or restore the file from git history), and do
not guess forward.

### Explicit jumps — `/the-loop <phase>`

Orient and state position first, then route: `frame` → the `frame` skill · `design` →
the `design` skill · `plan` / `build` / `validate` → the launch leg below, scoped to
the dependency-ready frontier exactly as `advance-frontier` is · `ship` → Ship ·
`config` → `/loop-config`.

### The launch leg

`advance-frontier` and the explicit `plan`/`build`/`validate` jumps both enter here —
one procedure, so neither route improvises its own version.

1. **Clean-tree gate.** Check out the integration target (`main`, unless the design
   narrative in `docs/design/design.md` names another ref) and run `git status`. A
   dirty tree stops everything right here: tell the human the tree isn't clean and
   nothing ran — never say whose change it is, and never stash, reset, or commit
   anything to make it clean.
2. **Confirm the scope.** State the candidate feature-id list — the dependency-ready
   frontier — and get the human's accept-or-override of it (rule 2 above). Their
   answer is the run's `scope`.
3. **Assemble `args`, mechanically — no field is invented, each comes from one
   command:**
   - `target` — `main`, unless the design narrative names another ref.
   - `scope` — the confirmed list from step 2.
   - `index` — `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" index`.
   - `slices` — for every feature-id in `scope`,
     `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" resolve <feature-id>`, keyed by id.
   - `plans` — for every feature-id in `scope` that already has a plan (status
     `planned` or `building`), `node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" plan parse
     <feature-id>`, its tasks reduced to `{ id, status, depends_on, size }` each,
     keyed by id. A `designed` feature has no plan yet — omit it.
   - `probe` — the project's runtime-probe **binding** as recorded at Design: the
     bring-up / exercise / teardown instructions from the design narrative's
     Lifecycle section, or from the project's ports inventory where one exists
     (`docs/ports/ports.md`, its runtime-probe binding entry). Excerpt them
     verbatim — one excerpt, independent of scope. Never pass the abstract
     `runtime-probe` contract shape in its place, and never invent a binding: if
     none is recorded, pass the recorded opt-out note instead.
4. **Check plugin-agent resolution.** The Workflow spawns by `agentType` — `plan`,
   `build`, `derive`, `validate`. Confirm each of the four resolves as an agent type
   for the session; for any that doesn't, symlink it from the plugin so resolution
   is guaranteed: `mkdir -p .claude/agents` then
   `ln -s "$CLAUDE_PLUGIN_ROOT/agents/<name>.md" ".claude/agents/<name>.md"`. The
   link tracks the plugin, so once it exists it never goes stale and never needs
   redoing — but agent registration is read once, at session start: links created
   mid-session don't resolve until a fresh session, so tell the human to restart
   and relaunch rather than launching into certain stalls.
5. **Launch.** Call the Workflow: `scriptPath` =
   `$CLAUDE_PLUGIN_ROOT/workflows/inner-loop.js`, `args` = the step-3 snapshot.
6. **Relay the result.** State the returned `BoundaryResult` to the human plainly:
   - `completed` — which features finished.
   - `parked` — each with its `deviation` and `menu`, verbatim; these need a
     decision.
   - `stalled` — each with its `feature`/`phase`/`note`; nothing was booked for it,
     and the phase re-runs on the next pass.
   - `halted`, if present — its `reason` (`budget-exhausted` or
     `environment-blocked`) and `detail`, alongside whatever `completed`/`parked`
     landed before the halt.

### Proposal kinds

`onboard` route to onboarding · `resolve-parked` parked escalations need decisions ·
`advance-frontier` run the dependency-ready features · `ship` the validated frontier
awaits the human gate · `new-intake` everything is shipped; bring the next idea ·
`repair` artifacts missing or graph invalid · `blocked` unreachable on a valid graph —
treat as repair.
