# grok

The first registered executor: a headless coding CLI the drive agent runs for
rote build tasks. This file is grok's playbook — the machine block below is
everything the resolver and pre-flight need to route to and check on grok; the
narrative around it is everything the drive agent needs to run grok well and
tell a real defect from a false alarm.

Operational lore, every item load-bearing:

- CLI updates can retire model ids without warning: grok 0.2.91 (2026-07-08)
  dropped `grok-build` — any invocation naming it fails immediately with
  "unknown model id" before doing work. When a rote task blocks with that
  error, check `grok models` against this playbook's list first.
- With `--json-schema`, grok emits ONE schema-conforming JSON object PER TURN,
  concatenated in the envelope's `text` field (interim narration included) —
  the LAST complete object is the verdict. Never `JSON.parse` the whole field.
- The JSON envelope carries no token usage (confirmed 0.2.91, session traces
  included); cost accounting must estimate from transcript characters at the
  published rates ($2/$6 per Mtok at launch).
- `grok export <session>` renders a conversation-only Markdown transcript
  locally. **`grok trace <session>` UPLOADS to xAI's trace service by
  default** — always pass `--local`.
- Bakeoff observations (2026-07-08, eval/results/full-2026-07-08): grok-4.5
  cleared every build-integrity trap that confined grok-build to rote
  (ADR-0031) — red-test discipline, no gaming, no suppressions, honest
  truncation — at ~2.4x sonnet's speed. Its one weakness: it applies contracts
  LITERALLY — it missed a lint suppression the validate contract didn't
  explicitly forbid, and recovered 3/3 the moment the contract named it. Spell
  judgment norms out in the brief; assume nothing is inherited from culture.

## Machine block

```yaml
id: grok
command: grok
models: [grok-4.5, grok-composer-2.5-fast]
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
  itself is still a self-report, and the drive agent's independent in-worktree
  verification is the only check that counts.
- grok exposes `--worktree` and `--worktree-ref` flags that claim to run
  natively against a given worktree and ref, but their behavior has not yet
  been observed in practice. Until a probe confirms they produce a usable
  isolated run, this playbook's `worktree` mode stays `driver-made` — the
  drive agent cuts and manages the worktree itself rather than handing that
  job to the CLI.
