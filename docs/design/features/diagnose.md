# diagnose — the bug door

**Status:** designed. Renamed from `evolve` 2026-07-05 (ADR-0043): bugs only, and a
standard industry name.

## What this is

Post-ship intakes re-enter the loop through three doors that differ only in the
investigation that earns the graph amendment, then converge on the identical spine —
a human-gated amendment to `docs/design/graph.md`, then the unchanged engine:

- an idea whose **what** needs sharpening → the frame skill (Brief);
- a small tweak whose what/why are already obvious → a design amendment directly
  (or the bypass lane: trivial maintenance is just committed, no node);
- a bug — observed behavior deviating from contract, the **why** needing diagnosis
  → **this door**: RCA → fix node + permanent RCA doc → gate → the same engine.

Triage between the doors lives where routing already lives: `/the-loop`'s route
table (`commands/the-loop.md`), whose orientation already returns a `new-intake`
proposal kind. Diagnose builds no pipeline of its own — it is the diagnosis
discipline bolted onto the front of the existing amendment gate.

## The flow (one conversation, end to end)

1. **Capture** the bug report as given, then fill the intake fields the field's
   every mature tracker converges on: observed vs expected (exact error text
   verbatim), **environment** (versions, OS, config that plausibly matters),
   **determinism** (always, or how often and under what conditions), and the
   **regression window** — did this ever work, and what's the last known good
   ref? "Never worked" vs "regressed" halves the search space before diagnosis
   starts. Don't impose structure on the *narrative*; these fields are the floor,
   not a form.
2. **Triage the lane.** Trivial-to-fix AND trivially-caused → bypass lane: fix it,
   commit, done — an RCA entry is filed only when diagnosis taught something worth
   remembering (the human's call). Otherwise it's loop-worthy: continue.
3. **Diagnose via the port.** The diagnosis loop between capture and RCA belongs to
   the diagnosing port — `/diagnosing-bugs` unless this project's configuration
   binds another diagnosis skill (a landscape survey found no first-party artifact
   to point at; the strongest external candidates are obra/superpowers
   `systematic-debugging` and wshobson `debugging-strategies` — see
   `docs/research/diagnose-landscape-survey.md`). When no skill is bound, the
   skill's own bundled fallback discipline (below) applies.
4. **Reproduction is best-effort, recorded honestly — and degraded conditions are
   surfaced, never worked around.** Reproduce when feasible; the human may wave a
   fix through on an inspection-established cause (e.g. a race read straight from
   the code). The RCA doc records *how* the cause was established — `reproduced`
   with the repro steps, or `inspected` with the waiver explicit — so a wrong read
   is traceable. When reproduction or evidence-gathering is blocked by something
   *environment-shaped* — the browser MCP isn't connected to drive the web app, the
   network drive holding the logs isn't mounted, a needed service is down — **stop
   and tell the human what's missing and what diagnosis quality it costs**, then let
   them fix the environment or grant the waiver. The waiver is the human's grant,
   never the agent's silent fallback under degraded conditions.
5. **Write the RCA doc + fix node** (shapes below), present both at the gate.
6. **Gate.** Explicit human approval on root cause and fix design — this is the same
   human gate every amendment passes; nothing is committed before it.
7. **Commit** the RCA doc + graph amendment (fix node, `design_version` bump) as one
   commit, then offer the launch leg (`the-loop launch --scope fix-<slug>`).

## The bundled fallback discipline

Embedded in `skills/diagnose/SKILL.md` for when no diagnosis skill is bound — ten
steps, each justified by multiple independent traditions (citations in the research
doc):

1. **Reproduce first** — one command (test/script/curl) that goes red on this exact
   symptom and green when fixed; no red command, no hypotheses.
2. **Capture context** — exact error text, environment/version, determinism, last
   known good (the intake fields above).
3. **Minimise** — shrink the repro until every remaining element is load-bearing.
4. **If it's a regression, bisect** — a red/green command makes `git bisect run`
   find the culprit commit mechanically.
5. **Several hypotheses before testing any** — plausible causes each with a
   falsifiable prediction; rank, take the top 1–2.
6. **Evidence before conclusions** — test predictions one variable at a time;
   targeted instrumentation, never log-everything.
7. **Root cause(s), not symptom** — no fix design until the why is explained;
   distinguish the trigger from the underlying cause(s); note why no existing test
   or probe caught it.
8. **Pin the regression before the fix** — the minimal repro becomes the fix node's
   first acceptance criterion and the RCA's Regression section; the build agent
   derives the failing test from it (test-first is the engine's job — diagnosis
   pins *what* must fail).
9. **Circuit breaker** — three failed hypothesis rounds, or no repro achievable:
   stop, record what's known and tried, escalate to the human (this is the
   degraded-conditions rule in step 4 of the flow).
10. **Clean up and record** — remove instrumentation and scratch scripts; the
    confirmed cause(s) go into the RCA.

## The RCA doc — `docs/rca/fix-<slug>.md`

Permanent from birth (posterity + pattern recognition over accumulating issue
classes), and **it doubles as the fix node's context slice** — the doc the plan /
build / validate agents receive as their kernel. One doc, one home, whole life.
Filename = node id, keeping the id↔path identity used everywhere else
(`features/<id>.md`, `probes/<id>.md`, branch `loop/<id>`).

Default shape (header greppable for pattern mining):

```markdown
# fix-<slug> — <one-line defect statement>

**Date:** YYYY-MM-DD · **Affects:** <feature-id>[, …] · **Class:** <issue class,
e.g. race, contract-drift, parse-edge> · **Cause established by:** reproduced |
inspected (waiver: <why no repro>)
**Environment:** <versions/OS/config that matter> · **Determinism:** always |
intermittent (<rate, conditions>) · **Regressed since:** <last-known-good ref> |
never worked | unknown

## Steps to reproduce  ← numbered, from a known starting state; under an inspection
                         waiver, the closest attempt and what blocked it
## Expected result     ← the contract: what should happen (cite the feature
                         criterion or doc it comes from)
## Actual result       ← the observed behavior, verbatim output where useful
## Root cause(s)       ← the why, not the symptom; plural when honest — distinguish
                         the trigger (what set it off) from the underlying cause(s),
                         cite file:line evidence, and note why no existing test or
                         probe caught it
## Evidence            ← the diagnosis trail: logs, instrumentation, bisection,
                         or the inspection path that established the cause
## Fix design          ← the approach, interfaces touched, constraints for the builder
## Regression          ← what the fix's acceptance criteria pin (mirrors the node)
## Probe               ← fold-in instruction: which affected feature's probe pack
                         gains which exercise step (never a standalone fix pack)
```

## The fix node — an ordinary feature node, transient

```yaml
- id: fix-<slug>            # branch loop/fix-<slug> falls out for free
  title: one-line defect statement
  status: designed
  depends_on: []            # edges only for build-order coupling with other in-flight work
  acceptance:
    - regression-shaped Given/When/Then — the repro (or inspected failure mode) as
      the first criterion; the builder derives the regression test from it
```

The engine has **no diagnose-specific branches**: plan sizes it (lane bias: small),
build lands it test-first, validate merges and flips status — a fix is just a
feature to them. **Lifecycle:** at ship, the ship flow's Record step prunes shipped
fix nodes from the graph (their yaml lines only) in the same commit that flips
statuses and writes `docs/ships/ship-N.md` — the ship record lists the fix ids, the
RCA doc survives, git archives the rest. The graph stays the picture of the system,
not its repair log.

## Surfaces this feature builds or edits

- **`skills/diagnose/SKILL.md`** (new) — the flow above. Authoring rules: the agent
  drafting the skill invokes `/writing-great-skills` FIRST — before writing a line
  of the skill — and drafts to its standard; fully self-contained (no ADR or
  internal-doc references); a final `/writing-great-skills` pass before landing.
- **`commands/the-loop.md`** — one route line: a bug-shaped intake (or the
  `new-intake` proposal when the answer is "a bug") → the diagnose skill.
- **`bin/cli-commands.js`** — the slice lookup fallback in `gatherFeatureInputs`,
  currently:

  ```js
  const docFile = path.join(FEATURES_DIR, `${id}.md`);
  const designDoc = existsSync(docFile) ? readFileSync(docFile, 'utf8') : null;
  ```

  gains one fallback: when `docs/design/features/<id>.md` is absent, try
  `docs/rca/<id>.md` before warning. Unit-test the fallback (fixture with an rca/
  doc and no features/ doc).
- **`skills/ship/SKILL.md`** — one line in step 4 (Record): prune shipped fix
  nodes from the graph in the ship commit.

## Constraints

- No new engine branches, no new proposal kinds, no new agent types — composition
  with the existing amendment gate and lanes is the point.
- `docs/rca/` is born with its first entry; nothing pre-creates it.
- Severity tiering (the sev-1 express lane) is a separate feature
  (`severity-tiering`) — a rigor dial on this door, designed later; nothing here
  may preclude an expedited-but-still-gated path.
