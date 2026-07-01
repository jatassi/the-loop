---
status: accepted
date: 2026-07-01
---

# ADR-0024 · Port inventory: one tracked artifact, two tiers with a scope, git-as-substrate

**Context.** The architecture rests on a "typed inventory of [[port]]s" (decisions §1,
ADR-0016), but the inventory never existed as an artifact — port names were scattered
across ADR-0013/-0014/-0015/-0017/-0018/-0019, the decisions doc, and the Dictionary.
The `configure-step-full` and `ports-adapters-full` features need a single list to
consume, and default-adapter choices deserve tracking before the skeleton bakes them in
(ADR-0020). Decided pre-self-hosting, by hand.

**Decision.**
- **The inventory is a living artifact at `docs/ports/ports.md`** (named directory per
  ADR-0021): hybrid narrative + one structured block, one row per port —
  `{id, tier, required_by, requires, guarantee_flags, default_adapter, consumers}`.
  `requires` stays capability-phrase coarse; a port with a full shape sketch cites its
  design.md contract id (e.g. `runtime-probe`) rather than duplicating it.
- **Two tiers, scoped:** `required` means unbound blocks — `required_by` names the
  scope (`engine`, or a phase: `validate` / `ship` / `operate`); `optional` means
  unbound routes around with a one-time note, never a block. **Enforcement is lazy:**
  the [[configure step]] checks engine ports up front and phase-scoped ports again when
  that phase enters the frontier — consistent with ADR-0016's configure-time
  enforcement plus graceful runtime [[deviation]].
- **Every engine-required port ships an in-box default adapter** (out-of-box always
  runs). Phase-scoped ports without a universal default (runtime-probe, deploy-target,
  observability-backend) are bound per-project via the Design/Configure nudges
  (ADR-0013/-0015/-0017); the runtime probe's surfaced opt-out stays the one sanctioned
  downgrade.
- **Adapter kinds gain `harness-tool` and `plugin-builtin`**, lightly amending
  ADR-0016's enumeration — a built-in harness capability (web search, push
  notification) and the plugin's own code are both native primitives.
- **Local git is substrate, not a port.** Worktrees, fingerprints, revert, and
  commit-per-pass all assume git; tests substitute a temp repo locally; a
  single-adapter seam is indirection. Only the remote surface is a port (`vcs-host`).
- **Phase components are ports** (per decisions §1), one per swappable phase — Frame,
  Design, Plan, Build, Validate. Ship, Adjust, and surfacing are control policy (the
  [[non-swappable core]]); Ship's swappable parts are its ports (deploy-target,
  security-review, runtime-probe).

**Why.** One artifact turns scattered mentions into the spec seed the configure step
will validate against. Tier-with-scope keeps the taxonomy legible (two words) while
making enforcement machine-checkable per phase — and lazy checks mean onboarding never
asks Ship-time questions, matching the progressive posture of greenfield onboarding
(ADR-0017).

**Considered and rejected.** A third "phase-gated" tier (it is just `required` plus a
scope field; fewer labels stay legible); local git as a port (hypothetical seam — no
second production adapter exists or is wanted); folding the inventory into design.md
(bloats the living design doc; the inventory churns on its own cadence and has its own
consumer); an ADR per port choice (ceremony — the inventory rows are data, this ADR
records the shape).
