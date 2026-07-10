# worktree-setup — per-project worktree provisioning hook

**Feature id:** `worktree-setup` · **Brief:** `docs/briefs/worktree-setup.md` ·
**Designed:** 2026-07-10 (ADR-0052)

## What it is

A new settings-layer hook family, `worktreeSetup`, that binds one project-supplied
shell command (`bun install`, `npm ci`, `cargo fetch`, `uv sync`, …) which
`the-loop worktree-create` runs in the freshly checked-out worktree root, after
checkout. Provisioning failure is a loud, self-contained, environment-shaped exit —
never a silent skip. The hard-coded `linkNodeModules` symlink (best-effort, node-only,
shared-mutable-store) is deleted in the same move: **unbound means no provisioning at
all**.

## How it fits

- **Configuration (ADR-0049):** `worktreeSetup` is an ordinary hook family — declared
  in `HOOK_INVENTORY`, resolved `defaults < user < project < local` under the
  namespaced `"the-loop"` settings key, visible in `hooks-list`, settable via
  `hooks-set`, and riding the execution context's `hooks` table automatically (the
  whole resolved table already does, `plugin/src/prepare-execution-context.js:100`).
- **Worktrees everywhere (ADR-0038):** `worktree-create` stays the one sanctioned
  creation path; this feature changes only what happens after checkout.
- **Configure/onboard:** the family joins the detect → recommend → confirm interview
  with the detection table below; the binding infers the `project` layer (install
  commands are project truth).

## Interfaces

**Family declaration** — `plugin/src/resolve-model-bindings.js`, `HOOK_INVENTORY`
(alongside `precommit: { fallback: { system: 'none' } }`):

```js
worktreeSetup: { fallback: { provisioning: 'none' } },
```

**Bound value shape** — the single entry a layer sets:

```json
{ "command": "npm ci", "timeout": 600000 }
```

`command` (required, string): run via the system shell with cwd = the new worktree
root, inheriting the process environment. `timeout` (optional, integer ms): kill
budget for the command; default **600000** (10 minutes). A bound entry whose
`command` is missing or not a string makes `worktree-create` exit 1 naming the
configuration gap (fail closed — never guess).

**Consumer wiring** — `worktreeCreateCommand` (`plugin/bin/cli-commands.js:365`)
resolves **only this family** (defaults from `plugin/config/hook-defaults.json` when
a key exists there, plus the three settings layers through the existing
`readSettingsLayer` + `resolveFamily`) — deliberately *not* `buildHooksTable()`, so a
malformed `modelBindings` elsewhere in settings can never break worktree creation.
No `worktreeSetup` key is added to `hook-defaults.json`: absent → `undefined` → the
inventory fallback, same as `interview` before it was written there.

Sequencing inside `worktreeCreateCommand`:

1. Early-return path (`created: false`) — unchanged, **no provisioning** (see Reuse).
2. `git worktree add …` — unchanged.
3. Resolved `command` present → run it (shell, cwd = new worktree, timeout applied).
   - success → `out({ path, branch, created: true })` — output shape unchanged.
   - failure → tear down + loud exit (below).
4. No `command` (fallback) → step 3 skipped entirely. `linkNodeModules` is deleted.

**Failure contract** — on non-zero exit, spawn error, or timeout, `worktree-create`:

1. removes the worktree it just created (`git worktree remove --force` + `prune`;
   the branch survives — branches carry state, worktrees are disposable), and
2. exits 1 with a self-contained **environment-provisioning** message carrying: the
   phrase `worktree provisioning failed`, the command, the worktree path, the
   binding's layer, and **either** the exit code **or** `timed out after <n>ms`
   (timeout is a distinct failure kind, never reported as an exit code), then a
   stderr tail (last ~2000 characters).

The calling build/validate/drive agent surfaces this through its existing
environment-block lane; the teardown preserves the invariant that **an existing
worktree directory was fully provisioned when created**, so the `created: false`
early return is always safe to leave unprovisioned and a re-run retries fresh.

## Decisions Design pinned (the brief's deferred items)

- **Timeout mechanics.** Internal subprocess timeout on the setup command, default
  600000 ms, per-binding `timeout` override in ms. Timeout failure is worded
  distinctly from command failure. Calling surfaces budget for it: every agent
  surface that instructs running `worktree-create` (build.md, drive.md, plan.md,
  validate.md, record.md — the project-local `.claude/agents/` copies mirror the
  plugin ones) gains one line: give the call a generous Bash-tool timeout (600000 ms)
  because it may run the project's provisioning command. The general
  long-command-timeout doctrine stays out of scope (brief).
- **Reuse.** Provision only on fresh create. `created: false` never re-runs setup;
  the teardown-on-failure rule is what makes that sound. A worktree predating this
  feature (or hand-made) is not retro-provisioned — accepted edge.
- **Block posture.** `worktreeSetup` is a fallback family, full stop. No project
  needs provisioning declared mandatory: a project that wants provisioning binds a
  command; unbound-means-nothing is correct for the no-provisioning majority.
- **Detection table** (configure/onboard interview; first match wins, `ni`-style
  precedence within JS):

  | evidence | recommended command |
  |---|---|
  | `bun.lockb` or `bun.lock` | `bun install` |
  | `pnpm-lock.yaml` | `pnpm install --frozen-lockfile` |
  | `yarn.lock` | `yarn install --frozen-lockfile` |
  | `package-lock.json` | `npm ci` |
  | `package.json`, no lockfile | `npm install` |
  | `Cargo.toml` | `cargo fetch` |
  | `uv.lock` | `uv sync` |
  | `poetry.lock` | `poetry install` |
  | `go.mod` | `go mod download` |
  | bare `requirements.txt` | leave unbound (venv-ambiguous — no safe recommendation) |
  | nothing classifiable | leave unbound |

  Polyglot repos: one command per detected stack, joined with ` && ` in table order
  (e.g. this repo: `npm ci && cargo fetch`). Always recommend-confirm, inferred
  destination layer `project`, standard per-answer override.

## Self-migration (ordered last in the build)

Bind this repo's own `worktreeSetup` at the `project` layer
(`.claude/settings.json` is tracked, so the binding travels into every worktree):

```sh
the-loop hooks-set worktreeSetup project '{"command":"npm ci && cargo fetch"}'
```

This must land **after** the family exists (`hooks-set` validates against
`HOOK_FAMILIES`) and in the same feature as the symlink deletion, so this repo's
concurrent-worktree runs never pass through an unprovisioned window.

## Build surfaces

- `plugin/src/resolve-model-bindings.js` — `HOOK_INVENTORY` entry.
- `plugin/bin/hooks-commands.js` — add `worktreeSetup` to `HOOK_FAMILIES`.
- `plugin/bin/cli-commands.js` — wire `worktreeCreateCommand`; delete
  `linkNodeModules` (and its now-unused `symlinkSync` import if orphaned).
- `plugin/skills/configure/SKILL.md` — family shape in the list (§2) + detection
  table; `plugin/skills/onboard/SKILL.md` only if it duplicates the family list
  rather than deferring to configure's leg.
- Agent files (plugin + `.claude/agents/` copies) — the one-line timeout budget.
- Tests: unit coverage for bound-success, bound-failure (message contents +
  teardown), timeout wording, unbound-no-symlink, malformed-binding refusal;
  `hooks-set worktreeSetup` write survival. **Oracle:** add a `worktree-create`
  refusal case (bound failing command) — the corpus currently has zero refusal
  cases for this verb (flagged in `docs/calibration/index.md`) — plus a bound-success
  case; new cases may ride the Rust pending allowlist.
- `.claude/settings.json` — the self-binding.

## Cross-feature notes

- **Rust replatform (ADR-0051):** parity is defined as JSON-equality against the JS
  CLI via the oracle, so `run-commands-rust` (worktree verbs) and
  `config-commands-rust` (`hooks-set` family list) inherit this behavior through the
  corpus — the new oracle cases are the transfer mechanism; no separate Rust design
  amendment needed while those features are unbuilt.
- **Behavior change:** any project silently relying on the symlink loses it; the
  mitigation is configure/onboard actively recommending a binding, plus this repo's
  own self-binding landing atomically with the deletion.
