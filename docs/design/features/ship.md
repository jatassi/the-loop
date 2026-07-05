# ship — per-project recipe behind one human gate

**Status:** shipped (v1 evidence-package mechanics 2026-07-03, ADR-0033; pared to
the skeleton by ADR-0039).

## What it is

Ship prescribes only the skeleton — **verify ready → human gate → deploy → verify
working** — and runs the project's own recipe, recorded in `design.md`'s
`## Ship recipe` section at Design time (ready checks, deploy commands, health
check, rollback path). The skill (skills/ship/SKILL.md) is a thin runner:

1. **Verify ready** — pin the tip; full suite + recipe ready-checks + replay
   `docs/probes/<id>.md` for the shipping features (pack replay's only home).
2. **The gate** — features, diff-stat vs the last ship tag, results, rollback
   pointer, presented in the chat; explicit approval; the one synchronous gate in
   the loop. Tip moved → re-run step 1, don't re-litigate.
3. **Deploy + verify working** — recipe commands verbatim; the health check judged
   honestly (deploy "succeeded" with failing health = failed ship → rollback path,
   verify, report).
4. **Record** — tag `ship-N`, `the-loop set-status <id> shipped`, one short
   `docs/ships/ship-N.md` block (date, tag, features, outcome, rollback pointer),
   one commit.

Subset ships are allowed — the release train is the human's call. This repo's own
recipe (marketplace-on-main plugin deploy) lives in design.md with its observed
operational lore; ship-1/ship-2 records in `docs/ships/` predate v2 and keep their
v1 shape as history.
