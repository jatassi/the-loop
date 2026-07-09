---
status: accepted
date: 2026-06-29
---

# ADR-0002 · Form factor: a Claude Code plugin, a two-filesystem split, and a stateful `/the-loop` front door

**Context.** With the engine's inner loop fixed as a Workflow (ADR-0001), we needed to settle what the-loop *is* as an installable thing and how a human drives it.

**Decision.** Three coupled choices:
1. **Deliverable = a Claude Code plugin** — the native unit bundling skills, subagents, slash commands, hooks, and shipped-default config, and the carrier of the layered default/override model (decisions §6).
2. **Two-filesystem split.** the-loop's *code* lives in the plugin; the *artifacts it produces for a project* (Design, System Map, Ledger, ADRs, Dictionary, Research Findings) live in that project's own repo — the [[target repo]] — git-versioned. The plugin is disposable and swappable; the target repo's artifacts are durable. This is why artifacts are harness-agnostic plain files while the glue is plugin-specific. (Calibration Memory's cross-project dimension is deferred to a later branch.)
3. **Entry surface = one stateful verb, `/the-loop`.** It consults the [[Project Ledger]], states its inferred position, and proposes the next action — which *is* the [[scope handshake]] — with `/the-loop <phase>` for explicit jumps. Named `/the-loop` because `/loop` is a reserved word in most harnesses.

**Why.** The plugin is the only native form that bundles all the primitive types and rides the existing config layering, so "lean on what exists" and the default/override model both point to it. The stateful verb makes the Ledger load-bearing — it must pass the two-weeks-cold resume test for `/the-loop` to work at all — which is the system's highest-leverage dogfood; the opacity risk of a "magic" entry is contained by the rule that `/the-loop` always states its inference and confirms before acting.

**Considered and rejected.**
- **Loose skills in `~/.claude/` or clone-and-symlink** instead of a plugin — personal-first but not cleanly shareable, and forfeits the bundled default/override model. Rejected against the adoptability constraint.
- **A flat family of per-phase commands** with no smart entry — predictable and inference-free, but pushes all orientation onto the human and leaves the Ledger a passive document nothing forces you to consult. Rejected as wasting the best resumability asset.

**Amended 2026-07-08 (begin-front-door-rename).** The entry verb is now
`/begin`: the plugin name made the fully-qualified form `/the-loop:the-loop`,
and "begin a working session" names the affordance. The command-vs-skill
distinction this ADR assumed has dissolved upstream (custom commands merged
into skills; `!` dynamic-context injection works in SKILL.md), so the front
door now lives at `plugin/skills/begin/SKILL.md` and `plugin/commands/` is
retired. Everything else here stands.
