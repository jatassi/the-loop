# Review catalog — the standards axis

How code quality is judged on a finished diff. This axis is separate from the spec
axis (does the diff satisfy its contract?) — never merge the two judgments.

Framing rules:

- A finding is a **labelled heuristic** ("possible Feature Envy"), never a hard
  violation. Judgment sits on top; a documented project standard that endorses
  the pattern **suppresses** the finding.
- Every finding cites `file:line` and names its smell. "The code is messy" is
  not a finding.
- Skip anything a linter, typechecker, or formatter already catches.

## Hunt first — the two signature agent smells

- **Duplicate Code** — the same logic cloned instead of consolidated; agents
  clone because searching is dearer than generating. → consolidate to one owner.
- **Speculative Generality** — abstraction, parameters, or hooks for needs the
  contract doesn't name. → delete; inline back until a real need shows.

## The baseline

- **Long Method** — one function doing several jobs; tell: you narrate it with
  "and". → extract until each piece is one job.
- **Large Module** — no single theme; tell: naming it honestly needs "and" or
  "utils". → split along the themes.
- **Feature Envy** — code more interested in another module's data than its
  own. → move it to where the data lives.
- **Shotgun Surgery** — one conceptual change touches many files. → give the
  concept one home.
- **Divergent Change** — one file keeps changing for unrelated reasons. →
  split along the reasons.
- **Data Clumps** — the same parameters traveling together. → make them a thing
  with a name.
- **Primitive Obsession** — domain concepts passed as bare strings/numbers;
  tell: validation of the same shape in several places. → a value type.
- **Message Chains** — `a.b().c().d()` reaching through structure. → ask the
  nearest owner for what you actually want.
- **Middle Man** — a module that only delegates. → apply the deletion test;
  usually cut it out.
- **Insider Trading** — modules whispering through back channels (globals,
  shared mutable state, reached-into internals). → make the interface carry it.
- **Refused Bequest** — inheriting then stubbing or ignoring the parent. →
  compose instead.
- **Temporary Field** — state only meaningful during one operation. → a local
  or a parameter, not a field.
- **Tautological Test** — a test that asserts the mock, the fixture, or the
  constant it just set. → assert observable behaviour through the interface,
  or delete the test.
