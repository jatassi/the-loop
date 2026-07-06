# executor-delegation — rote tasks driven through registered CLI executors

**Status:** shipped (designed 2026-07-03, ADR-0031; collapsed into the build path
by ADR-0040).

## What it is

Route rote-judgment-level tasks to a cheap CLI executor instead of a full agent — the binding
table stays the single routing surface: `build.rote: { model: grok-build, executor:
grok }` routes to the **drive** agent; no separate delegation switch.

- **Registry** — `docs/executors/<id>.md` playbooks: narrative lore around one fenced
  yaml machine block (id, command, models, invocation template, availability
  command, concurrency; parsed pure in `src/executor-registry.js`; `the-loop
  executors-list` prints the registry). A malformed playbook is a hard spine
  error.
- **The drive agent** (agents/drive.md) — a thin build-path variant: same worktree,
  same task brief, same integrity lines. It assembles the executor prompt from the
  task brief, runs the CLI headless, then verifies at the build bar — the executor's
  self-report counts for nothing (grok reports success even when truncated): tests,
  lint, diff inside the footprint. One retry with the failure fed back; then the
  standard blocked return. Commit subject gains ` (via <executor>)`.
- **Failure typing** — executor auth/availability failure at use is an ordinary
  environment-shaped halt. There is **no pre-flight check during run preparation**
  (ADR-0040 deleted the auth smoke formerly run at each run-preparation step).

## Grok lore (v1 dogfood record, still true)

Models `grok-build` / `grok-composer-2.5-fast` (CLI default is Composer — always
pass the model explicitly). Invocation `grok -m {model} --prompt-file {prompt}
--cwd {worktree} --always-approve --no-subagents --max-turns 500 --output-format
plain`; availability `grok --version`. Commits last — truncation looks like
stopped-without-committing; `search_replace` flakes on large repetitive files; 429
at ≥3 concurrent; over-deletes behavioral tests when judgment is required (why
`rote` requires correctness fully captured by tests + lint).
