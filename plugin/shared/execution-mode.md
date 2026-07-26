# Execution mode — when a feature is attended rather than unattended

Reference for the surfaces that write `execution` onto a feature record. `execution`
is `autonomous | interactive` — who does the work, orthogonal to how far along it is.
**Absent means `autonomous`.**

It is the human's answer, never yours to infer: an agent deciding for itself which
work it may run unattended is the wrong party asking. Ask every time, even when you
flag nothing — a question that disappears when the recommendation is "no" is not a
question, and the unflagged case is exactly where a wrong default sticks silently.

## Recommend `interactive` when any of these fire

- **Taste.** Visual design, copy, tone, naming, API ergonomics. There is no test for
  "this reads well", and a model's confident default is precisely the templated
  result the human is trying to avoid.
- **The work *is* the decision.** The deliverable is a set of rulings and the
  implementation is trivial once they are made — a trim pass, a naming sweep, a
  policy trade-off.
- **Adjudication-shaped acceptance.** A criterion whose subject is a human act
  ("every candidate carries a ruling", "the human approves the wording").
- **Only a person can see it.** Correctness that shows up in a rendered page, on a
  device, in how something feels — something the validator's environment cannot
  reach.
- **An open fork, or an unwritten preference.** A real alternative is still live (two
  defensible answers, and the choice is a trade-off), or the human holds a preference
  they have not managed to write down. What cannot be specified has to be attended.
- **Hard to reverse and cheap to get subtly wrong.** Schema migrations, public API
  breaks, destructive operations, auth and permissions.

## Recommend `autonomous` otherwise

Acceptance expressible as tests, no fork open, a wrong answer caught by the suite.
That is the common case and the default.

## The one-line test

*Would the human want to look at the result before it lands — and can the acceptance
criteria make them look?* Yes and no means `interactive`.
