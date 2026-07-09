# Brief — ports-adapters-full

## Intent

The middle ground between v1's typed port inventory (retired, ADR-0037) and doing
nothing. The graph node's current framing — "full ports/adapters (swapping +
capability-contract enforcement)" — is the overengineered end this brief explicitly
walks back from: **this Define pass rescopes the node**, replacing its title and
acceptance with the smaller thing.

What the smaller thing is: ADR-0049's configure step captures bindings ("features →
Linear") but nothing consumes them. This feature is the consumption side, split into
two prongs matched to two kinds of surface:

- **External surfaces** (artifact stores, trackers, deploy targets, observability,
  notification …) get **documentation-as-adapter**: a recorded-binding document in
  the operations-toolkit mold — what goes where, how to access it, capabilities
  tagged read/mutate, caveats/gotchas — that the consuming phase's agent reads and
  follows. The documentation *is* the adapter; the agent is the runtime. No adapter
  code, no registry, no dispatch layer.
- **Phase agents** (plan, build, validate, drive — whatever the pipeline spawns)
  get a **configuration surface**: today `agentTypeFor(role)` hardcodes the bundled
  agent names and a user's custom agent has no way in. The swap becomes one config
  line in the existing role-binding table.

## Users

Jackson, and any human running the-loop against project truth that lives outside
the repo; the loop's phase agents are the consumers.

## Scope envelope

Feature-sized, and a **rescoping intake**: Design rewrites the
`ports-adapters-full` graph node (title + acceptance) to match this brief. The
`depends_on: [configure]` edge stands — capture precedes consumption.

**In:** the recorded-binding documentation template; the phase-side habit of
checking for a nondefault binding before assuming the in-repo default; the
capture-time gate (trade-off acceptance + reachability probe); the phase-agent
binding field; one real proving swap (features → Linear).

**Out (explicitly, the sweep):**

- Reviving the typed port inventory — it stays dead.
- Capability-contract enforcement machinery — the probe plus human-accepted
  trade-offs is the whole capture-time story.
- Shipped per-service adapter docs (no bundled "Linear adapter") — each project's
  own configure/onboard interview writes its bindings.
- Phase-*skill* swapping — already a settings binding (ADR-0049's interview hook).
- A guarantee-flag schema — trade-offs are conversational, not recorded fields.
- Silent auto-fallback for a broken bound store — deviation, never divergence.

**Later intakes:** further real surfaces as they show up in actual use
(designs → Confluence/Notion, notifications → a real channel, …).

## Decided

- **Adapter shape taxonomy: descriptive, never enforced.** Six first-class shapes —
  files, CLIs, Skills, MCPs, subagents, harness built-ins. (Bare HTTP APIs collapse
  into CLI; browser automation is a known edge, not first-class.) The taxonomy is
  vocabulary for the documentation and the configure interview; the
  access-instructions prose is the actual contract. Enforcing the list as a closed
  enum would be the v1 instinct sneaking back in.
- **Two homes, per the ADR-0049 split.** Machine config — the binding pointers and
  the phase-agent field — lives in the settings layers under the namespaced
  `"the-loop"` key, four-layer resolution, provenance-stamped. The binding
  *documentation* is narrative and lives with project truth; its exact home is
  deferred (below).
- **Capture-time gate: surface-and-accept plus probe.** When a nondefault binding
  is captured, the interview surfaces the trade-offs versus the in-repo default
  conversationally and the human explicitly accepts them before anything is
  written — acceptance is the gate; the trade-off prose is not required to be
  recorded. A reachability probe runs at capture (MCP connected? CLI on PATH? path
  readable? — whatever the shape implies); a failed probe is surfaced and the human
  chooses fix-now or bind-anyway. Never a silent write, never a hard block.
- **The template's caveats/gotchas section is operational knowledge** (rate limits,
  auth quirks, field-mapping surprises), distinct from trade-offs.
- **Consumption mechanics.** The settings layer holds the pointer (surface →
  binding), the documentation holds the how. Unbound = the in-repo default with a
  visible fallback line (ADR-0049's fallback-or-block posture, unchanged).
  Bound-but-broken at use time = a surfaced can't-run deviation, distinct from
  ran-and-failed — and **no silent auto-fallback to the in-repo default once a
  surface is bound**: quiet fallback would fork project truth (half the features in
  Linear, half in the graph file). A broken binding stops that surface.
- **Phase-agent binding: a field, not a table.** The existing role-binding table
  (role → `{model, effort?, executor?}`) gains `agent?`. Unbound → the bundled
  agent, exactly today's behavior, visible in the existing provenance/models-list
  output. Name resolution (project `.claude/agents/`, user-level, other plugins'
  namespaces) is the harness's agent registry — inherited, not built.
- **No prior-art web survey.** The external prong's industry answer is MCP itself,
  which the taxonomy embraces as a first-class shape — this feature documents how
  to use connected surfaces, it doesn't compete with them; the agent prong rides
  the harness's native registry. There is no product to lean on instead; the build
  is thin glue plus a documentation pattern.
- **The proving swap is real: features → Linear**, on Jackson's Linear account.
  The v1 parking condition ("wait for a second adopter") is dissolved — the rescope
  cuts the carrying cost, and Linear is the second adopter, arrived. Features is
  deliberately the richest surface (surfacing, dependency resolution, status
  write-back), so the proof exercises documentation-as-adapter under load, not just
  reads.

## Deferred (named for Design)

- **The documentation's home.** `architecture.md` recorded-binding sections
  (today's pattern, 316 lines and growing) versus per-binding files (targeted
  agent reads, independent churn — but the "extra artifact" shape ADR-0037
  killed). The tension is real on both sides; Design resolves it on consumer
  benefit, not tidiness.
- **`agent` / `executor` precedence** when both are bound on one role (the
  ADR-0031 drive path and a custom agent name need a rule).
- **The Linear truth-split:** what maps into Linear (statuses, titles, …) versus
  what stays in-repo (dependency edges, acceptance criteria, notes) — and what the
  binding documentation says about the seam.

## Assumptions

- The harness agent registry resolves custom agent names passed as a workflow
  `agentType` the same way the Agent tool does, including project-level
  `.claude/agents/` definitions in headless runs (documented behavior; re-verify
  at Design).
- Linear is reachable from Jackson's environment via its MCP server (or CLI) with
  credentials available at capture time; acceptance runs involving Linear are
  interactive, not CI-deterministic — accepted by choosing a real proof.
- The configure feature (ADR-0049) lands its capture side — binding pointers
  readable through the settings resolver — before this feature's consumption side
  builds against it.
- The operations-toolkit recorded-binding shape (targets, capabilities tagged
  read/mutate, access commands, caveats) generalizes to other external surfaces.

## Constraints

- Harness-native primitives only — settings layers under the `"the-loop"` key, the
  harness agent registry, connected MCP servers; no parallel config or dispatch
  system (ADR-0016/0030/0049 posture).
- Minimalism is the standing frame: entries and a template, not new homes or
  machinery.
- Recorded-binding documentation remains a design artifact with narrative weight —
  machine config never swallows it.

## Done looks like

- Binding a custom agent name for a pipeline role is one config line; the next run
  spawns it, provenance visible; every unbound role spawns its bundled agent,
  byte-for-byte today's behavior.
- Capturing a nondefault external binding walks trade-off acceptance and a
  reachability probe before any write; a failed probe is surfaced with fix-now /
  bind-anyway; nothing is ever written silently.
- Every captured external binding has documentation answering: what lives there,
  how to access it, what operations exist (tagged read/mutate), and its
  caveats/gotchas.
- With features bound to Linear on a real account: a run reads buildable-feature
  truth from Linear and writes status back through the documented access path;
  removing the binding restores in-repo behavior with a visible fallback line.
- A bound-but-unreachable surface mid-run reports a can't-run deviation naming the
  surface — it never silently falls back and never forks project truth.
- The `ports-adapters-full` graph node carries the rescoped title and this
  acceptance; contract-enforcement language is gone from it.
