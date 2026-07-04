# Probe — grok's native `--worktree`/`--worktree-ref` flags on a throwaway repo

**Status:** Probe record (the ADR-0029 probe pattern, matching this feature's own
research precedent — `docs/research/2026-07-03-workflow-spawn-opts-precedence.md`).
Produced 2026-07-03 by the `executor-delegation` feature's task `t9`, against the
already-shipped `executors/grok.md` playbook (`t3`), which names this exact probe
as the gate on ever flipping its `worktree:` field from `driver-made` to `native`.

## The question

`executors/grok.md`'s "More lore" section states grok "exposes `--worktree` and
`--worktree-ref` flags that claim to run natively against a given worktree and
ref, but their behavior has not yet been observed in practice," and pins
`worktree: driver-made` in the machine block pending this probe. The question:
**do grok's `--worktree`/`--worktree-ref` flags, invoked the way the drive agent
actually invokes grok (headless, single-turn, `--always-approve
--no-subagents`), produce a usable isolated worktree run** — i.e. does the work
land on a separate checkout/branch the driver could inspect and fold in
isolation, the same guarantee `driver-made` mode gets today from `git worktree
add --detach`?

## Setup

A throwaway repo, created outside this checkout, with no relationship to any
loop feature:

```
mkdir -p /tmp/grok-worktree-probe/throwaway-repo && cd /tmp/grok-worktree-probe/throwaway-repo
git init
git config user.email "probe@example.com"
git config user.name "Probe"
echo "# throwaway" > README.md
git add README.md
git commit -m "initial commit"
```

`grok --version` (0.2.82, stable) and the playbook's own `auth_smoke` (`grok -p
"say PONG" --max-turns 1` → `PONG`) both passed first, confirming the CLI is
present and authenticated in this environment — the flags could actually be
exercised, not just read from `--help`.

## Commands run and observed behavior

Four separate headless invocations were run against fresh or continuing state in
the throwaway repo, each adding `--worktree <name> --worktree-ref main` to a
command shape otherwise matching the playbook's `invocation` template (`-m
{model} --always-approve --no-subagents --max-turns <n> --output-format plain`,
using either `-p` or `--prompt-file` for the prompt the same way `{prompt}` would
be filled in):

```
# 1 — -p, with --cwd pointing at the repo (matching the {cwd}={worktree} slot the driver-made template fills today)
grok -m grok-composer-2.5-fast -p "Create a new file named PROBE.md containing exactly the text: worktree probe ok. Then commit it with message 'probe commit'." --worktree probe1 --worktree-ref main --cwd /tmp/grok-worktree-probe/throwaway-repo --always-approve --no-subagents --max-turns 10 --output-format plain

# 2 — -p, no --cwd, invoked from inside the repo directory instead
grok -m grok-composer-2.5-fast -p "Create a new file named PROBE2.md containing exactly the text: worktree probe two. Then commit it with message 'probe commit two'." --worktree probe2 --worktree-ref main --always-approve --no-subagents --max-turns 10 --output-format plain

# 3 — --prompt-file (the exact flag the shipped invocation template uses, not -p)
grok -m grok-composer-2.5-fast --prompt-file /tmp/probe-prompt.md --worktree probe3 --worktree-ref main --always-approve --no-subagents --max-turns 10 --output-format plain

# 4 — fresh repo, --debug added to surface any internal worktree-creation logging
grok -m grok-composer-2.5-fast -p "Create a file named PROBE4.md with the text: debug probe. Commit it as 'probe commit four'." --worktree probe4 --worktree-ref main --always-approve --no-subagents --max-turns 10 --output-format plain --debug 2>debug.log 1>out.log
```

All four exited 0 and all four completed the requested edit-and-commit task. But
every one of them committed **directly onto the checked-out `main` branch of the
one working tree already on disk** — never into a separate worktree:

- After run 1: `git log --oneline main` in the throwaway repo shows `1c7abd6
  probe commit` sitting directly on top of the initial commit; `git worktree
  list` in that repo shows exactly one entry, the original checkout itself, at
  `main`.
- Runs 2 and 3 (same repo, same branch) each add one more commit
  (`22eee97`, `fb1352f`) straight onto that same `main`, `git worktree list`
  still showing the single original entry after each.
- `PROBE.md`/`PROBE2.md`/`PROBE3.md` land as ordinary files in the repo's own
  top-level working directory (`ls` after each run), not inside any
  `probe1`/`probe2`/`probe3`-named location the `--worktree <name>` argument
  named.
- `grok worktree list` (the CLI's own tracked-worktree registry, distinct from
  `git worktree list`) never gains an entry for this repo across any of the four
  runs — it shows only unrelated, 37-day-old entries from a different project
  (`git-alphamind`), confirming the CLI's own worktree bookkeeping was never
  engaged, not just that `git`'s bookkeeping was untouched.
- Run 4's `--debug` output (`debug.log`, captured separately from stdout):
  zero lines total, and zero matches for `worktree` — the debug channel shows no
  attempt to create, resolve, or route into a worktree at all when `--worktree`
  is combined with a headless single-turn prompt.

The same result held whether the prompt was given inline (`-p`) or via
`--prompt-file`, whether `--cwd` was also passed or omitted, and across two
separate throwaway repos — four independent runs, one consistent outcome each
time.

## Conclusion — observed, not guessed: `--worktree`/`--worktree-ref` are no-ops in this invocation shape

This is a direct, reproduced observation, not an inference from documentation:
in the exact headless, single-turn, auto-approved invocation shape the drive
agent uses (`-m … --prompt-file … --always-approve --no-subagents … plain`),
adding `--worktree <name> --worktree-ref <ref>` produced **no isolation
whatsoever** — the CLI ran, edited, and committed straight against the working
tree and branch it was pointed at (via `--cwd` or the process's own cwd), with
no new git worktree, no new grok-tracked worktree entry, and no debug-log trace
of worktree logic engaging at all. `--worktree`'s own `--help` text ("Start the
session in a new git worktree") describes interactive-session behavior; nothing
observed here rules out the flag working as documented in the TUI, but the
question this probe asks — whether it works in the **headless** shape the
driver actually needs — has a clean negative answer, backed by four
reproductions, not a single anomalous run.

## Standing consequence — the shipped playbook stays `driver-made`; native is a gated follow-up

Both hold regardless, and both were already the shipped state before this
probe ran:

1. **`executors/grok.md`'s machine block keeps `worktree: driver-made`.** The
   observed behavior is exactly the failure mode the playbook's own lore
   anticipated — the flags exist and parse, but produce no isolated run in
   the shape the driver needs, so nothing here changes the shipped choice; it
   confirms it.
2. **Flipping to `worktree: native` is a follow-up playbook amendment, not part
   of this feature, and it is gated on this record being clean** — i.e. gated
   on some future observation that contradicts the negative result above (for
   example, a differently-shaped invocation, or a newer CLI version, that
   demonstrably produces an isolated worktree headlessly). Until such a record
   exists, the driver keeps cutting and managing worktrees itself
   (`git worktree add --detach`), and `--worktree`/`--worktree-ref` stay unused
   by the shipped invocation template.
