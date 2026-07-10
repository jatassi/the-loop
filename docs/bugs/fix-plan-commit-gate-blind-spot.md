# fix-plan-commit-gate-blind-spot — Plan's decomposition leaves a registration-hub edit unordered from its implementer, producing a task whose single commit cannot pass a whole-project pre-commit gate

**Date:** 2026-07-09 · **Affects:** plan, worktree-parallelism, execution-pipeline · **Class:** contract-drift (decomposition-policy blind spot) · **Cause established by:** inspected (waiver: policy defect in prompt text; failure evidenced in recorded run transcripts)
**Environment:** the-loop v0.4.10, `plugin/agents/plan.md` on main; downstream repo j45 is a bun monorepo whose `.githooks/pre-commit` runs `bun run check` (a whole-project typecheck) on every commit in every worktree · **Determinism:** always — for any registration-hub edit split from its implementing task under a whole-project commit gate · **Regressed since:** never worked (blind spot present since the policy text was written)

## Steps to reproduce

Inspection waiver: this is a policy defect in an agent's prompt text, so the "repro" is inspection of the policy plus the recorded run transcripts where it fired. Closest mechanical repro path:

1. Take a project with a whole-project pre-commit gate — j45's `.githooks/pre-commit` runs `bun run check`, a whole-project typecheck, on every commit in every worktree.
2. Design a feature whose implementation adds a new registration-hub member (an `RpcGroup` merged into the shared `J45Rpcs` hub via `PublicRpcs.merge(...)`) and whose satisfying implementation (the handler layer in `RpcHandlersAll`) is a *different* concern.
3. Let Plan decompose it. Under the current policy (plan.md §2, the parenthetical at lines ~35–39), Plan treats the hub merge as "registration-shaped sharing … fine left unordered," so it puts the `J45Rpcs` merge in the schema-only task (`domain-schema`) and the handler in a later task (`exercise-handlers`).
4. Build the `domain-schema` task. Its acceptance criterion 2 requires merging `ExerciseRpcs` into `J45Rpcs`. The commit runs the pre-commit hook → `bun run check` fails because `packages/server` builds `RpcServer.layer(J45Rpcs)` with an exhaustive `Layer.mergeAll` of one handler per member, and the merged group has no handler yet → unsatisfied context requirement → whole-project typecheck red → hook rejects the commit.

Observed live in run `wf_a53a5f81-dbb` (feature exercise-library, task domain-schema, 2026-07-09).

## Expected result

The contract Plan produces for every task must be *landable standalone*: each task's single commit must pass the project's own commit gate on its own. This is the decomposition contract implied by build.md ("commit everything as ONE commit") combined with a project that gates every commit. plan.md's file-disjoint / merge-point relaxation must therefore account for whole-project commit gates — a registration-hub edit may be left unordered only when the resulting commit leaves the whole project green standalone; where a whole-project commit gate is in force, the hub edit must ride the same task/commit as the implementation that satisfies it.

## Actual result

Plan emitted a `domain-schema` task whose own acceptance criterion required the `J45Rpcs` merge, split from the `exercise-handlers` task that supplies the handler. The build agent for that task returned `blocked` rather than bypass the gate. Verbatim, from the build agent's reasoning (agent `adaea72dbc709131d`, journal `wf_a53a5f81-dbb/journal.jsonl`):

> "this task's own acceptance criterion 2 requires merging `ExerciseRpcs` into `J45Rpcs`... but doing so breaks `packages/server`'s whole-project typecheck, which the repo's mandatory `.githooks/pre-commit` hook (`bun run check`)... enforces on every commit in every worktree... Bypassing the hook (`--no-verify`) is the only mechanical way to land the commit as specified."

The whole feature blocked. The human manually re-split the committed plan.md (moved the `J45Rpcs` merge into `exercise-handlers`, re-pointed `client-exercise-library`'s `depends_on`) and relaunched as `wf_5f8d2bcb-f4a`, which completed. On the executor side, the first full grok session (19 assistant turns, brief 0 = "merge into J45Rpcs") was discarded and re-run with a corrected brief ("it must NOT be added to J45Rpcs in this task").

## Root cause(s)

**Trigger.** A feature whose design splits a registration-hub edit (merging a member into a shared hub) from its satisfying implementation, run against a project with a whole-project pre-commit gate.

**Underlying cause 1 — the policy conflates two distinct gates (`plugin/agents/plan.md:35–39`).** The parenthetical tells the plan agent that "registration-shaped sharing — a line or two in a barrel export, a route table — is fine left unordered, since the merge point resolves it under the test-gated merge policy." This is false whenever a commit gate sits *before* the merge point. Two different gates are being conflated:

- The **merge-point** gate — the test-gated merge policy (glossary; ADR-0042) — resolves only *textual conflicts* between two branches touching the same file, proven by the merged suite going green. It engages at sibling merge, integration merge, and publish-rebase.
- The **commit-time** gate — a whole-project pre-commit hook that runs a whole-project typecheck/test/lint on *every commit in every worktree*, long before any merge point.

The failure here is neither textual nor at a merge point: a single task's commit leaves the whole project semantically broken (a merged hub member with no handler), and the pre-commit hook rejects it. The test-gated merge policy the plan agent is told to rely on never even engages. The policy's premise — "the merge point resolves it" — assumes the earliest gate a commit meets is the merge; under a whole-project commit gate the earliest gate is the commit itself, and the unordered split makes that commit unlandable.

**Underlying cause 2 — Plan is structurally blind to the commit gate (`plugin/workflows/execution-pipeline.js:169–187`).** Even if the policy wanted to reason about commit gates, the plan agent never sees whether the project has one. The resolved hook inventory carries a `precommit` family (`plugin/config/hook-defaults.json:3`; `buildHooksTable` in `plugin/bin/cli-commands.js:133`), and `prepare-execution-context` threads `hooks` into the execution context (`assembleExecutionContext`, `plugin/src/prepare-execution-context.js:94–100`). But `planPrompt` surfaces only acceptance, design notes, the design doc, and the calibration digest — it never includes `executionContext.hooks`. The one gate whose standalone-landability every task contract must respect is invisible at decomposition time. The loop's model of the commit gate lives only where it is *enforced* (build.md, validate.md) and where it is *recorded* (configure), never where it must be *designed around* (plan).

**Why no existing check caught it.**

- plan.md asserts its own false premise ("the merge point resolves it"), so the policy is self-sealing — nothing in the prompt invites the agent to question it.
- `the-loop plan check` (`validatePlan` in `plugin/src/plan.js`) deliberately does not police footprint overlap or landing constraints (ADR-0042, header comment `plugin/src/plan.js:5–7`): "disjointness is the plan agent's bias, not a lint law — a shared file surfaces at the merge point." The lint has no model of commit gates at all, and its stated rationale is the same false premise.
- build.md's invariants are correct and are exactly what surfaced the symptom: the build agent refused `--no-verify` (its no-bypass / footprint-lease invariants) and returned `blocked`, behaving as designed. But the gate fired at the wrong altitude — it stops the bad commit only after decomposition already committed a full executor session (19 turns) to an unlandable contract. build enforces the gate; it cannot design around it.

## Evidence

- Policy text: `plugin/agents/plan.md:35–39` (the "registration-shaped sharing … fine left unordered" parenthetical).
- test-gated merge policy scope: `docs/glossary.md` ("test-gated merge policy" entry — textual conflicts at merge points only); `plugin/agents/validate.md:15–24`; `plugin/agents/build.md:16–24`.
- Plan prompt omits hooks: `plugin/workflows/execution-pipeline.js:169–187` (`planPrompt`) vs. `assembleExecutionContext` carrying `hooks` (`plugin/src/prepare-execution-context.js:94–100`) and `buildHooksTable`/`precommit` family (`plugin/bin/cli-commands.js:133`, `plugin/config/hook-defaults.json:3`).
- Lint declines to police this: `plugin/src/plan.js:5–7`.
- Live failure: journal `~/.claude/projects/-Users-jatassi-Git-j45/5f7ec9fa-c218-47fe-826f-56c2af8b624a/subagents/workflows/wf_a53a5f81-dbb/journal.jsonl`, build agent `adaea72dbc709131d` (verbatim reasoning quoted above). Recovery run `wf_5f8d2bcb-f4a` completed after the human re-split.
- Executor side: grok session dir `~/.grok/sessions/%2FUsers%2Fjatassi%2FGit%2Fj45%2F.claude%2Fworktrees%2Floop-exercise-library--domain-schema/` — `prompt_history.jsonl` brief 0 says "merge into J45Rpcs"; re-run brief says "it must NOT be added to J45Rpcs in this task … The merge into J45Rpcs happens in a later task, exercise-handlers." First full session (19 assistant turns) discarded.
- Downstream generalization + recovery ref: j45 project memory `~/.claude/projects/-Users-jatassi-Git-j45/memory/j45rpcs-merge-with-handler.md` (records the same mechanism, the `LibraryRpcs`+`LibraryHandlersLive` correct precedent, and the re-split fix commit `683f099`). The j45 session also flags three backlog features (flow-control, session-history, workout-generation) that would hit the same trap.

## Fix design

Two coordinated changes; the wording is primary, the prompt change is what makes the wording actionable.

**A. plan.md — add a landing-constraint invariant to §2 (Decompose).** State an explicit invariant governing decomposition, and condition the existing relaxation on it. Concretely, rewrite the `footprint` parenthetical (lines ~35–39) so it reads to the effect of:

> `footprint` (expected files — disjointness is a bias, not a rule: chain via `depends_on` only when two tasks' edits to a shared file genuinely interact). **Landing constraint: every task's single commit must pass the project's own commit gate standalone.** Registration-shaped sharing — a line or two in a barrel export, a route table, a hub merge — is fine left unordered **only when that commit leaves the whole project green on its own**. Where a whole-project commit gate is in force (a pre-commit hook that runs a whole-project typecheck / test / lint on every commit — see the `precommit` posture in your prompt), a registration edit that a *later* task's code must satisfy (a hub member whose handler/implementation lands elsewhere) may **not** be split ahead of that implementer: place the registration edit in the **same task/commit** as the implementation that satisfies it, or order the registrar after the implementer via `depends_on`. The merge-point relaxation resolves textual conflicts; it does not make an individually-unlandable commit landable.

Place it inside the `footprint` bullet where the current relaxation lives, so it governs the same judgment. Keep the wide-shallow-graph guidance that follows.

**B. execution-pipeline.js — surface the precommit posture to Plan (`planPrompt`, lines ~169–187).** Add the resolved `executionContext.hooks.precommit` (system + posture) to the plan prompt, e.g. a line `commit gate: <system> (<posture>)` when a whole-project gate is bound, or `commit gate: none` otherwise. Without this, invariant A is unactionable — Plan cannot condition on a gate it cannot see. (Plan has Read/Grep/Bash and could self-discover the hook, but relying on discovery is fragile; the posture is already resolved in the execution context and should simply be passed.)

**C. build.md / drive briefs — no new invariant needed.** Once Plan emits a correct contract (schema-only task defines the hub member standalone; the merge line lives in the implementer's task/commit), the build/drive path already does the right thing: the footprint lease and the "build exactly what its criteria say" invariant keep a build agent from touching the hub outside its task, and the no-`--no-verify` invariant is precisely what surfaced this bug. The defect is entirely upstream in decomposition; build's contract-execution invariants are already correct. No change to build.md or drive.md.

## Regression

The fix's acceptance pins: given a project with a whole-project pre-commit gate and a feature whose design merges a new hub member whose implementation is a separate concern, Plan's decomposition places the hub-merge edit in the same task/commit as its implementer (or orders it after via `depends_on`) — never in a standalone schema-only task ahead of the implementer — such that every emitted task's single commit passes the gate standalone. The j45 exercise-library shape (ExerciseRpcs / J45Rpcs / exercise-handlers) is the concrete case the regression test derives from.

## Validation procedure

This gains as an exercise step on the **plan** feature's validation procedure (`docs/validation/plan/procedure.md`): run Plan against a fixture feature carrying a whole-project-commit-gate posture and a split hub-member/implementer design, and assert the emitted task contracts co-locate the registration edit with its implementer (or `depends_on`-order it), rather than emitting a standalone registrar task. Not a standalone validation procedure for the fix.
