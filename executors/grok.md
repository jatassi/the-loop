# grok

The first registered executor: a headless coding CLI the drive agent runs for
rote build tasks. This file is grok's playbook — the machine block below is
everything the resolver and pre-flight need to route to and check on grok; the
narrative around it is everything the drive agent needs to run grok well and
tell a real defect from a false alarm.

Operational lore, every item load-bearing:

- none yet, populate as you observe noteworthy behaviors

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
