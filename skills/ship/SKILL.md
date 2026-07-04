---
name: ship
description: Ship the validated frontier as one release — assemble the evidence package at a pinned tip, hold the human approval gate, then run the deploy corridor. Use when /the-loop proposes a ship, or when the /the-loop ship jump routes here directly.
---

# Ship — validated frontier → deployed, evidence-gated

Ship is human-gated: it assembles an evidence package pinned to one exact tree,
presents it, holds a synchronous approval gate, and only then touches production.
Every evidence leg runs inline in this session — nothing is delegated, and nothing is
assumed about prior context. Ship deploys the **whole validated frontier** at the
integration target's tip as a single release, and never a tree the human did not
approve.

## 1 · Entry protocol — three gates in order, each a hard stop

Ship runs entirely on the **integration target** — `main`, unless the narrative in
`docs/design/design.md` names another ref. Check it out now; HEAD stays on it from the
first command to the last. Run the three gates below in this exact order and stop at
the first that holds — nothing past a held gate runs.

### Gate 1 · Healing scan — run this first, before anything else

    node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" ship status

It reports `{ships, next, previous_ship_sha, latest}`. When `latest` is present and
`latest.interrupted` is true, a prior ship recorded approval but never recorded an
outcome: it stopped **mid-corridor**, leaving production in an unknown state. Stop
here, before any assembly. Tell the human this ship is **interrupted-mid-corridor**,
name the record (`docs/ships/ship-<latest.ship>.md`), and instruct them to **verify
production by hand** — the deploy may have half-landed. The corridor is **never
auto-resumed**: a fresh ship begins only once the human has confirmed the true state
of production and recorded the missing outcome themselves. Do not assemble, do not
deploy.

### Gate 2 · Clean tree

Run `git status` on the target. A dirty tree stops everything right here: tell the
human the tree isn't clean and nothing ran. Never stash, reset, or commit anything to
make it clean, and never say whose change it is.

### Gate 3 · The frontier

The frontier is **every feature whose status in the feature graph
(`docs/design/design.md`) is `validated`**. Ship deploys the whole frontier together —
**whole-frontier only, never a subset**. An empty validated set means there is nothing
to ship: say so and stop.

## 2 · Pin the evidence tree

All evidence binds to one immovable point:

- **`ship_sha`** = the target tip **right now** (`git rev-parse HEAD`). Every leg
  below runs against this tree and this tree alone.
- **`N`** and **`previous_ship_sha`** come from the Gate 1 `ship status` output
  (`next` and `previous_ship_sha`).
- **The diff range** is `previous_ship_sha..ship_sha`. For **ship-1**
  (`previous_ship_sha` is null) the range is the repo root through `ship_sha` — the
  whole history.

## 3 · Assemble the evidence package — four legs, inline

The package has four legs — `integration`, `security`, `changelog`, `waivers`. Run
them in this order; the integration check comes first because it alone can stop the
ship.

### The integration check

Replay **every pack in `docs/probes/`, oldest-first**, against the `ship_sha` tree,
through the **runtime-probe binding recorded in `docs/ports/ports.md`** — excerpt that
binding at run time; never hardcode its commands. Drive it as one lifecycle: a single
**bring-up**, then **all packs** in order, then a single **teardown** that **sweeps
clean** — it removes every temp artifact the leg produced, not only the packs' own
bring-up fixtures but any an interrupted sub-step orphaned (a killed `npm test` strands
its `mkdtemp` dirs); the leg is not done until the temp area holds none of them. Each pack masks
its volatile fields (temp-dir paths, exact dates, commit SHAs); replay **re-derives
them fresh** rather than comparing them literally. A step that fails is **retried
twice**: three reds in a row is **red**; red-then-green is **flaky-counted-passing** —
carried into the package as a pass with an **advisory** naming the flake. The leg is
red only when a step is consistently red.

### Red blocks hard

A consistently red integration check **stops the ship before any approval is
solicited** — no record is written, no gate is presented, and there is no in-loop
override. The remedy is a **bug-shaped intake, not a ship**: hand the failure back as
new work and stop. Ship never argues with, retries around, or overrides a red
integration check.

### The security review

Run the **security-review binding recorded in `docs/ports/ports.md`** over the diff
range (§2). Carry its findings into the package **verbatim** and **severity-ranked**.
These findings are **inform-only**: they inform the human at the gate and never block
the ship on their own — the human gate is the sole authority over what they mean.

### The changelog

Take the **squash commits in the diff range** as the skeleton, **excluding booking and
bookkeeping commits** — the per-task and per-resolution booking commits are not release
content. Under each frontier feature, write **session prose**: a human-readable summary
of what that feature changed. One entry per frontier feature.

### Live waivers

For every frontier feature, read `docs/validations/<feature-id>.md` and list **every
waiver recorded there, verbatim**. A waiver is a human acceptance the release carries
forward; the gate sees them all, unedited.

## 4 · The approval gate

Present the **full package** — the integration verdict (with any flake advisories), the
verbatim security findings, the changelog, and the live waivers — to the human,
synchronously. Alongside it, present the **deploy-target binding excerpted verbatim
from `docs/ports/ports.md`** — its `{deploy, rollback, smoke}` commands, exactly as
recorded — so the human approves the deploy mechanics as well as the tree.

**Surface a missing smoke suite before approval, never silently.** When the deploy
binding records no `smoke` command, say so plainly: no smoke suite means **no
mechanical health signal**, which means **auto-rollback is off for this ship** — a bad
deploy will not roll itself back. The human approves that trade-off knowingly or not at
all.

Record the human's approval as **`{approver, date}` bound to `ship_sha`** — `approver`
is `git config user.name`, `date` is today (UTC). The approval says "I approved *this*
tree"; it is meaningless detached from the `ship_sha` it names.

## 5 · Freshness — re-check immediately before booking

**Immediately before booking**, re-read the target tip. If it has moved **past
`ship_sha` by anything other than this ship's own booking commits**, the evidence is
**void**: it describes a tree that is no longer the target's tip. Say so plainly,
re-pin `ship_sha` to the new tip, and **reassemble the package from §2** against the
fresh tree — never book approval bound to a stale `ship_sha`, and never deploy a tree
the human did not actually approve.

With a fresh, approved package in hand, ship books its pre-deploy record and enters the
deploy corridor.

## 6 · Book commit 1 — evidence + approval, pre-deploy

Author `docs/ships/ship-<N>.md`: narrative prose describing the release, followed by the
`## Ship record` yaml block per the ship-record contract — `ship`, `ship_sha`, `design_version`,
`features`, the assembled `evidence` (§3), and `approval` (§4). Carry **no `outcome` key at
all**; the corridor hasn't run yet. In the same commit, set `.claude-plugin/plugin.json`'s
`version` field to `0.<N>.0`. Stage exactly those two files and commit:

    ship-<N>: book evidence + approval

This commit **lands before any prod-touching command** — nothing before this line has touched
production, and everything that follows does.

## 7 · The deploy corridor — one invocation, no prompts

Build the corridor's input from the deploy-target binding **excerpted verbatim from
`docs/ports/ports.md`** at run time — never hardcode its commands: `{deploy, rollback, smoke}`,
omitting the `smoke` key entirely when the binding records none. Run the corridor **exactly
once**:

    node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" ship corridor -

piping that JSON in. This is the **only prod-touching command anywhere in this skill**. It
drives deploy → smoke → (on any failure) rollback → smoke-verify to conclusion entirely on its
own, with **no prompts anywhere between approval (§4) and the concluded outcome** — nothing
else runs until it prints `{outcome, rollback_verified?, health_signal, steps}`.

## 8 · Book commit 2 — the outcome

Hand that JSON, verbatim, to:

    node "$CLAUDE_PLUGIN_ROOT/bin/spine.js" ship book <N> -

It writes the outcome into the ship record and inserts one Run-history bullet into the Ledger
for **every** outcome alike — deployed, rolled-back, and deploy-failed all get exactly one line.
**Only on `deployed`** does it also flip every listed feature `validated -> shipped` in
`docs/design/design.md` and fully re-render the Ledger from the flipped graph before inserting
that bullet; on `rolled-back` or `deploy-failed` neither the flip nor the re-render happens — the
Ledger keeps its prior shape plus the one new line. Stage **precisely the files that command
wrote** — the skill makes no hand edits of its own — and commit:

    ship-<N>: book <outcome>

## 9 · Failure posture — rollback_verified: false is a full stop

When the concluded JSON carries `rollback_verified: false`, that is **the loudest line** in
whatever you present next: production's own health check did not confirm the rollback restored
a good state. This is **a full stop** — Ship never takes **a second autonomous swing at prod**:
it does not retry the corridor as a whole, and it does not retry any single corridor step
(deploy, rollback, or smoke-verify) on its own. A `deploy-failed` outcome **still books commit
2** — the record must say what actually happened, verified or not — then Ship stops and hands
the human the same verify-production-by-hand instruction Gate 1 gives for an interrupted ship
(§1).

## 10 · Tag the release

After commit 2 lands, and **only when the outcome is `deployed`**, tag it:

    git tag loop/ship/<N>

This is **refs-last** — the tag is the final thing Ship does in a deployed run, after every
booking commit; a `rolled-back` or `deploy-failed` outcome gets no tag.
