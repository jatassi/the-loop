# Brief · worktree-setup

## Intent

Give agent worktrees a **configurable, per-project provisioning step** so that a build,
validate, or drive agent lands in a worktree that is already ready to run the project's
checks — instead of one it must repair itself.

Today `the-loop worktree-create` provisions dependencies exactly one way: it symlinks the
repo root's `node_modules` into the new worktree, best-effort, and swallows any failure
(`worktreeCreateCommand` → `linkNodeModules`, `plugin/bin/cli-commands.js`). That single
mechanism fails structurally across the situations the loop actually runs in:

- **Dead when there is no root install to link.** On a branch whose root `node_modules`
  does not exist yet, the symlink is skipped silently and every agent pays a full cold
  dependency install (observed: seven concurrent builders each paying a ~6-minute install
  on the same run).
- **Wrong for nested/workspace layouts.** In a monorepo with per-package `node_modules`,
  a single root symlink resolves nothing; agents lose their first check or first commit to
  a module-resolution failure, diagnose it, and run the install themselves — repeatedly,
  across many agents and many days.
- **A shared-mutable-store hazard.** The symlink points every concurrent worktree at *one
  physical* `node_modules`, so an agent that adds a dependency mutates the store its
  siblings are reading. A near-miss was observed where a stray `git stash -u` briefly
  stashed the symlink out from under the other worktrees.
- **A committing papercut.** A directory-only `.gitignore` rule (`node_modules/`) does not
  match a *symlink* named `node_modules`, so every committing agent re-reasons about not
  staging it.
- **Node-only.** A Rust, Python, or Go project gets nothing at all.

The fix is to replace this one hard-coded mechanism with a **worktree-setup hook**: a
configurable per-project command (`bun install`, `npm ci`, `cargo fetch`, `uv sync`, …)
that `worktree-create` runs in the freshly checked-out worktree, resolved through the same
hook-inventory machinery every other project binding already uses. Provisioning becomes
explicit, correct-per-worktree, language-agnostic, and — critically — **loud on failure**
rather than a silent skip the agents rediscover downstream.

## Users

The loop's own execution surfaces — the build, validate, and drive agents (and any human
or skill) that call `the-loop worktree-create` as the first act of working in an isolated
worktree. They are trying to reach a worktree where the project's own checks (`test`,
`lint`, typecheck, pre-commit) run without a manual repair step first.

Secondarily, the human configuring a project through `configure` / `onboard`, who wants
the loop to detect the project's install command and recommend it as the default binding.

## Scope envelope

One feature: introduce a `worktreeSetup` hook family and wire `worktree-create` to run its
bound command, with `configure`/`onboard` detecting and recommending a default. Retire the
`linkNodeModules` symlink in the same move.

**In scope:**

- A new settings-layer hook family, `worktreeSetup`, declared in the hook inventory and
  accepted by `hooks-set`, resolving across the existing `defaults < user < project <
  local` layers exactly like every other family.
- `worktree-create` runs the bound setup command in the new worktree's root **after
  checkout**, and **fails loudly** (non-zero exit, an environment-provisioning-shaped
  message naming the command, exit code, and stderr tail) when the command fails — so the
  calling agent surfaces it as an environment block, not a silent skip.
- Retiring `linkNodeModules`: an **unbound** `worktreeSetup` means `worktree-create` does
  no dependency provisioning at all (no symlink). The symlink mechanism is deleted, which
  simultaneously removes the shared-mutable-store hazard and the `.gitignore` papercut.
- `configure`/`onboard` project-type detection that recommends a default setup command
  from the tree (lockfile + manifest), offered as a recommended answer the human confirms.
- Migrating the-loop's own project: bind `worktreeSetup` to its own install command so its
  worktrees keep working after the symlink is gone.

**Out of scope:**

- Any provisioning beyond running one project-supplied command (no dependency caching
  strategy, no lockfile management, no toolchain installation the loop owns itself).
- Changing the worktree *creation* mechanism, the branch/base-branch logic, or
  `worktree-remove`.
- The general problem of long-running commands blowing the calling agent's Bash-tool
  timeout — this brief names the interaction and a minimal posture (below) but a full
  timeout doctrine for agent-invoked long commands is a separate concern.

**Noted for later:**

- Setup steps that are not a single command (multi-step provisioning, environment files,
  service bootstraps) — the command shape covers the install case; richer provisioning is
  a later intake if it proves needed.

## Decided

- **The mechanism becomes a hook family, not a hard-coded behavior.** The loop already
  owns a resolved hook inventory with families (interview, test harness, lint, pre-commit,
  notification, artifact stores, model bindings) each declared with a fallback-or-block
  posture, resolved across four settings layers, and set through `hooks-set <family>
  <layer> <json-value>`. A `worktreeSetup` family fits this pattern exactly and inherits
  its interview (`configure` detect → recommend → confirm) and its resolution for free.

- **Family shape is a single command.** `worktreeSetup` resolves to
  `{ "command": "<shell command>" }` (an optional `timeout` in milliseconds may accompany
  it — see the timeout posture below). One command, run from the worktree root. This is
  deliberately minimal: workspace-aware installs (`bun install`, `pnpm install
  --frozen-lockfile`, `npm ci`) already install every workspace package from the root, so a
  single root-level command covers monorepos without per-package configuration.

- **Unbound means no provisioning, and the symlink is retired.** Keeping the symlink as the
  unbound default would preserve the exact hazards this feature exists to kill (shared
  mutable store, `.gitignore` papercut, dead-when-no-root-install). So `linkNodeModules` is
  deleted outright: an unbound `worktreeSetup` provisions nothing, and a project that wants
  provisioning binds a command. This is a behavior change for any project relying on the
  symlink today; it is mitigated by `configure`/`onboard` actively recommending a binding
  and by the-loop binding its own.

- **Provisioning failure is a loud, environment-shaped block — never a silent skip.** The
  core defect being fixed is that failure today is swallowed and rediscovered later as a
  mysterious module-resolution error. A bound command that exits non-zero makes
  `worktree-create` exit non-zero with a self-contained message (command, exit code,
  stderr tail), framed as an environment-provisioning failure. The calling build/validate/
  drive agent then surfaces it through its existing environment-block lane rather than
  proceeding into a broken worktree.

- **Correct per-worktree installs replace a fragile shared symlink.** Each worktree getting
  its own real install is not the cold-install regression it appears to be: content-
  addressed package stores (bun's global cache, pnpm's store) hardlink packages into each
  worktree from a warm shared cache, so a per-worktree install is cheap after the first and
  — unlike the symlink — is isolated, so a sibling's dependency add cannot mutate it. The
  observed 6-minute installs were cold-*cache*, not an argument for sharing one mutable
  `node_modules`.

- **`configure`/`onboard` detect and recommend the default.** Project-type detection reads
  the tree — manifest plus lockfile — and recommends a setup command as a confirm-or-adjust
  answer, the same recommended-answer posture `configure` already uses for test harness and
  lint. Indicative mapping (Design finalizes the table):
  `bun.lockb` → `bun install`; `package-lock.json` → `npm ci`;
  `pnpm-lock.yaml` → `pnpm install --frozen-lockfile`;
  `yarn.lock` → `yarn install --frozen-lockfile`;
  `Cargo.toml` → `cargo fetch`; `uv.lock` → `uv sync`; `go.mod` → `go mod download`;
  nothing detected → leave unbound (no provisioning recommended).

- **The binding infers the `project` layer.** The install command is project truth the
  whole team shares, so `configure` infers `project` as its destination layer (with the
  standard per-answer override available), not a personal `user`/`local` preference.

## Deferred

- **Long-command timeout posture.** A real install can run for minutes, and
  `worktree-create` is invoked via the Bash tool, whose default timeout is short. Design
  decides the concrete mechanics: an internal subprocess timeout on `worktree-create` (with
  a timeout-shaped failure distinct from a command-error failure), an optional per-binding
  `timeout` field, and the guidance the calling surfaces need so they budget a generous
  Bash-tool timeout (or background the call) when a project has a slow setup command. The
  brief fixes the *posture* — long provisioning must fail with a clear timeout message, not
  hang or get cut mid-install — and leaves the mechanism to Design.

- **Provisioning on worktree reuse.** `worktree-create` early-returns when the target
  directory already exists (`created: false`). Whether to (re-)run setup on an existing
  worktree, skip it, or detect an incomplete install is a Design call; the default
  assumption here is "provision only on fresh create."

- **Exact detection table and precedence.** The indicative mapping above is a starting
  point; Design pins the full lockfile/manifest precedence (e.g. multiple lockfiles
  present) and the exact recommended commands.

- **Whether `worktreeSetup` ever wants a block posture.** Declared as a `fallback` family
  (unbound → no provisioning). Whether any project would want provisioning declared
  *mandatory* (unbound → a named gap that blocks) is left open; the fallback posture is the
  decided default.

## Assumptions

- The hook-inventory machinery (family declarations with fallback/block posture, four-layer
  resolution, `hooks-list`/`hooks-set`, and the `configure` detect→recommend→confirm
  interview) is the right and available substrate to add a family to; adding `worktreeSetup`
  is a declaration-plus-wiring change, not new configuration infrastructure.
- A single root-level, workspace-aware install command is sufficient for the monorepo case;
  no project in scope needs per-package provisioning commands.
- Retiring the symlink does not strand any project that cannot instead bind a setup command
  — every project the loop runs on has an install command expressible as one shell command,
  or genuinely needs no provisioning.
- Content-addressed store hardlinking makes per-worktree installs cheap enough that the loss
  of the symlink is not a material slowdown for the common (JS) case with a warm cache.

## Constraints

- **The one sanctioned worktree-creation path is kept.** `worktree-create` remains the
  single command agents call to make a worktree; this feature changes what it does *after*
  checkout, not that agents go through it.
- **Same settings substrate as every other family.** `worktreeSetup` persists under the
  namespaced `the-loop` settings key via `hooks-set`, resolves across `defaults < user <
  project < local`, and appears in `hooks-list` — no new configuration channel.
- **No new runtime dependency.** Provisioning runs a project-supplied shell command; the
  loop's tool does not bundle package managers or toolchains.
- **Self-contained, loud failures.** A provisioning failure message must be readable on its
  own (command, exit code, stderr tail) so a downstream agent can act on it without hunting
  through logs.

## Done looks like

- `worktreeSetup` appears in `hooks-list` with its resolved value, layer, and provenance,
  and can be set with `hooks-set worktreeSetup <layer> '{"command":"…"}'`, unrelated
  settings keys surviving the write untouched.
- With `worktreeSetup` bound to an install command, `worktree-create` on a fresh branch
  produces a worktree whose dependencies are already installed — an immediate project check
  (`test`/`lint`) runs without the agent installing anything first.
- When the bound command fails, `worktree-create` exits non-zero with a self-contained
  environment-provisioning message; the worktree is not silently handed back in a broken
  state.
- With `worktreeSetup` unbound, `worktree-create` creates the worktree and provisions
  nothing — and no `node_modules` symlink is created anywhere (the symlink mechanism is
  gone, and with it the shared-store hazard and the `.gitignore` papercut).
- `configure`/`onboard` on a JS project recommends the detected install command as the
  default `worktreeSetup` answer; on a Rust/Python/Go project it recommends that stack's
  fetch/sync command; on a project it cannot classify it recommends leaving it unbound.
- The-loop's own repo binds `worktreeSetup` so its agent worktrees remain provisioned after
  the symlink retirement, and its concurrent-worktree runs no longer share one physical
  dependency store.
