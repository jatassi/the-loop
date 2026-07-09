---
name: diagnose
description: Run a bug report through root-cause diagnosis to a human-gated fix and a permanent RCA doc. Use when the user reports a bug or asks to investigate one, or /begin routes a bug-shaped intake here.
---

# Diagnose — the bug door

A bug is observed behavior deviating from contract, where the *why* still needs
establishing before a fix can be trusted. Diagnose runs one conversation, end to
end: capture the report, diagnose the cause, write the RCA doc and a fix, gate
with the human, commit. No pipeline of its own — a fix is an ordinary feature
to everything downstream (Plan sizes it, Build lands it test-first, Validate merges
it); the amendment you commit at the end is the same human-gated amendment every
design change passes.

Two other doors handle everything that isn't a bug: an idea whose *what* still needs
sharpening belongs to the `define` skill; a tweak whose what and why are already
obvious is an amendment directly.

## 1 · Capture

Take the bug report as given, then fill in whatever it didn't already cover:

- **Observed vs. expected** — the exact error text, verbatim, never paraphrased.
- **Environment** — versions, OS, config that plausibly matters.
- **Determinism** — always, or how often and under what conditions.
- **Regression window** — did this ever work? If so, the last known-good ref.
  "Never worked" and "regressed" are different searches — settle which before
  diagnosing.

These four are the floor, not a form: don't impose structure on the narrative
around them, and don't re-ask what the report already answered.

## 2 · Triage the workflow path

Judge the report against two questions: is the fix trivial, and is the cause already
obvious without digging? Both yes → bypass: fix it, commit it, stop — file
an RCA doc only if the little diagnosis you did taught something worth remembering
later, your call, never a default. Either question "no" → this is loop-worthy,
continue to step 3.

## 3 · Diagnose

Hand the captured report to the diagnosing port — `/diagnosing-bugs` — unless this
project's configuration binds another diagnosis skill. No skill bound: run the
fallback discipline below yourself.

Reproduction is best-effort: aim for one command — a test, a script, a curl — that
goes red on the exact symptom. The human may still wave a fix through on a cause
established by inspection alone (reading a race straight off the code); recording
which of the two happened, honestly, is the RCA doc's job (below) — never yours to
decide reproduction isn't worth attempting.

**Stop the moment something environment-shaped blocks you** — a browser you can't
drive, a log store you can't reach, a service that's down, credentials you don't
have — anything standing between you and evidence that isn't the bug itself. Name
the blocker to the human and say exactly what it costs the diagnosis (a forced
downgrade from reproduced to inspected, a hypothesis you now can't test). Then wait:
let them fix the environment, or grant the inspection waiver themselves. Inventing a
workaround, or quietly writing the RCA doc as if reproduction happened, is never
your call.

Diagnosis is done when you can name the root cause(s) — not just the symptom that
led you to them — and say how each was established: reproduced, or inspected with
the waiver explicit. No fix design before that; move to step 4 once you're there.

## 4 · Write the RCA doc and the fix

`docs/bugs/` is born with its first entry — don't pre-create the directory, just
write into it. The doc is permanent from birth and doubles as the fix's context
slice, the document Plan, Build, and Validate read once the fix launches — write it
self-contained enough that none of them need to have sat in this conversation.

### The RCA doc — `docs/bugs/fix-<slug>.md`

```markdown
# fix-<slug> — <one-line defect statement>

**Date:** YYYY-MM-DD · **Affects:** <feature-id>[, …] · **Class:** <issue class,
e.g. race, contract-drift, parse-edge> · **Cause established by:** reproduced |
inspected (waiver: <why no repro>)
**Environment:** <versions/OS/config that matter> · **Determinism:** always |
intermittent (<rate, conditions>) · **Regressed since:** <last-known-good ref> |
never worked | unknown

## Steps to reproduce  ← numbered, from a known starting state; under an inspection
                         waiver, the closest attempt and what blocked it instead
## Expected result     ← the contract: what should happen, citing the feature
                         criterion or doc it comes from
## Actual result       ← the observed behavior, verbatim output where useful
## Root cause(s)       ← the why, not the symptom; plural when honest — separate the
                         trigger (what set it off) from the underlying cause(s), cite
                         file:line evidence, and say why no existing test or runbook
                         caught it
## Evidence            ← the diagnosis trail: logs, instrumentation, bisection, or
                         the inspection path that established the cause
## Fix design          ← the approach, interfaces touched, constraints for the builder
## Regression          ← what the fix's acceptance criteria pin (mirrors the record)
## Runbook             ← which affected feature's runbook gains this as an
                         exercise step — never a standalone runbook for the fix itself
```

### The fix — for `docs/feature-graph.md`

An ordinary, transient feature record:

```yaml
- id: fix-<slug>            # branch loop/fix-<slug> falls out for free
  title: one-line defect statement
  status: designed
  depends_on: []             # edges only for build-order coupling with other in-flight work
  acceptance:
    - regression-shaped Given/When/Then — the repro (or the inspected failure mode)
      as the first criterion; the builder derives the failing test from it
```

## 5 · Gate

Present the root cause(s) and the fix design together; wait for explicit approval
before anything is committed. This is the same human gate every graph amendment
passes — nothing lands ahead of it.

## 6 · Commit and hand off

One commit: the RCA doc plus the graph amendment (the fix, `design_version`
bumped). Then offer the prepare-execution-context leg: `the-loop prepare-execution-context --features fix-<slug>`.

## The fallback discipline (no diagnosis skill bound)

1. **Reproduce first.** One command that goes red on this exact symptom and green
   once it's fixed. No red command yet, no hypotheses yet.
2. **Capture context.** The exact error text, environment/version, determinism, last
   known good — step 1's fields, if the report skipped them.
3. **Minimise.** Shrink the repro until every remaining element is load-bearing.
4. **Bisect a regression.** A red/green command turns `git bisect run` into the
   mechanical way to find the culprit commit.
5. **Several hypotheses before testing any.** List plausible causes, each with a
   falsifiable prediction; rank them and take the top one or two.
6. **Evidence before conclusions.** Test predictions one variable at a time with
   targeted instrumentation — never log-everything.
7. **Root cause(s), not symptom.** No fix design until the why is explained;
   separate the trigger from the underlying cause(s); note why no existing test or
   runbook caught it.
8. **Pin the regression before the fix.** The minimal repro becomes the fix's
   first acceptance criterion and the RCA doc's Regression section — the builder
   derives the failing test from it; diagnosis pins what must fail, building it is
   the engine's job.
9. **Circuit breaker.** Three failed hypothesis rounds, or no repro achievable at
   all: stop, record what's known and what's been tried, and escalate to the human
   — this is the environment-shaped stop in step 3, generalised to "diagnosis is
   stuck," not just "the environment is missing something."
10. **Clean up and record.** Remove instrumentation and scratch scripts; the
    confirmed cause(s) go into the RCA doc, nowhere else.
