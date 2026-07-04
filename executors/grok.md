# grok

The first registered executor: a headless coding CLI the drive agent runs for
rote build tasks. This file is grok's playbook — the machine block below is
everything the resolver and pre-flight need to route to and check on grok; the
narrative around it is everything the drive agent needs to run grok well and
tell a real defect from a false alarm.

Operational lore, every item load-bearing:

- grok commits only once a task is fully finished — it never commits partial
  progress along the way. That means zero commits after a run is always
  truncation, with no exception: a run that stopped before its own finish line
  never got the chance to save anything, however the rest of the tree looks.
- The CLI's default model, when no model flag is given, is Composer
  (`grok-composer-2.5-fast`) rather than `grok-build`. The invocation template
  below always passes `-m {model}` explicitly for this reason — the intended
  model is never left to the CLI's own default.
- grok's built-in `search_replace` edit tool flakes on large or
  highly-repetitive files: it can fail to find or misapply a replacement even
  when the target text is plainly present. This is a mechanical-defect
  signature, not a judgment one — a run that fails this way is worth the one
  retry, not an immediate park.
- Running three or more grok jobs at once trips a 429 rate-limit response on
  the team account. The concurrency below is pinned to 2 to stay clear of that
  ceiling.
- grok sometimes logs a line reading `AuthorizationRequired` even when
  authentication is completely fine. Seeing that line in a run's output is not,
  by itself, evidence of an auth failure.
- The `grok models` subcommand cannot be trusted to report authentication
  state — it has been observed to claim auth is broken when it is not. Only
  the auth smoke check below is trusted to establish whether grok is actually
  authenticated.
- grok auto-discovers and reads any `CLAUDE.md` file present in the repository
  it is invoked in, the same way Claude Code does. Nothing needs to hand it
  repo conventions separately.
- grok over-deletes behavioral tests the moment a task calls for judgment
  rather than mechanical work. Deleting or weakening a test that should have
  stayed red is the signature failure the driver's diff review exists to
  catch, and it is always a judgment defect — never a retry.

## Machine block

```yaml
id: grok
command: grok
models: [grok-build, grok-composer-2.5-fast]
worktree: driver-made
invocation: grok -m {model} --prompt-file {prompt} --cwd {worktree} --always-approve --no-subagents --max-turns 500 --output-format plain
availability: grok --version
auth_smoke:
  run: grok -p "say PONG" --max-turns 1
  expect: PONG
concurrency: 2
```

More lore, on the flags this playbook does and does not use:

- grok accepts an `--effort` flag (low through max) and parses it without
  error, but its effect on either model this playbook uses has not been
  observed. That absence of observed effect is why no `effort_flag` is set
  above — until an effect is confirmed, this playbook offers no per-task
  effort control.
- grok also offers a `--check` flag that runs a self-verification pass over
  its own work. This playbook deliberately never uses it: a CLI checking
  itself is still a self-report, and the driver's independent in-worktree
  verification is the only check that counts.
- grok exposes `--worktree` and `--worktree-ref` flags that claim to run
  natively against a given worktree and ref, but their behavior has not yet
  been observed in practice. Until a probe confirms they produce a usable
  isolated run, this playbook's `worktree` mode stays `driver-made` — the
  driver cuts and manages the worktree itself rather than handing that job to
  the CLI.
