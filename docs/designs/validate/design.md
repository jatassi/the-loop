# validate — Independent validator (tests + one independent look)

**Status:** shipped (v1 four-leg protocol, ADR-0028; cut to ADR-0035's bar by the
v2 taming).

## What it is

The one independent look a feature gets. A fresh-context validator
(agents/validate.md) that did not build the feature judges what actually landed:

1. **Assemble** — integration worktree from the target; merge the feature's
   branches in topological order (plan branch first, then task branches); `git rm`
   the plan file (plans never land). A merge conflict is a feature-shaped block.
2. **Judge** — read the diff and touched files; each acceptance criterion met/unmet
   with self-observed evidence; full suite + lint once; tests must actually bite
   (a test that passes without exercising the new surface isn't evidence). If a
   validation-runbook binding rides the prompt: bring up, exercise each criterion,
   tear down, and write `docs/runbooks/<feature>/runbook.md` — the pinned
   end-to-end steps release replays later (their only replay point).
3. **Verdict** — pass: `the-loop set-status <id> validated`, collapse to ONE squash
   commit (`git reset --soft` to the target tip, commit `"<id>: <title>"`), publish
   by fast-forward (`git fetch . <branch>:<target>`; rebase-and-retry once if the
   target moved), delete the feature's branches. Fail: merge nothing, leave
   branches for inspection, return findings + options. Fail closed: "can't tell"
   is a fail.

## What v2 deleted (ADR-0035)

The blind derive stage, the integrity-forensics leg, the delta-proof second
bring-up, per-feature replay of prior runbooks (O(F²) — regression protection is
the suite's job), persisted verdict files, and the remediation-round machinery. The
verdict is the structured return; the graph flip + squash commit are the durable
trace.
