---
name: frame
description: Frame a raw idea into a Brief sharp enough to design against. Use when the user brings a new project or feature idea (a brain-dump) to shape, or when /the-loop routes to Frame.
---

# Frame — brain-dump → Brief

Produce a Brief at `docs/briefs/brief.md` sharp enough to design against. Frame owns
the invitation and the Brief; the interview between them belongs to the grilling port —
`/grilling` unless this project's configuration binds another interview skill.

## 1 · Invite the brain-dump

Ask for everything in the human's head about the idea, in whatever order it comes out —
goals, fragments, constraints, worries. Don't interrupt and don't impose structure:
structure is produced by the interview, never demanded at capture. If the idea already
lives in a document or notes, read that instead of asking for a restatement.

If `docs/briefs/brief.md` already exists, ask whether this session sharpens that intake
or replaces it with a new one — git history keeps the old Brief either way.

## 2 · Run the interview

Load the bound grilling skill and run it against the captured idea. Frame adds two
rules of its own to the session:

- **Open with the scope envelope** — whole app, one feature, one task? Every question
  after is budgeted against that answer: a weekend toy earns a handful, a production
  system earns a long grilling.
- **Sort every resolved thread into decided or deferred.** Deliberately deferring a
  question to Design is an answer; letting it drop silently is not.

Exit only when the Brief would be **sharp enough to design against**: a designer could
pick it up and make architecture and technology choices without asking the human
anything foundational. Intent, scope edges, constraints, and success criteria are all
pinned — if any is still fuzzy, keep the interview going.

## 3 · Write the Brief

Write `docs/briefs/brief.md`. Let what the interview surfaced shape the document, but a
Brief that Design can consume answers all of these, so they are the default sections:

- **Intent** — what this is and why it should exist, in the human's own terms.
- **Scope envelope** — the size of the ask, and what is explicitly out.
- **Decided** — every decision the interview resolved, with the why where it was
  contested.
- **Deferred** — questions deliberately left for Design, named so they aren't lost.
- **Constraints** — technology, integration, budget, timeline — whatever binds the
  solution space.
- **Done looks like** — observable success criteria.

Close by telling the human the Brief is ready and that Design consumes it next.
