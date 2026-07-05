---
name: ship
description: Run the project's own release recipe behind one human gate — verify ready, deploy, verify working. Use when /the-loop proposes a ship or the human asks to ship.
---

# Ship — verify ready → human gate → deploy → verify working

Ship prescribes only this skeleton (ADR-0039). The particulars live in the project's
own recipe: the `## Ship recipe` section of `docs/design/design.md`, recorded at
Design time — ready-check commands, deploy commands, health-check command, rollback
path. No recipe recorded → say so and elicit one with the human before anything runs;
write it into that section so the next ship just reads it.

## 1 · Verify ready

Pin the tip you're shipping (`git rev-parse <target>`). At that tip: run the full
test suite, the recipe's ready checks, and replay `docs/probes/<id>.md` for each
feature in this release (the end-to-end pass — its only home). Any red stops here;
report what failed and go no further.

## 2 · The human gate

Present, in the chat: the features shipping (graph `validated` set, or the human's
subset), a diff-stat against the last ship tag, the probe/suite results, and the
rollback pointer (the previous ship tag). Wait for explicit approval — this is the
one synchronous gate in the loop, and it is never skipped. If the target tip moved
since step 1, re-run step 1; don't re-litigate the gate.

## 3 · Deploy and verify working

Run the recipe's deploy commands verbatim. Then its health check — and judge it
honestly: a deploy that "succeeded" with a failing health check is a failed ship.
On failure, follow the recipe's rollback path, verify health again, and report what
happened; the release record still gets written, marked rolled-back.

## 4 · Record

- Tag the shipped tip `ship-N` (N = previous + 1).
- Flip each shipped feature: `the-loop set-status <id> shipped`.
- Write `docs/ships/ship-N.md`: one short block — date, tag, features, outcome,
  rollback pointer.
- Commit the record + graph flip as one commit (`ship-N: <outcome>`).
