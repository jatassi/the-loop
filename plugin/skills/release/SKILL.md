---
name: release
description: Run the project's own release recipe behind one human gate — verify ready, deploy, verify working. Use when /begin proposes a release or the human asks to release.
---

# Release — verify ready → human gate → deploy → verify working

Release prescribes only this skeleton (ADR-0039). The particulars live in the project's
own recipe: the `## Release runbook` section of `docs/architecture.md`, recorded at
Design time — ready-check commands, deploy commands, health-check command, rollback
path. No recipe recorded → say so and elicit one with the human before anything runs;
write it into that section so the next release just reads it.

## 1 · Verify ready

Pin the tip you're releasing (`git rev-parse <target>`). At that tip: run the full
test suite, the recipe's ready checks, and replay `docs/validation/<id>/procedure.md` for each
feature in this release (the end-to-end pass — its only home). Any red stops here;
report what failed and go no further.

## 2 · The human gate

Present, in the chat: the features releasing (graph `validated` set, or the human's
subset), a diff-stat against the last release tag, the procedure/suite results, and the
rollback pointer (the previous release tag). Wait for explicit approval — this is the
one synchronous gate in the loop, and it is never skipped. If the target tip moved
since step 1, re-run step 1; don't re-litigate the gate.

## 3 · Deploy and verify working

Run the recipe's deploy commands verbatim. Then its health check — and judge it
honestly: a deploy that "succeeded" with a failing health check is a failed release.
On failure, follow the recipe's rollback path, verify health again, and report what
happened; the release record still gets written, marked rolled-back.

## 4 · Record

- Tag the released tip `v<N>` (N = previous version + 1).
- Flip each released feature: `the-loop set-status <id> shipped` — except a released
  `fix-<slug>` node (a diagnose fix): prune its entry from the feature graph
  entirely instead of flipping it. Its RCA doc survives at `docs/bugs/<id>.md`; the
  graph stays the picture of the system, not its repair log.
- Write `docs/releases/v<N>/report.md`: one short block — date, tag, features, outcome,
  rollback pointer. List pruned fix ids among the released features too.
- Commit the record + graph flip as one commit (`v<N>: <outcome>`).
