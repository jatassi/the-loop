# write-skills-doctrine — the authoring skill learns agent definitions

## What this is

Three edits to `plugin/skills/write-skills/SKILL.md` that were already resolved
inside `agent-surface-trim`'s design but do not depend on its adjudication
session: the description gains agent-definition triggers, the body gains a
compact agent-definition deltas section, and the **Negation** failure mode is
vendored from upstream. Brief: `docs/briefs/agent-surface-trim.md` — this is a
split, not a new intent.

## Why it is its own feature

`agent-surface-trim` is a human-attended session that produces authoring
doctrine. Two new skill surfaces — `execute` and `interactive-execution` — are
authored between now and that session, and both of their designs require a
`write-skills` pass before landing. If the doctrine ships with the trim, those
two surfaces are written against the version the trim is about to replace and
then audited afterward. Landing the pre-decided half first is strictly cheaper.

What stays with the trim is the half that genuinely needs the session to have
happened: its generalized judgment calls folding into the existing Pruning and
Failure modes sections. Nothing here pre-empts that — this feature leaves both
sections in place and unrenamed.

## The three edits

**1 · Description triggers on agent-definition authoring.** Today the
description fires on skill authoring only. A session creating or editing a file
under `plugin/agents/` is doing the same job against a different artifact and
should reach the same doctrine. The description stays tier 0 — injected into
every consuming session — so it must gain the trigger without swelling.

**2 · An agent-definition deltas section.** Agent definitions and skills are
close enough that a separate skill would be duplication, and different enough
that the deltas need stating. Three of them:

- the **description** is a delegation trigger — it decides whether this worker
  is spawned at all, not whether a body gets read;
- the **`tools:` list is part of the interface** — a capability the body assumes
  and the frontmatter withholds is a defect the reader cannot diagnose;
- the **body is a system prompt read cold** by a stateless worker with no
  conversation history and no way to ask a follow-up question.

It belongs inside the existing information-hierarchy structure, near the body
and description guidance it modifies — not appended as a trailing section, which
is exactly the shape this skill tells authors not to produce.

**3 · Vendor the Negation failure mode.** From upstream `writing-great-skills`
(2026-07-06): steering by prohibition names the elephant. "Do not write
placeholder tests" plants *placeholder tests*. Prompt the positive; keep a
prohibition only as a hard guardrail that cannot be phrased positively, and pair
it with what to do instead. This joins the existing Failure modes section.

## Interfaces this touches

`plugin/skills/write-skills/SKILL.md` only — frontmatter description, one new
section in the body, one new failure mode. Its `GLOSSARY.md` companion is
unaffected but must still resolve. No CLI change, no other surface, no
frontmatter `allowed-tools` change.

## Coherence check

The loop's phases hand off through artifacts; this feature changes no artifact
schema and no phase contract. It changes one skill body that other authors read.
Every other surface is **unaffected**: no producer writes to it, and its
consumers are humans and authoring agents reading it at write time, not the
pipeline at run time.

## Constraints

- Self-contained per the shipped-surface rule: no ADR numbers, no path into this
  repo's own docs. A consuming project has the plugin and the binary.
- The skill takes a `write-skills` pass by its own rules before landing.
- Leave Pruning and Failure modes in place and unrenamed — `agent-surface-trim`
  folds into them later.
- Additive only. No existing guidance is cut here; cutting is the trim's job and
  its rulings are the human's.
