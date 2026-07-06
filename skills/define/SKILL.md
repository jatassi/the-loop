---
name: define
description: Define a raw idea into a brief sharp enough to design against. Use when the user brings a new project or feature idea (a brain-dump) to shape, or when /the-loop routes to Define.
---

# Define — brain-dump → brief

Produce a brief at `docs/briefs/brief.md` that the Design phase can consume without
re-asking anything foundational. Define owns the invitation and the brief; the interview
between them belongs to the interview port — `/grilling` unless this project's
configuration binds another interview skill.

## 1 · Invite the brain-dump

Ask for everything in the human's head about the idea, in whatever order it comes out —
goals, fragments, constraints, worries. Don't interrupt and don't impose structure:
structure is produced by the interview, never demanded at capture. If the idea already
lives in a document or notes, read that instead of asking for a restatement.

If `docs/briefs/brief.md` already exists, ask whether this session sharpens that intake
or replaces it with a new one — git history keeps the old brief either way.

## 2 · Run the interview

Load the bound interview skill and run it against the captured idea, with three
Define-specific bounds on the session:

- **Open with the scope envelope** — whole app, one feature, one task? Every question
  after is budgeted against that answer: a weekend toy earns a handful, a production
  system earns a long interview.
- **Ask "does this already exist?"** When the idea overlaps existing products or
  libraries, search the web and bring back cited findings — the human decides
  build-anyway or lean-on-what-exists.
- **Sort every resolved thread into decided or deferred.** Deliberately deferring a
  question to Design is an answer; letting it drop silently is not.

Exit only when the brief would be **sharp enough to design against**: a designer could
pick it up and make architecture and technology choices without asking the human
anything foundational. Intent, scope edges, constraints, and success criteria are all
pinned — if any is still fuzzy, keep the interview going.

## 3 · Write the brief

Write `docs/briefs/brief.md`. Let what the interview surfaced shape the document, but a
brief that Design can consume answers all of these, so they are the default sections:

- **Intent** — what this is and why it should exist, in the human's own terms.
- **Users** — who this is for and what they're trying to do. One word when it's just
  the human; never skipped.
- **Scope envelope** — the size of the ask, what is explicitly out, and what is noted
  for later intakes.
- **Decided** — every decision the interview resolved, with the why where it was
  contested.
- **Deferred** — questions deliberately left for Design, named so they aren't lost.
- **Assumptions** — what the brief proceeds on without verification. Decided was
  confirmed by the human; nobody confirmed these.
- **Constraints** — technology, integration, budget, timeline — whatever binds the
  solution space.
- **Done looks like** — success criteria, each measurable and technology-agnostic:
  the what, never the how.

## 4 · Sweep, gate, commit

- **Sweep the capture.** Walk the brain-dump once more: every thread it raised
  appears in the brief — Decided, Deferred, an Assumption, or explicitly out of
  scope. Nothing silently dropped.
- **Gate.** Present the brief and ask the human to approve it.
- **Commit** `docs/briefs/brief.md`, then tell the human that Design consumes it next.
