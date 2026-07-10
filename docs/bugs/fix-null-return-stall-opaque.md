# fix-null-return-stall-opaque — a transient executor API failure (agent() → null) becomes a terminal stall with an opaque note and no retry

**Date:** 2026-07-09 · **Affects:** execution-pipeline (drive.md contributes) · **Class:** opaque-error (dropped identity) + missing in-run recovery · **Cause established by:** reproduced
**Environment:** the-loop v0.4.10; `plugin/workflows/execution-pipeline.js` under the Claude Code Workflow harness; reproduced standalone with `test/execution-pipeline-harness.js` · **Determinism:** always, whenever `agent()` returns null · **Regressed since:** never worked — the null path has carried the fixed string `'agent returned null'` since the spawn choke point was written; the `error.message` enrichment that landed with fix-environment-halt-accounting covered only the *thrown-error* branch and never touched the null branch

## Symptom as reported

Live-session run `wf_94068f60-f16` (state file
`~/.claude/projects/-Users-jatassi-Git-j45/ebf87348-b22b-4cbf-918c-c6b979c2b9ee/workflows/wf_94068f60-f16.json`).
The run log carries
`[(1/6) live-session/domain-session via grok] failed: API Error: Server error mid-response. The response above may be incomplete.`
and the run result is
`{"stalled":[{"feature":"live-session","agent":"the-loop:drive","note":"agent returned null"}]}`.
One transient grok 5xx killed the drive agent mid-response; the harness exhausted its
own retries and returned null; the pipeline booked the feature as stalled with a note
that names neither the error nor the task. The human had to read the run log/journal,
regenerate the execution context, and relaunch the whole run by hand.

## Steps to reproduce

1. In a checkout of the-loop, script a single-feature run through
   `test/execution-pipeline-harness.js` (feature `live-session`, small-path).
2. Script **no** reply for the first spawn (`byLabel({})`) — the stub then resolves
   `agent()` to `null`, exactly as the live harness does when a subagent dies on a
   terminal API error after its own retries (Workflow tool contract: `agent()`
   "Returns null if the user skips the agent mid-run or the subagent dies on a
   terminal API error after retries").
3. Run the script; inspect `result.stalled` and the recorded `spawns`.

Observed (red): `spawns.length === 1` (no respawn) and
`result.stalled === [{ feature: 'live-session', agent: 'plan', note: 'agent returned null' }]`
— the note carries neither `opts.label` (the task/executor identity, present at the
choke point) nor any failure text; the run performs zero in-run retry.

## Expected result

Two contract obligations, both currently unmet:

1. **Self-explanatory summary.** ADR-0029's `stalled` exists "so the run never
   silently swallows a dead agent"; the summary is the only artifact the human reads
   at the gate. A stall note must name *which* spawn died — its `opts.label`
   (`(1/6) live-session/domain-session via grok`) is right there at the choke point —
   so no journal dive is needed. The sibling thrown-error branch already carries
   `error.message`; the null branch is the sole choke-point exit that discards its
   identity.
2. **In-run recovery of a known-transient failure.** The scheduler comments assert
   stalls are the lane the scheduler "silently retries" — but that retry is only
   *cross-run* (rerun next pass, human-launched). A single transient 5xx should not
   cost a full manual re-run when a fresh respawn would very likely succeed.

## Actual result

`spawn()` (`plugin/workflows/execution-pipeline.js:137`) maps every null return to the
fixed literal:

```js
if (r == null) { return { stalled: { feature: featureId, agent: opts.agentType, note: 'agent returned null' } }; }
```

No `opts.label`, no failure text, no retry on this path (nor on the thrown-error path
at line 132). In `wf_94068f60-f16` that produced a run summary naming the drive agent
type but not the task, not the executor, and not the grok 5xx that actually killed it.

## Root cause(s)

**Trigger** — a transient grok 5xx ("Server error mid-response") killed the drive
agent mid-response. The harness applied its own retries, exhausted them, and returned
`null` per its documented contract. This is a textbook *stall* (transient infra), not
a blocked or halt condition — the classification is correct; the handling is not.

**Underlying cause A (opaque note).** The null branch hardcodes
`note: 'agent returned null'`, discarding `opts.label` — which is in scope at the
choke point and, for the drive reroute, is the richest identity the run has
(`(1/6) live-session/domain-session via grok`, assembled in `executorReroute` /
`buildSpawnOpts`). fix-environment-halt-accounting enriched the *thrown-error* branch
to `note: error.message` but left the null branch on its original fixed string, so the
one failure mode the live harness actually emits for a dead executor (null, not a
throw) is also the one with the least informative note.

**Underlying cause B (no in-run recovery).** `spawn()` performs zero retry on either
failure path. The "retry" the scheduler comments promise is entirely cross-run: a
stalled feature is simply re-attempted if a human relaunches. A transient blip
therefore always costs a manual re-run, contradicting the comment's own framing that
stalls are what "the scheduler silently retries".

**The nuance — why the safe fix is asymmetric.** `null` is *ambiguous*: the contract
collapses "user skipped the agent" and "subagent died on a terminal API error after
retries" into the same bare `null`. The script has no discriminator — verified: the
stub (and the live harness) hand `spawn()` a value-less `null`, and `spawn()` reads
nothing else. So an **unconditional** respawn on `null` is unsafe: it would re-launch
an agent the human *deliberately* skipped, overriding an explicit human choice, and it
partly duplicates the harness's own already-exhausted retries. Retry is only
unambiguously safe on the *thrown-error* branch, where the failure is a real exception
(never a user-skip) and is classifiable as transient. The observed case surfaced as
null, so recovering it in-run requires a *bounded, loud, human-skippable* respawn — a
design call the gate must make (see Fix design), not a silent default.

**Why nothing caught it.** `test/execution-pipeline-halt.test.js:113-121`
("a null agent return stalls the feature with the pinned note") **enshrines** the bug:
it asserts `note: 'agent returned null'` as correct and, with a single-feature scope,
implicitly pins the single-spawn / no-retry behavior. The test locks in the opaque
note and the missing retry rather than catching them; the regression fix must rewrite
this test's expectation.

## Evidence

- Run state file `workflows/wf_94068f60-f16.json`: log line
  `[(1/6) live-session/domain-session via grok] failed: API Error: Server error
  mid-response...` and result
  `{"stalled":[{"feature":"live-session","agent":"the-loop:drive","note":"agent returned null"}]}`
  — the executor and task are in the *log* but absent from the *note*.
- Red repro against the unmodified engine (recipe in Steps above, run via
  `test/execution-pipeline-harness.js`): `spawns.length === 1`,
  `spawns[0].opts.label === 'live-session'` (proving the label is available at the
  choke point), and `result.stalled[0].note === 'agent returned null'`. The two
  fix-shaped assertions — note contains the label; a second (retry) spawn occurs —
  both go **red** today.
- `plugin/workflows/execution-pipeline.js:122-142` — the choke point: catch branch
  (line 132) already carries `error.message`; null branch (line 137) carries the fixed
  string; neither branch retries.

## Fix design

This doc is the fix's design doc: `gatherFeatureInputs`
(`plugin/bin/cli-commands.js`) pushes `docs/bugs/<id>.md` as a fix feature's context
slice when no `docs/designs/<id>/design.md` exists — do not create one. Engine
constraint: the script imports nothing and has no filesystem; the fix stays inside the
harness-global idiom (`agent`/`log`/`budget`), proven against the shipped script by
`test/execution-pipeline-harness.js`.

### Part 1 — enrich every stall note (definite, no ambiguity)

`spawn()` is the one choke point. Make each stall note self-identifying by carrying
`opts.label` — for the null branch, plus the ambiguity it names so the human knows
what to check; for the thrown/environment branches, prefixed to the text they already
carry. Sketch (exact wording is the builder's):

```js
} catch (error) {
  if (isBudgetExhausted(error)) { return { halted: { reason: 'budget-exhausted', detail: error.message } }; }
  return { stalled: { feature: featureId, agent: opts.agentType, note: `${opts.label}: ${error.message}` } };
} ...
if (r == null) {
  return { stalled: { feature: featureId, agent: opts.agentType,
    note: `${opts.label}: no result — user-skip or terminal API failure after harness retries; rerun to retry` } };
}
if (r.result === 'blocked' && r.kind === 'environment') {
  return { stalled: { feature: featureId, agent: opts.agentType, note: `${opts.label}: ${r.detail}` } };
}
```

Every summary stall now names the exact spawn (feature/task/executor via the label the
run already assembled), and the null note states the two possible causes rather than
an opaque three words. This half fully resolves obligation 1 and is safe regardless of
the retry decision below.

### Part 2 — bounded in-run respawn (the gate's call)

Add at most **one** respawn of the *same* `prompt`/`opts`, logged loudly as a retry
(`log(...retry 1/1...)`) so a watching human can re-skip if they meant to skip:

- **On the thrown-error branch** — unambiguously safe (a throw is never a user-skip).
  Gate the retry on a transient classification (5xx / network / "Server error
  mid-response"-shaped), not budget-exhausted (that stays a halt). Recommended
  unconditionally.
- **On the null branch** — the observed case. Because `null` is ambiguous, a respawn
  here can re-launch a deliberately-skipped agent. Two options for the gate:
  - **(recommended) one bounded, human-skippable respawn.** Cost of a wrong fire on a
    genuine user-skip: the human skips a second time (bounded, visible via the retry
    log line). Benefit: transient executor deaths — the *observed* failure — recover
    in-run instead of forcing a full manual re-run. Fits the pipeline's primary
    autonomous use, where user-skip is the rare case.
  - **(conservative) note-only on null**, delegating recovery to the existing
    cross-run scheduler retry. Zero user-skip hazard, but does **not** recover the
    observed `wf_94068f60-f16` friction in-run.

Both options keep the retry bounded (exactly one) and idempotent-by-construction (each
task builds in its own fresh worktree per ADR-0038, so a respawn re-does, never
double-lands). Recommendation: Part 1 + the recommended bounded respawn on both
branches, since only that actually closes the observed friction; the note-only variant
is the fallback if the gate weights the user-skip hazard higher.

### Tests — `test/execution-pipeline-halt.test.js`, harness

- **Rewrite** `execution-pipeline-halt.test.js:113-121` ("a null agent return stalls
  the feature with the pinned note"): it must no longer assert the opaque literal.
  Pin instead that the note **contains `opts.label`** and states the user-skip / API
  ambiguity, and (under the recommended option) that a **second spawn** occurred
  before the stall was booked.
- Add a thrown-transient-error case: a classified-transient throw triggers exactly one
  respawn; a success on the retry lands the feature (no stall); a second failure
  stalls with a note carrying both the label and `error.message`.
- Add a budget-exhausted case alongside, asserting the transient-retry gate does
  **not** retry a budget throw (it still halts) — the retry must not defeat the halt
  taxonomy fix-environment-halt-accounting established.

### Prose surface

- `plugin/agents/drive.md` — one line: a transient executor API failure that returns
  no commit surfaces to the engine as a null/stall (retryable), and the drive agent
  should keep its own failure narration in a field the engine surfaces, not only in
  the run log.

## Regression

1. Given a spawn whose `agent()` returns `null`, when the run summary returns, then the
   feature's stall note **contains its `opts.label`** (feature/task/executor identity)
   and names the user-skip / terminal-API-failure ambiguity — never the bare literal
   `agent returned null`. (First criterion; the builder derives the failing test from
   the rewrite of `execution-pipeline-halt.test.js:113-121`.)
2. Given a spawn that throws a classified-transient API error, when it is handled, then
   `spawn()` performs exactly one respawn of the same prompt/opts (logged as a retry);
   a success on the retry lands the feature with no stall; a second failure stalls with
   a note carrying both the label and `error.message`.
3. Given the recommended null-path option, a null return likewise triggers exactly one
   bounded, log-announced respawn before the feature is booked stalled.
4. Given a budget-exhausted throw, the transient-retry gate does not retry it — the run
   still halts (`reason: 'budget-exhausted'`), preserving the halt taxonomy.

## Validation procedure

`execution-pipeline`'s validation gains one exercise step (no standalone procedure for
the fix): drive a harness run whose first spawn returns null and confirm the returned
summary's stall note names the task label and the ambiguity — and, under the
recommended option, that a retry spawn was recorded before the stall. This rides the
same harness-driven exercise the environment-block regression uses under
`docs/validation/worktree-parallelism/`.
